type RuntimeEnvironment = Record<string, string | undefined>;

const NODE_ENVIRONMENTS = new Set(["development", "test", "production"]);

function invalid(label: string): never {
  throw new Error(`Invalid runtime configuration: ${label}`);
}

function boundedInteger(
  name: string,
  rawValue: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const value = rawValue ?? String(fallback);
  if (!/^\d+$/u.test(value)) invalid(`${name} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    invalid(`${name} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function booleanValue(name: string, rawValue: string | undefined, fallback: boolean) {
  const value = rawValue ?? String(fallback);
  if (value !== "true" && value !== "false") invalid(`${name} must be true or false`);
  return value === "true";
}

function webOrigin(rawValue: string | undefined, production: boolean) {
  const value = rawValue ?? "http://localhost:5173";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    invalid("WEB_ORIGIN must be an absolute HTTP(S) origin");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    invalid("WEB_ORIGIN must be an absolute HTTP(S) origin without a path");
  }
  if (production && parsed.protocol !== "https:") {
    invalid("WEB_ORIGIN must use HTTPS in production");
  }
  return parsed.origin;
}

function isPlaceholderSecret(value: string) {
  return /^(replace[-_ ]with|change[-_ ]me|example|placeholder)/iu.test(value);
}

function secretValue(
  name: string,
  rawValue: string | undefined,
  { required, rejectPlaceholder }: { required: boolean; rejectPlaceholder: boolean },
) {
  const value = rawValue ?? "";
  if (!value && !required) return "";
  if (value.length < 32) invalid(`${name} must contain at least 32 characters`);
  if (rejectPlaceholder && isPlaceholderSecret(value)) {
    invalid(`${name} must not use a placeholder value`);
  }
  return value;
}

function assertProductionDatabaseUrl(rawValue: string | undefined) {
  if (!rawValue) invalid("DATABASE_URL is required in production");
  try {
    const parsed = new URL(rawValue);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname) {
      invalid("DATABASE_URL must be a PostgreSQL URL");
    }
  } catch {
    invalid("DATABASE_URL must be a PostgreSQL URL");
  }
}

export function loadConfig(environment: RuntimeEnvironment = process.env) {
  const nodeEnv = environment.NODE_ENV ?? "development";
  if (!NODE_ENVIRONMENTS.has(nodeEnv)) {
    invalid("NODE_ENV must be development, test or production");
  }
  const production = nodeEnv === "production";
  const trustProxyHops = boundedInteger(
    "TRUST_PROXY_HOPS",
    environment.TRUST_PROXY_HOPS,
    0,
    0,
    2,
  );
  const cookieSecure = booleanValue("COOKIE_SECURE", environment.COOKIE_SECURE, false);
  if (production && !cookieSecure) invalid("COOKIE_SECURE must be true in production");
  if (production) assertProductionDatabaseUrl(environment.DATABASE_URL);
  const sessionSecret = secretValue("SESSION_SECRET", environment.SESSION_SECRET, {
    required: true,
    rejectPlaceholder: production,
  });
  const notificationWorkerKey = secretValue(
    "NOTIFICATION_WORKER_KEY",
    environment.NOTIFICATION_WORKER_KEY,
    { required: production, rejectPlaceholder: production },
  );
  const notificationWebhookSecret = secretValue(
    "NOTIFICATION_WEBHOOK_SECRET",
    environment.NOTIFICATION_WEBHOOK_SECRET,
    { required: production, rejectPlaceholder: production },
  );
  if (
    production &&
    new Set([sessionSecret, notificationWorkerKey, notificationWebhookSecret]).size !== 3
  ) {
    invalid("production secrets must be unique");
  }

  return Object.freeze({
    nodeEnv,
    port: boundedInteger("PORT", environment.PORT, 3001, 1, 65_535),
    trustProxyHops,
    requestBodyLimitBytes: boundedInteger(
      "REQUEST_BODY_LIMIT_BYTES",
      environment.REQUEST_BODY_LIMIT_BYTES,
      1_048_576,
      16_384,
      5_242_880,
    ),
    requestTimeoutMs: boundedInteger(
      "REQUEST_TIMEOUT_MS",
      environment.REQUEST_TIMEOUT_MS,
      15_000,
      1_000,
      120_000,
    ),
    webOrigin: webOrigin(environment.WEB_ORIGIN, production),
    sessionSecret,
    sessionTtlHours: boundedInteger(
      "SESSION_TTL_HOURS",
      environment.SESSION_TTL_HOURS,
      12,
      1,
      168,
    ),
    cookieSecure,
    notificationWorkerKey,
    notificationWebhookSecret,
  });
}

export const config = loadConfig();
