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
};

describe("runtime configuration", () => {
  it("loads bounded development defaults", () => {
    const config = loadConfig({
      SESSION_SECRET: "development-session-secret-at-least-32-characters",
    });
    assert.equal(config.nodeEnv, "development");
    assert.equal(config.port, 3001);
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
    assert.equal("databaseUrl" in config, false);
  });
});
