import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createShutdownHandler } from "../src/shutdown.js";

describe("graceful shutdown", () => {
  it("closes the API and database exactly once across repeated signals", async () => {
    const calls: string[] = [];
    const shutdown = createShutdownHandler({
      closeApp: async () => {
        calls.push("app");
      },
      closeDatabase: async () => {
        calls.push("database");
      },
      log: {
        info: () => undefined,
        error: () => undefined,
      },
      setExitCode: (code) => calls.push(`exit:${code}`),
    });

    const first = shutdown("SIGTERM");
    const second = shutdown("SIGINT");

    assert.equal(first, second);
    await Promise.all([first, second]);
    assert.deepEqual(calls, ["app", "database"]);
  });

  it("attempts both closures and records a failed shutdown without exposing errors", async () => {
    const calls: string[] = [];
    const errors: Array<Record<string, unknown>> = [];
    const shutdown = createShutdownHandler({
      closeApp: async () => {
        calls.push("app");
        throw new Error("private shutdown detail");
      },
      closeDatabase: async () => {
        calls.push("database");
      },
      log: {
        info: () => undefined,
        error: (details) => errors.push(details),
      },
      setExitCode: (code) => calls.push(`exit:${code}`),
    });

    await shutdown("SIGTERM");

    assert.deepEqual(calls, ["app", "database", "exit:1"]);
    assert.deepEqual(errors, [{ signal: "SIGTERM", failureCount: 1 }]);
    assert.doesNotMatch(JSON.stringify(errors), /private shutdown detail/u);
  });
});
