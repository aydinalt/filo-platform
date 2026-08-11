import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ClaimedDelivery } from "@filo/contracts";
import { loadWorkerConfig } from "../src/config.js";
import { dispatchDelivery } from "../src/providers.js";

const config = loadWorkerConfig({
  NODE_ENV: "test",
  WORKER_API_URL: "http://localhost:3001",
  NOTIFICATION_WORKER_KEY: "worker-test-secret-at-least-32-characters",
  NOTIFICATION_WORKER_ID: "worker-test-1",
  EMAIL_FROM: "noreply@example.com",
});
const delivery: ClaimedDelivery = {
  id: "10000000-0000-4000-8000-000000000001",
  leaseToken: "20000000-0000-4000-8000-000000000001",
  notificationId: "30000000-0000-4000-8000-000000000001",
  recipientUserId: "40000000-0000-4000-8000-000000000001",
  recipientEmail: "recipient@example.com",
  channel: "email",
  providerProfileId: "50000000-0000-4000-8000-000000000001",
  provider: "resend",
  credentialEnvRef: "FILO_EMAIL_PROVIDER_KEY",
  locale: "tr-TR",
  title: "Bakım uyarısı",
  message: "Araç bakım tarihi yaklaşıyor.",
  attemptCount: 1,
  leaseExpiresAt: new Date(Date.now() + 300_000).toISOString(),
};

describe("notification provider dispatch", () => {
  it("sends a bounded Resend request without exposing the credential in the result", async () => {
    const result = await dispatchDelivery(delivery, config, { FILO_EMAIL_PROVIDER_KEY: "provider-secret-at-least-16" }, async (url, init) => {
      assert.equal(url, "https://api.resend.com/emails");
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer provider-secret-at-least-16");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        from: "noreply@example.com",
        to: ["recipient@example.com"],
        subject: "Bakım uyarısı",
        text: "Araç bakım tarihi yaklaşıyor.",
      });
      return new Response(JSON.stringify({ id: "resend-message-1" }), { status: 200 });
    });
    assert.deepEqual(result, { outcome: "delivered", providerMessageId: "resend-message-1", error: null });
  });

  it("maps provider and configuration failures to bounded codes", async () => {
    assert.equal((await dispatchDelivery(delivery, config, {})).error, "PROVIDER_CONFIG_MISSING");
    assert.equal((await dispatchDelivery(delivery, config, { FILO_EMAIL_PROVIDER_KEY: "provider-secret-at-least-16" }, async () => new Response("", { status: 429 }))).error, "PROVIDER_RATE_LIMITED");
    assert.equal((await dispatchDelivery({ ...delivery, provider: "unknown" }, config)).error, "UNSUPPORTED_PROVIDER");
  });
});
