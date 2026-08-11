import { createHash, randomBytes } from "node:crypto";

export function createInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function parseInvitationToken(token: string) {
  const separator = token.indexOf(".");
  if (separator < 1) return null;
  return {
    tenantId: token.slice(0, separator),
    secret: token.slice(separator + 1),
  };
}
