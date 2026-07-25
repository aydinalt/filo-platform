import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createVehicleSchema, loginSchema } from "@filo/contracts";

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
});
