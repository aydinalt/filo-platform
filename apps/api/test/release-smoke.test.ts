import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

process.env.SESSION_SECRET = "release-smoke-session-secret-at-least-32-characters";
process.env.NOTIFICATION_WORKER_KEY =
  "release-smoke-worker-secret-at-least-32-characters";
process.env.WEB_ORIGIN = "https://fleet.example.test";

describe("release smoke boundaries", () => {
  let app: FastifyInstance;

  before(async () => {
    const module = await import("../src/app.js");
    app = await module.buildApp();
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
  });

  it("rejects protected operational views without a session", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/notifications/retention",
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: "AUTH_REQUIRED" });
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
