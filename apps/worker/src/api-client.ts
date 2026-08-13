import type { ClaimedDelivery } from "@filo/contracts";
import type { WorkerConfig } from "./config.js";

export type WorkerScope = { tenantId: string; actorUserId: string };
type Completion = {
  outcome: "delivered" | "failed";
  providerMessageId: string | null;
  error: string | null;
};

export class WorkerApiError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = "WorkerApiError";
  }
}

export class WorkerApiClient {
  constructor(
    private readonly config: WorkerConfig,
    private readonly request: typeof fetch = fetch,
  ) {}

  private async call<T>(path: string, init: RequestInit = {}) {
    const response = await this.request(`${this.config.apiUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-worker-key": this.config.workerKey,
        ...init.headers,
      },
      signal: AbortSignal.timeout(this.config.providerTimeoutMs),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: unknown };
      const code = typeof body.error === "string" && /^[A-Z][A-Z0-9_:-]{2,79}$/u.test(body.error)
        ? body.error
        : "WORKER_API_REQUEST_FAILED";
      throw new WorkerApiError(code, response.status);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  }

  async scopes() {
    return (await this.call<{ scopes: WorkerScope[] }>("/api/internal/notification-worker-scopes/")).scopes;
  }

  async claim(scope: WorkerScope) {
    return (await this.call<{ deliveries: ClaimedDelivery[] }>("/api/internal/notification-worker/claim", {
      method: "POST",
      body: JSON.stringify({ ...scope, workerId: this.config.workerId, limit: this.config.batchSize }),
    })).deliveries;
  }

  async complete(scope: WorkerScope, delivery: ClaimedDelivery, result: Completion) {
    await this.call<void>(`/api/internal/notification-worker/${delivery.id}/complete`, {
      method: "POST",
      body: JSON.stringify({
        ...scope,
        workerId: this.config.workerId,
        leaseToken: delivery.leaseToken,
        ...result,
      }),
    });
  }

  async runScheduledMaintenance(scope: WorkerScope, bucket: string) {
    const jobs: Array<[string, Record<string, string>]> = [
      ["/api/internal/notification-health-scans/run", { ...scope, scanKey: `health:${bucket}` }],
      ["/api/internal/notification-retention/run", { ...scope, runKey: `archive:${bucket}` }],
      ["/api/internal/notification-retention/reconcile-attempts", { ...scope, reconciliationKey: `reconcile:${bucket}` }],
      ["/api/internal/notification-retention/notify-overdue-reconciliations", { ...scope, runKey: `reminders:${bucket}` }],
      ["/api/internal/notification-retention/reconcile-interrupted-reminder-runs", { ...scope, maintenanceKey: `maintenance:${bucket}` }],
      ["/api/internal/mobile-release-guard/run", { ...scope, runKey: `mobile-release-guard:${bucket}` }],
    ];
    let completed = 0;
    let failed = 0;
    for (const [path, body] of jobs) {
      try {
        await this.call(path, { method: "POST", body: JSON.stringify(body) });
        completed += 1;
      } catch {
        failed += 1;
      }
    }
    return { completed, failed };
  }
}
