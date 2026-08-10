import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET = "test-session-secret-at-least-32-characters";

const { loadConfig } = await import("../src/config.js");

const productionEnvironment = {
  NODE_ENV: "production",
  PORT: "3001",
  WEB_ORIGIN: "https://fleet.example.test",
  DATABASE_URL: "postgresql://filo_app:secret@db.example.test:5432/filo",
  SESSION_SECRET: "production-session-secret-at-least-32-characters",
  SESSION_TTL_HOURS: "12",
  COOKIE_SECURE: "true",
  NOTIFICATION_WORKER_KEY: "production-worker-secret-at-least-32-characters",
  NOTIFICATION_WEBHOOK_SECRET: "production-webhook-secret-at-least-32-characters",
  TRUST_PROXY_HOPS: "1",
  REQUEST_BODY_LIMIT_BYTES: "1048576",
  REQUEST_TIMEOUT_MS: "15000",
  LOG_LEVEL: "info",
};

describe("runtime configuration", () => {
  it("loads bounded development defaults", () => {
    const config = loadConfig({
      SESSION_SECRET: "development-session-secret-at-least-32-characters",
    });
    assert.equal(config.nodeEnv, "development");
    assert.equal(config.port, 3001);
    assert.equal(config.trustProxyHops, 0);
    assert.equal(config.requestBodyLimitBytes, 1_048_576);
    assert.equal(config.requestTimeoutMs, 15_000);
    assert.equal(config.logLevel, "info");
    assert.equal(config.sessionTtlHours, 12);
    assert.equal(config.webOrigin, "http://localhost:5173");
    assert.equal(config.cookieSecure, false);
  });

  it("rejects invalid numeric and boolean values", () => {
    const base = { SESSION_SECRET: "development-session-secret-at-least-32-characters" };
    assert.throws(() => loadConfig({ ...base, PORT: "0" }), /PORT must be between/u);
    assert.throws(
      () => loadConfig({ ...base, SESSION_TTL_HOURS: "12.5" }),
      /SESSION_TTL_HOURS must be an integer/u,
    );
    assert.throws(
      () => loadConfig({ ...base, COOKIE_SECURE: "yes" }),
      /COOKIE_SECURE must be true or false/u,
    );
    assert.throws(
      () => loadConfig({ ...base, TRUST_PROXY_HOPS: "3" }),
      /TRUST_PROXY_HOPS must be between/u,
    );
    assert.throws(
      () => loadConfig({ ...base, REQUEST_BODY_LIMIT_BYTES: "16383" }),
      /REQUEST_BODY_LIMIT_BYTES must be between/u,
    );
    assert.throws(
      () => loadConfig({ ...base, REQUEST_TIMEOUT_MS: "0" }),
      /REQUEST_TIMEOUT_MS must be between/u,
    );
    assert.throws(
      () => loadConfig({ ...base, LOG_LEVEL: "trace" }),
      /LOG_LEVEL must be debug, info, warn or error/u,
    );
  });

  it("rejects a web origin containing a path or credentials", () => {
    const base = { SESSION_SECRET: "development-session-secret-at-least-32-characters" };
    assert.throws(
      () => loadConfig({ ...base, WEB_ORIGIN: "https://fleet.example.test/app" }),
      /WEB_ORIGIN/u,
    );
    assert.throws(
      () => loadConfig({ ...base, WEB_ORIGIN: "https://user:pass@fleet.example.test" }),
      /WEB_ORIGIN/u,
    );
  });

  it("requires a PostgreSQL URL and HTTPS origin in production", () => {
    assert.throws(
      () => loadConfig({ ...productionEnvironment, DATABASE_URL: undefined }),
      /DATABASE_URL is required/u,
    );
    assert.throws(
      () => loadConfig({ ...productionEnvironment, WEB_ORIGIN: "http://fleet.example.test" }),
      /WEB_ORIGIN must use HTTPS/u,
    );
  });

  it("requires secure cookies and non-placeholder production secrets", () => {
    assert.throws(
      () => loadConfig({ ...productionEnvironment, COOKIE_SECURE: "false" }),
      /COOKIE_SECURE must be true/u,
    );
    assert.throws(
      () =>
        loadConfig({
          ...productionEnvironment,
          NOTIFICATION_WORKER_KEY: "replace-with-at-least-32-random-characters",
        }),
      /NOTIFICATION_WORKER_KEY must not use a placeholder/u,
    );
    assert.throws(
      () =>
        loadConfig({
          ...productionEnvironment,
          NOTIFICATION_WORKER_KEY: productionEnvironment.SESSION_SECRET,
        }),
      /production secrets must be unique/u,
    );
  });

  it("accepts a complete production configuration without exposing database credentials", () => {
    const config = loadConfig(productionEnvironment);
    assert.equal(config.nodeEnv, "production");
    assert.equal(config.webOrigin, "https://fleet.example.test");
    assert.equal(config.cookieSecure, true);
    assert.equal(config.trustProxyHops, 1);
    assert.equal("databaseUrl" in config, false);
  });
});
