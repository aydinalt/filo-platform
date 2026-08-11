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
});

type FastifyRequestWithProviderBody = {
  providerRawBody?: string;
};
