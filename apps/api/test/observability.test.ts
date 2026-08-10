import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createLoggerOptions,
  createRequestId,
  safeErrorLogDetails,
} from "../src/observability.js";

describe("production observability boundaries", () => {
  it("creates globally unique UUID request identifiers", () => {
    const first = createRequestId();
    const second = createRequestId();

    assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    assert.notEqual(first, second);
  });

  it("redacts authentication, session and webhook signature headers", () => {
    const logger = createLoggerOptions("warn");

    assert.equal(logger.level, "warn");
    assert.deepEqual(logger.redact.paths, [
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["x-filo-signature"]',
      'res.headers["set-cookie"]',
    ]);
  });

  it("keeps private error messages and unsafe codes out of structured logs", () => {
    const error = Object.assign(new Error("postgresql://user:private@db/filo"), {
      code: "unsafe-code with spaces",
    });
    const details = safeErrorLogDetails(error);

    assert.deepEqual(details, { errorType: "Error" });
    assert.doesNotMatch(JSON.stringify(details), /private|unsafe-code/u);
    assert.deepEqual(
      safeErrorLogDetails(Object.assign(new Error("hidden"), { code: "FST_ERR_VALIDATION" })),
      { errorType: "Error", errorCode: "FST_ERR_VALIDATION" },
    );
  });
});
