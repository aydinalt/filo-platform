import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  changePasswordSchema,
  completePasswordResetSchema,
  requestPasswordResetSchema,
} from "@filo/contracts";
import {
  createPasswordResetSecret,
  hashPasswordResetSecret,
  parsePasswordResetToken,
} from "../src/lib/password-reset-token.js";

describe("account recovery and session security", () => {
  it("normalizes recovery requests without exposing account identity", () => {
    assert.equal(
      requestPasswordResetSchema.parse({ email: "OWNER@EXAMPLE.COM" }).email,
      "owner@example.com",
    );
    assert.equal(requestPasswordResetSchema.safeParse({ email: "invalid" }).success, false);
  });

  it("accepts only tenant-bound reset tokens and strong replacement passwords", () => {
    const token = `10000000-0000-4000-8000-000000000001.${"A".repeat(43)}`;
    assert.equal(completePasswordResetSchema.safeParse({ token, password: "YeniParola2026" }).success, true);
    assert.equal(completePasswordResetSchema.safeParse({ token: "short", password: "YeniParola2026" }).success, false);
    assert.equal(completePasswordResetSchema.safeParse({ token, password: "yalnizcaharfler" }).success, false);
  });

  it("requires password changes to differ from the current secret", () => {
    assert.equal(changePasswordSchema.safeParse({ currentPassword: "MevcutParola2026", newPassword: "YeniParola2026" }).success, true);
    assert.equal(changePasswordSchema.safeParse({ currentPassword: "AyniParola2026", newPassword: "AyniParola2026" }).success, false);
  });

  it("creates fixed-length reset digests and parses the tenant capability", () => {
    const secret = createPasswordResetSecret();
    assert.match(secret, /^[A-Za-z0-9_-]{43}$/u);
    assert.match(hashPasswordResetSecret(secret), /^[0-9a-f]{64}$/u);
    assert.deepEqual(
      parsePasswordResetToken(`10000000-0000-4000-8000-000000000001.${secret}`),
      { tenantId: "10000000-0000-4000-8000-000000000001", secret },
    );
  });

  it("keeps reset capabilities single-use, tenant-scoped and short-lived", async () => {
    const migration = await readFile(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/database/migrations/046_account_recovery_and_sessions.sql"),
      "utf8",
    );
    assert.match(migration, /token_hash text NOT NULL UNIQUE/u);
    assert.match(migration, /ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY/u);
    assert.match(migration, /expires_at > now\(\)/u);
    assert.match(migration, /FOR UPDATE/u);
    assert.match(migration, /UPDATE user_sessions[\s\S]+revoked_at = COALESCE/u);
    assert.match(migration, /rendered_body = '\[redacted after password reset\]'/u);
    assert.match(migration, /REVOKE ALL ON FUNCTION request_password_reset/u);
    assert.doesNotMatch(migration, /password_reset_tokens[\s\S]{0,180}\btoken\s+text/u);
  });
});
