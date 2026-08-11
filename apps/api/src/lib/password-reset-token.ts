import { createHash, randomBytes } from "node:crypto";

export function createPasswordResetSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPasswordResetSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function parsePasswordResetToken(token: string) {
  const separator = token.indexOf(".");
  if (separator < 1) return null;
  return {
    tenantId: token.slice(0, separator),
    secret: token.slice(separator + 1),
  };
}
