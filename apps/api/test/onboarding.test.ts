import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  acceptMemberInvitationSchema,
  createMemberInvitationSchema,
  registerTenantSchema,
  updateMemberAccessSchema,
} from "@filo/contracts";
import { hashPassword, verifyPassword } from "../src/lib/password.js";
import { hashInvitationToken } from "../src/lib/invitation-token.js";

describe("tenant onboarding and account access", () => {
  it("requires production-grade registration boundaries", () => {
    const valid = {
      tenantName: "Örnek Filo A.Ş.",
      tenantSlug: "ornek-filo",
      fullName: "Aydın Altuntaş",
      email: "OWNER@EXAMPLE.COM",
      password: "GuvenliFilo2026",
      termsAccepted: true,
      privacyAccepted: true,
    };
    assert.equal(registerTenantSchema.safeParse(valid).success, true);
    assert.equal(registerTenantSchema.parse(valid).email, "owner@example.com");
    assert.equal(registerTenantSchema.safeParse({ ...valid, tenantSlug: "Örnek Filo" }).success, false);
    assert.equal(registerTenantSchema.safeParse({ ...valid, password: "onlyletterslong" }).success, false);
    assert.equal(registerTenantSchema.safeParse({ ...valid, termsAccepted: false }).success, false);
  });

  it("validates bounded invitation and access inputs", () => {
    const token = `10000000-0000-4000-8000-000000000001.${"A".repeat(43)}`;
    assert.equal(acceptMemberInvitationSchema.safeParse({ token, fullName: "Yeni Kullanıcı", password: "DaveteOzel2026" }).success, true);
    assert.equal(acceptMemberInvitationSchema.safeParse({ token: "short", fullName: "Yeni Kullanıcı", password: "DaveteOzel2026" }).success, false);
    assert.equal(createMemberInvitationSchema.safeParse({ email: "user@example.com", role: "operator" }).success, true);
    assert.equal(createMemberInvitationSchema.safeParse({ email: "user@example.com", role: "owner" }).success, false);
    assert.equal(updateMemberAccessSchema.safeParse({ enabled: false }).success, true);
  });

  it("creates salted password hashes that round-trip without equality leakage", () => {
    const first = hashPassword("GuvenliFilo2026");
    const second = hashPassword("GuvenliFilo2026");
    assert.notEqual(first, second);
    assert.equal(verifyPassword("GuvenliFilo2026", first), true);
    assert.equal(verifyPassword("yanlis-parola", first), false);
  });

  it("stores only a fixed invitation token digest", () => {
    const token = "v0_90-safe-invitation-token-material-1234567";
    const digest = hashInvitationToken(token);
    assert.match(digest, /^[0-9a-f]{64}$/u);
    assert.doesNotMatch(digest, new RegExp(token, "u"));
  });

  it("keeps onboarding writes and member access behind database capabilities", async () => {
    const migration = await readFile(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/database/migrations/045_tenant_onboarding_and_access.sql"),
      "utf8",
    );
    assert.match(migration, /token_hash text NOT NULL UNIQUE/u);
    assert.match(migration, /ALTER TABLE membership_invitations FORCE ROW LEVEL SECURITY/u);
    assert.match(migration, /SECURITY DEFINER/u);
    assert.match(migration, /REVOKE ALL ON FUNCTION bootstrap_tenant_owner/u);
    assert.match(migration, /UPDATE user_sessions[\s\S]+revoked_at = COALESCE/u);
    assert.doesNotMatch(migration, /\btoken\s+text\b/u);
  });
});
