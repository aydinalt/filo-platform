import { createHash, randomBytes } from "node:crypto";

const TOKEN_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/iu;

export function createMobileSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashMobileSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function parseMobileToken(token: string) {
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return null;
  return { id: match[1]!.toLowerCase(), secret: match[2]! };
}
