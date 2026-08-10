import { createHmac } from "node:crypto";
import { pool } from "@filo/database";
import { config } from "../config.js";

type LoginRateLimitScope = "ip" | "account";

type RateLimitBucketQuery = (
  sql: string,
  values: unknown[],
) => Promise<{ rows: LoginRateLimitBucketResult[] }>;

type RateLimitMutationQuery = (
  sql: string,
  values: unknown[],
) => Promise<{ rows: unknown[] }>;

type LoginRateLimitResult = {
  limited: boolean;
  retryAfter: number;
};

type LoginRateLimitSnapshot = {
  attemptCount: number;
  windowStartedAt: string;
};

type LoginRateLimitBucketResult = LoginRateLimitResult & LoginRateLimitSnapshot;

type PersistentLoginRateLimitResult = LoginRateLimitResult & {
  accountSnapshot: LoginRateLimitSnapshot;
};

const bucketSql = `WITH stale AS (
  SELECT scope, key_hash
  FROM auth_login_rate_limits
  WHERE expires_at < now() - interval '1 day'
    AND (scope <> $1 OR key_hash <> $2)
  ORDER BY expires_at, scope, key_hash
  LIMIT 100
), removed AS (
  DELETE FROM auth_login_rate_limits AS bucket
  USING stale
  WHERE bucket.scope = stale.scope AND bucket.key_hash = stale.key_hash
), attempt AS (
  INSERT INTO auth_login_rate_limits (
    scope, key_hash, attempt_count, window_started_at, expires_at
  )
  VALUES ($1, $2, 1, now(), now() + ($4::integer * interval '1 millisecond'))
  ON CONFLICT (scope, key_hash) DO UPDATE
  SET attempt_count = CASE
        WHEN auth_login_rate_limits.expires_at <= now() THEN 1
        ELSE auth_login_rate_limits.attempt_count + 1
      END,
      window_started_at = CASE
        WHEN auth_login_rate_limits.expires_at <= now() THEN now()
        ELSE auth_login_rate_limits.window_started_at
      END,
      expires_at = CASE
        WHEN auth_login_rate_limits.expires_at <= now()
          THEN now() + ($4::integer * interval '1 millisecond')
        ELSE auth_login_rate_limits.expires_at
      END
  RETURNING attempt_count, window_started_at, expires_at
)
SELECT attempt_count > $3::integer AS limited,
       attempt_count AS "attemptCount",
       window_started_at::text AS "windowStartedAt",
       GREATEST(1, CEIL(EXTRACT(EPOCH FROM expires_at - now())))::integer AS "retryAfter"
FROM attempt`;

export function loginRateLimitKey(scope: LoginRateLimitScope, value: string) {
  return createHmac("sha256", config.sessionSecret)
    .update(`filo-login-rate-limit-v1:${scope}:${value}`)
    .digest("hex");
}

export async function consumeLoginRateLimitBucket(
  scope: LoginRateLimitScope,
  value: string,
  maxAttempts: number,
  windowMs: number,
  query: RateLimitBucketQuery = (sql, values) => pool.query(sql, values),
): Promise<LoginRateLimitBucketResult> {
  const result = await query(bucketSql, [
    scope,
    loginRateLimitKey(scope, value),
    maxAttempts,
    windowMs,
  ]);
  const row = result.rows[0];
  if (!row) throw new Error("Login rate limit result is missing");
  return row;
}

export async function clearUnchangedLoginRateLimitBucket(
  scope: LoginRateLimitScope,
  value: string,
  snapshot: LoginRateLimitSnapshot,
  query: RateLimitMutationQuery = (sql, values) => pool.query(sql, values),
): Promise<void> {
  await query(
    `DELETE FROM auth_login_rate_limits
     WHERE scope = $1 AND key_hash = $2
       AND attempt_count = $3 AND window_started_at = $4::timestamptz`,
    [
      scope,
      loginRateLimitKey(scope, value),
      snapshot.attemptCount,
      snapshot.windowStartedAt,
    ],
  );
}

export async function consumePersistentLoginAttempt(
  clientIp: string,
  normalizedEmail: string,
  query?: RateLimitBucketQuery,
): Promise<PersistentLoginRateLimitResult> {
  const ipBucket = await consumeLoginRateLimitBucket(
    "ip",
    clientIp,
    config.authLoginRateLimitMax,
    config.authLoginRateLimitWindowMs,
    query,
  );
  const accountBucket = await consumeLoginRateLimitBucket(
    "account",
    normalizedEmail,
    config.authLoginRateLimitMax,
    config.authLoginRateLimitWindowMs,
    query,
  );
  return {
    limited: ipBucket.limited || accountBucket.limited,
    retryAfter: Math.max(ipBucket.retryAfter, accountBucket.retryAfter),
    accountSnapshot: {
      attemptCount: accountBucket.attemptCount,
      windowStartedAt: accountBucket.windowStartedAt,
    },
  };
}
