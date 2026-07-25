import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET = "test-secret-which-is-longer-than-32-characters";

describe("security primitives", () => {
  it("accepts a correct scrypt password and rejects a wrong one", async () => {
    const { scryptSync } = await import("node:crypto");
    const { verifyPassword } = await import("../src/lib/password.js");
    const salt = "00112233445566778899aabbccddeeff";
    const encoded = `${salt}:${scryptSync("correct-password", salt, 64).toString("hex")}`;
    assert.equal(verifyPassword("correct-password", encoded), true);
    assert.equal(verifyPassword("wrong-password", encoded), false);
  });

  it("round-trips a signed tenant session", async () => {
    const { createSessionToken, readSessionToken } = await import("../src/lib/session.js");
    const user = {
      id: "20000000-0000-4000-8000-000000000001",
      tenantId: "10000000-0000-4000-8000-000000000001",
      tenantName: "Demo Filo A.Ş.",
      email: "admin@demo.filo",
      fullName: "Demo Yönetici",
      role: "owner" as const
    };
    const token = await createSessionToken(user);
    const decoded = await readSessionToken(token);
    assert.equal(decoded.id, user.id);
    assert.equal(decoded.tenantId, user.tenantId);
  });
});
