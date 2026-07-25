import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDeviceSchema, createDriverSchema, createVehicleSchema, loginSchema, updateMemberRoleSchema } from "@filo/contracts";

describe("API contracts", () => {
  it("normalizes email and plate", () => {
    assert.equal(loginSchema.parse({ email: "ADMIN@DEMO.FILO", password: "12345678" }).email,
      "admin@demo.filo");
    assert.equal(createVehicleSchema.parse({
      plate: "34 abc 123", make: "Ford", model: "Transit", year: 2026
    }).plate, "34 ABC 123");
  });

  it("rejects an impossible vehicle year", () => {
    assert.throws(() => createVehicleSchema.parse({
      plate: "34 ABC 123", make: "Ford", model: "Transit", year: 1970
    }));
  });

  it("validates driver, device and assignable roles", () => {
    assert.equal(createDriverSchema.safeParse({ fullName: "Ayşe Yılmaz", phone: "5551112233" }).success, true);
    assert.equal(createDeviceSchema.safeParse({ ownership: "personal", platform: "ios", model: "iPhone", driverId: null }).success, true);
    assert.equal(updateMemberRoleSchema.safeParse({ role: "owner" }).success, false);
  });
});
