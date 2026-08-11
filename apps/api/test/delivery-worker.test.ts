import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";

process.env.SESSION_SECRET = "delivery-worker-test-session-secret-at-least-32-characters";
process.env.NOTIFICATION_WORKER_KEY =
  "delivery-worker-test-worker-secret-at-least-32-characters";

const {
  cancelPreferenceDisabledQueuedDeliveries,
  cancelSuppressedQueuedDeliveries,
  cancelInactiveRecipientDeliveries,
  claimDeliveryBatch,
  completeClaimedDelivery,
  findCompletionReceipt,
  isCompletionReplayConsistent,
  isCompletionProviderMessageIdConsistent,
  isOperationalDeliveryWorkerActor,
  lockDeliveryForCompletion,
  reconcileExpiredDeliveryLeases,
  renewClaimedDeliveryLease,
  deliveryWorkerRoutes,
} = await import("../src/routes/delivery-worker.js");

describe("notification delivery worker lifecycle", () => {
  it("rejects a malformed completion identity before database work", async () => {
    const app = Fastify();
    await app.register(deliveryWorkerRoutes, { prefix: "/notification-worker" });
    const response = await app.inject({
      method: "POST",
      url: "/notification-worker/not-a-delivery/complete",
      headers: {
        "x-worker-key": process.env.NOTIFICATION_WORKER_KEY!,
      },
      payload: {
        tenantId: "10000000-0000-4000-8000-000000000001",
        actorUserId: "20000000-0000-4000-8000-000000000002",
        workerId: "worker-primary",
        leaseToken: "40000000-0000-4000-8000-000000000004",
        outcome: "delivered",
        providerMessageId: "provider-message-1",
      },
    });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { error: "INVALID_COMPLETION_REQUEST" });
    await app.close();
  });

  it("rejects a malformed lease renewal identity before database work", async () => {
    const app = Fastify();
    await app.register(deliveryWorkerRoutes, { prefix: "/notification-worker" });
    const response = await app.inject({
      method: "POST",
      url: "/notification-worker/not-a-delivery/lease/renew",
      headers: {
        "x-worker-key": process.env.NOTIFICATION_WORKER_KEY!,
      },
      payload: {
        tenantId: "10000000-0000-4000-8000-000000000001",
        actorUserId: "20000000-0000-4000-8000-000000000002",
        workerId: "worker-primary",
        leaseToken: "40000000-0000-4000-8000-000000000004",
      },
    });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { error: "INVALID_LEASE_RENEWAL_REQUEST" });
    await app.close();
  });

  it("requires an active operational tenant membership", async () => {
    const tenantId = "10000000-0000-4000-8000-000000000001";
    const actorUserId = "20000000-0000-4000-8000-000000000002";
    const accepted = await isOperationalDeliveryWorkerActor(async (sql, values) => {
      assert.match(sql, /membership\.tenant_id = \$1/u);
      assert.match(sql, /membership\.user_id = \$2/u);
      assert.match(sql, /membership\.role IN \('owner', 'admin', 'operator'\)/u);
      assert.match(sql, /actor\.disabled_at IS NULL/u);
      assert.deepEqual(values, [tenantId, actorUserId]);
      return { rows: [{ exists: true }] };
    }, tenantId, actorUserId);
    assert.equal(accepted, true);

    const rejected = await isOperationalDeliveryWorkerActor(
      async () => ({ rows: [] }),
      tenantId,
      actorUserId,
    );
    assert.equal(rejected, false);
  });

  it("reconciles expired leases into auditable retries or terminal cancellation", async () => {
    const tenantId = "10000000-0000-4000-8000-000000000001";
    const reconciled = await reconcileExpiredDeliveryLeases(async (sql, values) => {
      assert.match(sql, /WHERE tenant_id = \$1/u);
      assert.match(sql, /status = 'processing'/u);
      assert.match(sql, /lease_expires_at <= now\(\)/u);
      assert.match(sql, /candidate\.attempt_count >= 10 THEN 'cancelled'/u);
      assert.match(sql, /candidate\.attempt_count < 10/u);
      assert.match(sql, /DELIVERY_LEASE_EXPIRED/u);
      assert.match(sql, /candidate\.attempt_count/u);
      assert.match(sql, /candidate\.locked_by/u);
      assert.match(sql, /candidate\.lease_token/u);
      assert.match(sql, /candidate\.provider_profile_id/u);
      assert.match(sql, /attempt_number, worker_id, lease_token_hash, provider_profile_id/u);
      assert.match(sql, /encode\(digest\(lease_token::text, 'sha256'\), 'hex'\)/u);
      assert.match(sql, /INSERT INTO notification_delivery_attempts/u);
      assert.deepEqual(values, [tenantId]);
      return { rows: [], rowCount: 2 };
    }, tenantId);
    assert.equal(reconciled, 2);
  });

  it("cancels queued delivery when its recipient is no longer active in the tenant", async () => {
    const tenantId = "10000000-0000-4000-8000-000000000001";
    await cancelInactiveRecipientDeliveries(async (sql, values) => {
      assert.match(sql, /delivery\.tenant_id = \$1/u);
      assert.match(sql, /recipient\.disabled_at IS NULL/u);
      assert.match(sql, /membership\.tenant_id = delivery\.tenant_id/u);
      assert.match(sql, /RECIPIENT_INACTIVE/u);
      assert.deepEqual(values, [tenantId]);
      return { rows: [], rowCount: 1 };
    }, tenantId);
  });

  it("cancels queued delivery when its current channel preference is disabled", async () => {
    const tenantId = "10000000-0000-4000-8000-000000000001";
    await cancelPreferenceDisabledQueuedDeliveries(async (sql, values) => {
      assert.match(sql, /delivery\.tenant_id = \$1/u);
      assert.match(sql, /delivery\.status IN \('pending', 'failed'\)/u);
      assert.match(sql, /preference\.tenant_id = delivery\.tenant_id/u);
      assert.match(sql, /preference\.user_id = delivery\.recipient_user_id/u);
      assert.match(sql, /NOT preference\.email_enabled/u);
      assert.match(sql, /NOT preference\.push_enabled/u);
      assert.match(sql, /RECIPIENT_CHANNEL_DISABLED/u);
      assert.doesNotMatch(sql, /status = 'processing'/u);
      assert.deepEqual(values, [tenantId]);
      return { rows: [], rowCount: 2 };
    }, tenantId);
  });

  it("keeps suppression cleanup and claims explicitly tenant scoped", async () => {
    const tenantId = "10000000-0000-4000-8000-000000000001";
    await cancelSuppressedQueuedDeliveries(async (sql, values) => {
      assert.match(sql, /delivery\.tenant_id = \$1/u);
      assert.match(sql, /suppression\.tenant_id = delivery\.tenant_id/u);
      assert.match(sql, /delivery\.status IN \('pending', 'failed'\)/u);
      assert.match(sql, /lease_token = NULL/u);
      assert.deepEqual(values, [tenantId]);
      return { rows: [], rowCount: 1 };
    }, tenantId);

    const rows = await claimDeliveryBatch(async (sql, values) => {
      assert.match(sql, /delivery\.tenant_id = \$1/u);
      assert.match(sql, /provider\.tenant_id = delivery\.tenant_id/u);
      assert.match(sql, /provider\.id = delivery\.provider_profile_id/u);
      assert.match(sql, /delivery\.provider_profile_id IS NULL AND provider\.status = 'active'/u);
      assert.doesNotMatch(sql, /provider\.id = delivery\.provider_profile_id AND provider\.status = 'active'/u);
      assert.match(sql, /provider\.credential_env_ref/u);
      assert.match(sql, /COALESCE\(delivery\.provider_profile_id, candidates\.provider_id\)/u);
      assert.match(sql, /suppression\.tenant_id = delivery\.tenant_id/u);
      assert.match(sql, /preference\.tenant_id = delivery\.tenant_id/u);
      assert.match(sql, /NOT preference\.email_enabled/u);
      assert.match(sql, /membership\.tenant_id = delivery\.tenant_id/u);
      assert.match(sql, /recipient\.disabled_at IS NULL/u);
      assert.match(sql, /FOR UPDATE OF delivery SKIP LOCKED/u);
      assert.match(sql, /WHERE delivery\.tenant_id = \$1/u);
      assert.deepEqual(values, [tenantId, 25, "worker-primary"]);
      return {
        rows: [
          {
            id: "30000000-0000-4000-8000-000000000003",
            leaseToken: "40000000-0000-4000-8000-000000000004",
            notificationId: "50000000-0000-4000-8000-000000000005",
            recipientUserId: "60000000-0000-4000-8000-000000000006",
            recipientEmail: "operator@example.com",
            channel: "email" as const,
            providerProfileId: "70000000-0000-4000-8000-000000000007",
            provider: "mail-provider",
            credentialEnvRef: "FILO_EMAIL_PROVIDER_KEY",
            title: "Title",
            message: "Message",
            locale: "tr-TR",
            attemptCount: 2,
            leaseExpiresAt: new Date("2026-08-11T11:00:00.000Z"),
          },
        ],
      };
    }, { tenantId, limit: 25, workerId: "worker-primary" });
    assert.equal(rows.length, 1);
  });

  it("binds completion to tenant and lease while preserving provider identity", async () => {
    const tenantId = "10000000-0000-4000-8000-000000000001";
    const deliveryId = "30000000-0000-4000-8000-000000000003";
    const leaseToken = "40000000-0000-4000-8000-000000000004";
    const providerMessageId = "provider-message-1";
    const workerId = "worker-primary";
    const providerProfileId = "70000000-0000-4000-8000-000000000007";

    const locked = await lockDeliveryForCompletion(async (sql, values) => {
      assert.match(sql, /WHERE tenant_id = \$1/u);
      assert.match(sql, /id = \$2/u);
      assert.match(sql, /lease_token = \$3/u);
      assert.match(sql, /locked_by = \$4/u);
      assert.match(sql, /lease_expires_at > now\(\)/u);
      assert.match(sql, /provider_profile_id AS "providerProfileId"/u);
      assert.match(sql, /FOR UPDATE/u);
      assert.deepEqual(values, [tenantId, deliveryId, leaseToken, workerId]);
      return { rows: [{ attemptCount: 2, providerMessageId, providerProfileId }] };
    }, tenantId, deliveryId, leaseToken, workerId);
    assert.deepEqual(locked, { attemptCount: 2, providerMessageId, providerProfileId });
    assert.equal(isCompletionProviderMessageIdConsistent(null, providerMessageId), true);
    assert.equal(
      isCompletionProviderMessageIdConsistent(providerMessageId, providerMessageId),
      true,
    );
    assert.equal(
      isCompletionProviderMessageIdConsistent(providerMessageId, "provider-message-2"),
      false,
    );

    let queryCount = 0;
    const completed = await completeClaimedDelivery(async (sql, values) => {
      queryCount += 1;
      if (queryCount === 1) {
        assert.match(sql, /WHERE tenant_id = \$1/u);
        assert.match(sql, /id = \$2/u);
        assert.match(sql, /lease_token = \$7/u);
        assert.match(sql, /locked_by = \$8/u);
        assert.match(sql, /COALESCE\(provider_message_id, \$6\)/u);
        assert.deepEqual(values, [
          tenantId,
          deliveryId,
          "delivered",
          null,
          2,
          providerMessageId,
          leaseToken,
          workerId,
        ]);
        return { rows: [], rowCount: 1 };
      }
      assert.match(sql, /INSERT INTO notification_delivery_attempts/u);
      assert.match(sql, /attempt_number, worker_id, lease_token_hash, provider_profile_id/u);
      assert.match(sql, /encode\(digest\(\(\$8::uuid\)::text, 'sha256'\), 'hex'\)/u);
      assert.deepEqual(values, [
        tenantId,
        deliveryId,
        "delivered",
        providerMessageId,
        null,
        2,
        workerId,
        leaseToken,
        providerProfileId,
      ]);
      return { rows: [], rowCount: 1 };
    }, {
      tenantId,
      deliveryId,
      leaseToken,
      workerId,
      outcome: "delivered",
      providerMessageId,
      error: null,
      attemptCount: 2,
      providerProfileId,
    });
    assert.equal(completed, true);
    assert.equal(queryCount, 2);
  });

  it("renews only a live owned lease within its absolute deadline", async () => {
    const tenantId = "10000000-0000-4000-8000-000000000001";
    const deliveryId = "30000000-0000-4000-8000-000000000003";
    const leaseToken = "40000000-0000-4000-8000-000000000004";
    const workerId = "worker-primary";
    const leaseExpiresAt = new Date("2026-08-11T14:05:00.000Z");

    const renewed = await renewClaimedDeliveryLease(async (sql, values) => {
      assert.match(sql, /SET lease_expires_at = GREATEST/u);
      assert.match(sql, /LEAST\(locked_at \+ interval '15 minutes', now\(\) \+ interval '5 minutes'\)/u);
      assert.match(sql, /WHERE tenant_id = \$1/u);
      assert.match(sql, /id = \$2/u);
      assert.match(sql, /lease_token = \$3/u);
      assert.match(sql, /locked_by = \$4/u);
      assert.match(sql, /status = 'processing'/u);
      assert.match(sql, /locked_at IS NOT NULL/u);
      assert.match(sql, /lease_expires_at > now\(\)/u);
      assert.match(sql, /now\(\) < locked_at \+ interval '15 minutes'/u);
      assert.deepEqual(values, [tenantId, deliveryId, leaseToken, workerId]);
      return { rows: [{ leaseExpiresAt }] };
    }, { tenantId, deliveryId, leaseToken, workerId });

    assert.deepEqual(renewed, { leaseExpiresAt });

    const rejected = await renewClaimedDeliveryLease(
      async () => ({ rows: [] }),
      { tenantId, deliveryId, leaseToken, workerId },
    );
    assert.equal(rejected, undefined);
  });

  it("accepts only an identical completion replay for the same worker lease", async () => {
    const tenantId = "10000000-0000-4000-8000-000000000001";
    const deliveryId = "30000000-0000-4000-8000-000000000003";
    const leaseToken = "40000000-0000-4000-8000-000000000004";
    const workerId = "worker-primary";
    const receipt = await findCompletionReceipt(async (sql, values) => {
      assert.match(sql, /FROM notification_delivery_attempts/u);
      assert.match(sql, /tenant_id = \$1/u);
      assert.match(sql, /delivery_id = \$2/u);
      assert.match(sql, /lease_token_hash = encode\(digest\(\(\$3::uuid\)::text, 'sha256'\), 'hex'\)/u);
      assert.match(sql, /worker_id = \$4/u);
      assert.deepEqual(values, [tenantId, deliveryId, leaseToken, workerId]);
      return {
        rows: [{ outcome: "failed" as const, providerMessageId: null, error: "PROVIDER_TIMEOUT" }],
      };
    }, tenantId, deliveryId, leaseToken, workerId);

    assert.ok(receipt);
    assert.equal(
      isCompletionReplayConsistent(receipt, {
        outcome: "failed",
        providerMessageId: null,
        error: "PROVIDER_TIMEOUT",
      }),
      true,
    );
    assert.equal(
      isCompletionReplayConsistent(receipt, {
        outcome: "failed",
        providerMessageId: null,
        error: "PROVIDER_REJECTED",
      }),
      false,
    );
  });
});
