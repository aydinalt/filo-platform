import { createHmac } from "node:crypto";
import { pool } from "@filo/database";
import { config } from "../config.js";

type LoginRateLimitScope = "ip" | "account";

type RateLimitQuery = (
  sql: string,
  values: unknown[],
) => Promise<{ rows: Array<{ limited: boolean; retryAfter: number }> }>;

type LoginRateLimitResult = {
  limited: boolean;
  retryAfter: number;
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
  RETURNING attempt_count, expires_at
)
SELECT attempt_count > $3::integer AS limited,
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
  query: RateLimitQuery = (sql, values) => pool.query(sql, values),
): Promise<LoginRateLimitResult> {
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

export async function clearLoginRateLimitBucket(
  scope: LoginRateLimitScope,
  value: string,
  query: RateLimitQuery = (sql, values) => pool.query(sql, values),
): Promise<void> {
  await query(
    `DELETE FROM auth_login_rate_limits
     WHERE scope = $1 AND key_hash = $2`,
    [scope, loginRateLimitKey(scope, value)],
  );
}

export async function consumePersistentLoginAttempt(
  clientIp: string,
  normalizedEmail: string,
  query?: RateLimitQuery,
): Promise<LoginRateLimitResult> {
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
  };
}
