import type { ClaimedDelivery } from "@filo/contracts";
import type { WorkerConfig } from "./config.js";
import { WorkerApiClient, type WorkerScope } from "./api-client.js";
import { dispatchDelivery, type DispatchResult } from "./providers.js";

type SafeLogger = {
  info(details: Record<string, unknown>, message: string): void;
  warn(details: Record<string, unknown>, message: string): void;
};

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function minuteBucket(now = new Date()) {
  return now.toISOString().slice(0, 16).replace("T", ":");
}

async function completeWithRetry(
  client: WorkerApiClient,
  scope: WorkerScope,
  delivery: ClaimedDelivery,
  result: DispatchResult,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await client.complete(scope, delivery, result);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 250);
    }
  }
  throw lastError;
}

export async function runDeliveryCycle(
  client: WorkerApiClient,
  config: WorkerConfig,
  logger: SafeLogger,
  environment: Record<string, string | undefined> = process.env,
  providerRequest: typeof fetch = fetch,
) {
  const scopes = await client.scopes();
  let claimed = 0;
  let completed = 0;
  let deferredScopes = 0;
  for (const scope of scopes) {
    let deliveries: ClaimedDelivery[];
    try {
      deliveries = await client.claim(scope);
    } catch {
      deferredScopes += 1;
      logger.warn({ tenantId: scope.tenantId }, "tenant delivery cycle deferred");
      continue;
    }
    claimed += deliveries.length;
    for (const delivery of deliveries) {
      const result = await dispatchDelivery(delivery, config, environment, providerRequest);
      try {
        await completeWithRetry(client, scope, delivery, result);
        completed += 1;
      } catch {
        logger.warn({ tenantId: scope.tenantId, deliveryId: delivery.id }, "delivery completion deferred");
      }
    }
  }
  return { scopes: scopes.length, claimed, completed, deferredScopes };
}

export async function runSchedulerCycle(client: WorkerApiClient, logger: SafeLogger, now = new Date()) {
  const scopes = await client.scopes();
  const bucket = minuteBucket(now);
  let completed = 0;
  for (const scope of scopes) {
    try {
      const jobs = await client.runScheduledMaintenance(scope, bucket);
      if (jobs.failed > 0) {
        logger.warn({ tenantId: scope.tenantId, bucket, failedJobs: jobs.failed }, "scheduled maintenance partially deferred");
      }
      if (jobs.completed > 0) completed += 1;
    } catch {
      logger.warn({ tenantId: scope.tenantId, bucket }, "scheduled maintenance deferred");
    }
  }
  return { scopes: scopes.length, completed, bucket };
}

export async function runWorker(
  client: WorkerApiClient,
  config: WorkerConfig,
  logger: SafeLogger,
  signal: AbortSignal,
) {
  let nextSchedulerAt = 0;
  while (!signal.aborted) {
    try {
      const delivery = await runDeliveryCycle(client, config, logger);
      if (delivery.claimed > 0) logger.info(delivery, "delivery cycle completed");
      if (config.schedulerEnabled && Date.now() >= nextSchedulerAt) {
        const maintenance = await runSchedulerCycle(client, logger);
        logger.info(maintenance, "scheduler cycle completed");
        nextSchedulerAt = Date.now() + config.schedulerIntervalMs;
      }
    } catch {
      logger.warn({}, "worker cycle deferred");
    }
    await Promise.race([
      sleep(config.pollIntervalMs),
      new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true })),
    ]);
  }
}
