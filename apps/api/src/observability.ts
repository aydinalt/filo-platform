import { randomUUID } from "node:crypto";

const SAFE_ERROR_CODE = /^[A-Z0-9_]{1,64}$/u;

export function createRequestId() {
  return randomUUID();
}

export function createLoggerOptions(level: string) {
  return {
    level,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'req.headers["x-filo-signature"]',
        'res.headers["set-cookie"]',
      ],
      censor: "[REDACTED]",
    },
  };
}

export function safeErrorLogDetails(error: unknown) {
  const errorType = error instanceof Error ? error.name : "UnknownError";
  const rawCode = (error as { code?: unknown } | null)?.code;
  const errorCode =
    typeof rawCode === "string" && SAFE_ERROR_CODE.test(rawCode) ? rawCode : undefined;

  return errorCode ? { errorType, errorCode } : { errorType };
}
