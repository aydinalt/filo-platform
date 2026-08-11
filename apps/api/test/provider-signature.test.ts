import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { verifyProviderSignature } from "../src/lib/provider-signature.js";

process.env.SESSION_SECRET = "provider-test-session-secret-at-least-32-characters";

describe("provider webhook signatures", () => {
  let app: FastifyInstance;

  before(async () => {
    const { registerProviderWebhookJsonParser } = await import(
      "../src/routes/provider-webhooks.js"
    );
    app = Fastify();
    await app.register(async (scope) => {
      registerProviderWebhookJsonParser(scope);
      scope.post("/capture", async (request) => ({
        body: request.body,
        rawBody: (request as FastifyRequestWithProviderBody).providerRawBody,
      }));
    });
  });

  after(async () => {
    await app.close();
  });

  it("accepts an authentic recent payload and rejects tampering", () => {
    const now = Date.now();
    const timestamp = String(Math.floor(now / 1000));
    const payload = JSON.stringify({ eventId: "evt-1" });
    const secret = "test-webhook-secret-at-least-16";
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");
    assert.equal(verifyProviderSignature(payload, timestamp, signature, secret, now), true);
    assert.equal(verifyProviderSignature(`${payload}x`, timestamp, signature, secret, now), false);
    assert.equal(
      verifyProviderSignature(payload, String(Number(timestamp) - 301), signature, secret, now),
      false,
    );
  });

  it("preserves the exact JSON body used by the provider signature", async () => {
    const payload = '{\n  "eventId": "evt-1", "metadata": { "attempt": 1 }\n}\n';
    const response = await app.inject({
      method: "POST",
      url: "/capture",
      headers: { "content-type": "application/json" },
      payload,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().rawBody, payload);
    assert.deepEqual(response.json().body, {
      eventId: "evt-1",
      metadata: { attempt: 1 },
    });
  });

  it("binds a callback to the provider profile recorded on its delivery", async () => {
    const deliveryId = "1c65b9a9-405d-46d9-b8b4-a7c544b4fdac";
    const { findProviderProfileForDelivery } = await import(
      "../src/routes/provider-webhooks.js"
    );
    const profile = await findProviderProfileForDelivery(
      async (sql, values) => {
        assert.match(
          sql,
          /JOIN notification_delivery_outbox delivery\s+ON delivery\.provider_profile_id = profile\.id/u,
        );
        assert.match(sql, /delivery\.id = \$2/u);
        assert.doesNotMatch(sql, /profile\.status/u);
        assert.deepEqual(values, ["mail-provider", deliveryId]);
        return {
          rows: [{ id: "provider-profile-1", secretRef: "ROTATED_PROVIDER_SECRET" }],
        };
      },
      "mail-provider",
      deliveryId,
    );

    assert.deepEqual(profile, {
      id: "provider-profile-1",
      secretRef: "ROTATED_PROVIDER_SECRET",
    });
  });

  it("serializes callbacks and keeps terminal delivery states monotonic", async () => {
    const {
      isProviderEventTimePlausible,
      lockProviderDelivery,
      nextProviderDeliveryStatus,
    } = await import(
      "../src/routes/provider-webhooks.js"
    );
    const deliveryId = "1c65b9a9-405d-46d9-b8b4-a7c544b4fdac";
    const delivery = await lockProviderDelivery(
      async (sql, values) => {
        assert.match(sql, /WHERE id = \$1 AND provider_profile_id = \$2/u);
        assert.match(sql, /FOR UPDATE/u);
        assert.match(sql, /created_at AS "createdAt"/u);
        assert.deepEqual(values, [deliveryId, "provider-profile-1"]);
        return {
          rows: [
            {
              status: "complained",
              recipientUserId: "recipient-1",
              channel: "email",
              createdAt: new Date("2026-08-11T08:00:00.000Z"),
            },
          ],
        };
      },
      deliveryId,
      "provider-profile-1",
    );

    assert.equal(delivery?.status, "complained");
    assert.equal(nextProviderDeliveryStatus("pending", "delivered"), "delivered");
    assert.equal(nextProviderDeliveryStatus("delivered", "bounced"), "bounced");
    assert.equal(nextProviderDeliveryStatus("bounced", "complained"), "complained");
    assert.equal(nextProviderDeliveryStatus("complained", "delivered"), "complained");
    assert.equal(nextProviderDeliveryStatus("bounced", "delivered"), "bounced");
    assert.equal(
      isProviderEventTimePlausible(
        "2026-08-11T08:00:00Z",
        delivery.createdAt,
        Date.parse("2026-08-11T09:00:00Z"),
      ),
      true,
    );
  });

  it("rejects provider event times outside the delivery lifecycle", async () => {
    const { isProviderEventTimePlausible } = await import(
      "../src/routes/provider-webhooks.js"
    );
    const createdAt = "2026-08-11T08:00:00Z";
    const receivedAt = Date.parse("2026-08-11T09:00:00Z");

    assert.equal(
      isProviderEventTimePlausible("2026-08-11T07:55:00Z", createdAt, receivedAt),
      true,
    );
    assert.equal(
      isProviderEventTimePlausible("2026-08-11T07:54:59Z", createdAt, receivedAt),
      false,
    );
    assert.equal(
      isProviderEventTimePlausible("2026-08-11T09:05:00Z", createdAt, receivedAt),
      true,
    );
    assert.equal(
      isProviderEventTimePlausible("2026-08-11T09:05:01Z", createdAt, receivedAt),
      false,
    );
  });

  it("accepts only an identical callback as an idempotent provider event", async () => {
    const { findProviderEventById, isSameProviderEvent } = await import(
      "../src/routes/provider-webhooks.js"
    );
    const tenantId = "22455242-9c0e-4481-892b-0ef95c304922";
    const event = await findProviderEventById(
      async (sql, values) => {
        assert.match(sql, /tenant_id = \$1/u);
        assert.match(sql, /provider_profile_id = \$2/u);
        assert.match(sql, /provider_event_id = \$3/u);
        assert.deepEqual(values, [tenantId, "provider-profile-1", "event-1"]);
        return {
          rows: [
            {
              deliveryId: "1c65b9a9-405d-46d9-b8b4-a7c544b4fdac",
              eventType: "bounced" as const,
              providerMessageId: "provider-message-1",
              occurredAt: new Date("2026-08-11T08:00:00.000Z"),
            },
          ],
        };
      },
      tenantId,
      "provider-profile-1",
      "event-1",
    );

    assert.ok(event);
    const duplicate = {
      deliveryId: "1c65b9a9-405d-46d9-b8b4-a7c544b4fdac",
      event: "bounced" as const,
      providerMessageId: "provider-message-1",
      occurredAt: "2026-08-11T08:00:00Z",
    };
    assert.equal(isSameProviderEvent(event, duplicate), true);
    assert.equal(
      isSameProviderEvent(event, {
        ...duplicate,
        deliveryId: "70d34a48-1e7a-4f66-9ae5-822cf0033f59",
      }),
      false,
    );
    assert.equal(isSameProviderEvent(event, { ...duplicate, event: "complained" }), false);
    assert.equal(
      isSameProviderEvent(event, { ...duplicate, providerMessageId: "provider-message-2" }),
      false,
    );
    assert.equal(
      isSameProviderEvent(event, { ...duplicate, occurredAt: "2026-08-11T08:00:01Z" }),
      false,
    );
  });
});

type FastifyRequestWithProviderBody = {
  providerRawBody?: string;
};
