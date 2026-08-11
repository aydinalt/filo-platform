import type { ClaimedDelivery } from "@filo/contracts";
import type { WorkerConfig } from "./config.js";

export type DispatchResult =
  | { outcome: "delivered"; providerMessageId: string; error: null }
  | { outcome: "failed"; providerMessageId: null; error: string };

function failure(error: string): DispatchResult {
  return { outcome: "failed", providerMessageId: null, error };
}

export async function dispatchDelivery(
  delivery: ClaimedDelivery,
  config: WorkerConfig,
  environment: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch,
): Promise<DispatchResult> {
  if (delivery.provider === "dry_run") {
    if (!config.allowDryRun) return failure("DRY_RUN_PROVIDER_DISABLED");
    return { outcome: "delivered", providerMessageId: `dry-run-${delivery.id}`, error: null };
  }
  if (delivery.channel !== "email" || delivery.provider !== "resend") {
    return failure("UNSUPPORTED_PROVIDER");
  }
  const credential = environment[delivery.credentialEnvRef];
  if (!credential || credential.length < 16 || !config.emailFrom) {
    return failure("PROVIDER_CONFIG_MISSING");
  }
  try {
    const response = await request("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: config.emailFrom,
        to: [delivery.recipientEmail],
        subject: delivery.title,
        text: delivery.message,
      }),
      signal: AbortSignal.timeout(config.providerTimeoutMs),
    });
    if (!response.ok) {
      if (response.status === 429) return failure("PROVIDER_RATE_LIMITED");
      if (response.status >= 500) return failure("PROVIDER_UNAVAILABLE");
      return failure("PROVIDER_REJECTED");
    }
    const body = await response.json().catch(() => ({})) as { id?: unknown };
    if (typeof body.id !== "string" || body.id.length < 1 || body.id.length > 240) {
      return failure("PROVIDER_RESPONSE_INVALID");
    }
    return { outcome: "delivered", providerMessageId: body.id, error: null };
  } catch (error) {
    return failure(error instanceof Error && error.name === "TimeoutError"
      ? "PROVIDER_TIMEOUT"
      : "PROVIDER_REQUEST_FAILED");
  }
}
