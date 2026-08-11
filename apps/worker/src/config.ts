type RuntimeEnvironment = Record<string, string | undefined>;

function invalid(label: string): never {
  throw new Error(`Invalid worker configuration: ${label}`);
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

function absoluteApiUrl(rawValue: string | undefined, production: boolean) {
  if (!rawValue) invalid("WORKER_API_URL is required");
  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    invalid("WORKER_API_URL must be an absolute HTTP(S) origin");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    invalid("WORKER_API_URL must be an absolute HTTP(S) origin without a path");
  }
  if (production && parsed.protocol !== "https:") {
    invalid("WORKER_API_URL must use HTTPS in production");
  }
  return parsed.origin;
}

function boundedSecret(name: string, value: string | undefined, production: boolean) {
  if (!value || value.length < 32) invalid(`${name} must contain at least 32 characters`);
  if (production && /^(replace[-_ ]with|change[-_ ]me|example|placeholder)/iu.test(value)) {
    invalid(`${name} must not use a placeholder value`);
  }
  return value;
}

export function loadWorkerConfig(environment: RuntimeEnvironment = process.env) {
  const nodeEnv = environment.NODE_ENV ?? "development";
  if (!new Set(["development", "test", "production"]).has(nodeEnv)) {
    invalid("NODE_ENV must be development, test or production");
  }
  const production = nodeEnv === "production";
  const allowDryRun = booleanValue("WORKER_ALLOW_DRY_RUN", environment.WORKER_ALLOW_DRY_RUN, false);
  if (production && allowDryRun) invalid("WORKER_ALLOW_DRY_RUN must be false in production");
  const emailFrom = environment.EMAIL_FROM?.trim() ?? "";
  if (production && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(emailFrom)) {
    invalid("EMAIL_FROM must be a valid address in production");
  }

  return Object.freeze({
    nodeEnv,
    apiUrl: absoluteApiUrl(environment.WORKER_API_URL, production),
    workerKey: boundedSecret("NOTIFICATION_WORKER_KEY", environment.NOTIFICATION_WORKER_KEY, production),
    workerId: environment.NOTIFICATION_WORKER_ID?.trim().match(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/u)?.[0]
      ?? invalid("NOTIFICATION_WORKER_ID must use safe identifier characters"),
    pollIntervalMs: boundedInteger("WORKER_POLL_INTERVAL_MS", environment.WORKER_POLL_INTERVAL_MS, 5_000, 1_000, 60_000),
    schedulerIntervalMs: boundedInteger("WORKER_SCHEDULER_INTERVAL_MS", environment.WORKER_SCHEDULER_INTERVAL_MS, 300_000, 60_000, 3_600_000),
    providerTimeoutMs: boundedInteger("WORKER_PROVIDER_TIMEOUT_MS", environment.WORKER_PROVIDER_TIMEOUT_MS, 15_000, 1_000, 120_000),
    batchSize: boundedInteger("WORKER_BATCH_SIZE", environment.WORKER_BATCH_SIZE, 25, 1, 100),
    schedulerEnabled: booleanValue("WORKER_SCHEDULER_ENABLED", environment.WORKER_SCHEDULER_ENABLED, true),
    allowDryRun,
    emailFrom,
  });
}

export type WorkerConfig = ReturnType<typeof loadWorkerConfig>;
