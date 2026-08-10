import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

process.env.SESSION_SECRET = "release-smoke-session-secret-at-least-32-characters";
process.env.NOTIFICATION_WORKER_KEY =
  "release-smoke-worker-secret-at-least-32-characters";
process.env.WEB_ORIGIN = "https://fleet.example.test";
process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "3";
process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS = "60000";

describe("release smoke boundaries", () => {
  let app: FastifyInstance;
  let observedClientIp = "";

  before(async () => {
    const module = await import("../src/app.js");
    app = await module.buildApp({ readinessCheck: async () => undefined });
    app.addHook("onRequest", async (request) => {
      observedClientIp = request.ip;
    });
  });

  after(async () => {
    await app.close();
  });

  it("serves health with production security headers", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: "ok" });
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["x-frame-options"], "SAMEORIGIN");
    assert.match(
      String(response.headers["x-request-id"]),
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  it("does not trust a client-supplied request identifier", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { "x-request-id": "client-controlled-id" },
    });

    assert.equal(response.statusCode, 200);
    assert.notEqual(response.headers["x-request-id"], "client-controlled-id");
  });

  it("does not trust forwarded client IPs without configured proxy hops", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health/live",
      remoteAddress: "127.0.0.1",
      headers: { "x-forwarded-for": "198.51.100.23" },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(observedClientIp, "127.0.0.1");
  });

  it("rejects request bodies above the configured ingress limit", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/internal/notification-retention/reconcile-interrupted-reminder-runs",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ value: "x".repeat(1_048_576) }),
    });

    assert.equal(response.statusCode, 413);
    assert.deepEqual(response.json(), { error: "PAYLOAD_TOO_LARGE" });
  });

  it("separates liveness from database-backed readiness", async () => {
    const liveResponse = await app.inject({ method: "GET", url: "/health/live" });
    const readyResponse = await app.inject({ method: "GET", url: "/health/ready" });

    assert.equal(liveResponse.statusCode, 200);
    assert.deepEqual(liveResponse.json(), { status: "ok" });
    assert.equal(readyResponse.statusCode, 200);
    assert.deepEqual(readyResponse.json(), { status: "ready" });
  });

  it("returns a safe unavailable response when readiness fails", async () => {
    const module = await import("../src/app.js");
    const unavailableApp = await module.buildApp({
      readinessCheck: async () => {
        throw new Error("postgresql://private-credentials@example.test/filo");
      },
    });

    try {
      const response = await unavailableApp.inject({ method: "GET", url: "/health/ready" });
      assert.equal(response.statusCode, 503);
      assert.deepEqual(response.json(), { status: "unavailable" });
      assert.doesNotMatch(response.body, /postgresql|private-credentials|example\.test/iu);
    } finally {
      await unavailableApp.close();
    }
  });

  it("rejects protected operational views without a session", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/notifications/retention",
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: "AUTH_REQUIRED" });
  });

  it("rejects browser mutations without the CSRF request header", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { origin: process.env.WEB_ORIGIN! },
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { error: "CSRF_REJECTED" });
  });

  it("rejects browser mutations from a foreign origin", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        origin: "https://attacker.example.test",
        "x-filo-csrf": "1",
      },
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { error: "CSRF_REJECTED" });
  });

  it("accepts a trusted browser mutation while keeping non-browser routes separate", async () => {
    const logoutResponse = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        origin: process.env.WEB_ORIGIN!,
        "x-filo-csrf": "1",
      },
    });
    const workerResponse = await app.inject({
      method: "POST",
      url: "/api/internal/notification-retention/reconcile-interrupted-reminder-runs",
      payload: {},
    });
    const webhookResponse = await app.inject({
      method: "POST",
      url: "/api/provider-webhooks/tenant/provider",
      payload: {},
    });

    assert.equal(logoutResponse.statusCode, 204);
    assert.equal(workerResponse.statusCode, 401);
    assert.deepEqual(workerResponse.json(), { error: "INVALID_WORKER_CREDENTIAL" });
    assert.equal(webhookResponse.statusCode, 400);
    assert.deepEqual(webhookResponse.json(), { error: "INVALID_PROVIDER_CALLBACK" });
  });

  it("throttles repeated login attempts without exposing account details", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        remoteAddress: "203.0.113.10",
        headers: { "x-filo-csrf": "1" },
        payload: {},
      });
      assert.equal(response.statusCode, 400);
      assert.deepEqual(response.json(), { error: "INVALID_INPUT" });
    }

    const limited = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      remoteAddress: "203.0.113.10",
      headers: { "x-filo-csrf": "1" },
      payload: {},
    });

    assert.equal(limited.statusCode, 429);
    assert.deepEqual(limited.json(), { error: "RATE_LIMITED" });
    assert.ok(Number(limited.headers["retry-after"]) >= 1);
    assert.doesNotMatch(limited.body, /email|password|account|user/iu);
  });

  it("rejects internal maintenance without a valid worker credential", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/internal/notification-retention/reconcile-interrupted-reminder-runs",
      payload: {},
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: "INVALID_WORKER_CREDENTIAL" });
  });

  it("returns a safe client error for malformed JSON", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/internal/notification-retention/reconcile-interrupted-reminder-runs",
      headers: {
        "content-type": "application/json",
        "x-worker-key": process.env.NOTIFICATION_WORKER_KEY!,
      },
      payload: "{",
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { error: "INVALID_REQUEST" });
    assert.doesNotMatch(response.body, /SyntaxError|stack|Unexpected end/i);
  });

  it("returns a stable response for unknown routes", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/not-a-real-route",
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { error: "NOT_FOUND" });
    assert.doesNotMatch(response.body, /not-a-real-route/i);
  });
});
