import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAssignmentSchema, createDeviceSchema, createDriverSchema, createLocationEventSchema, createVehicleSchema, loginSchema, updateMemberRoleSchema, updateTrackingSchema } from "@filo/contracts";

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

  it("validates assignment and safe tracking transitions", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    assert.equal(createAssignmentSchema.safeParse({ vehicleId:id, driverId:id, deviceId:null }).success, true);
    assert.equal(updateTrackingSchema.safeParse({ permission:"denied", state:"tracking" }).success, false);
    assert.equal(updateTrackingSchema.safeParse({ permission:"granted_always", state:"tracking" }).success, true);
  });

  it("rejects invalid coordinates and accuracy", () => {
    const base={assignmentId:"10000000-0000-4000-8000-000000000001",eventId:"30000000-0000-4000-8000-000000000001",recordedAt:new Date().toISOString()};
    assert.equal(createLocationEventSchema.safeParse({...base,latitude:41.01,longitude:29.01,accuracyMeters:12}).success,true);
    assert.equal(createLocationEventSchema.safeParse({...base,latitude:91,longitude:29.01,accuracyMeters:12}).success,false);
    assert.equal(createLocationEventSchema.safeParse({...base,latitude:41.01,longitude:29.01,accuracyMeters:0}).success,false);
  });

  it("keeps route event identifiers tenant-safe and bounded", () => {
    const input={assignmentId:"10000000-0000-4000-8000-000000000001",eventId:"30000000-0000-4000-8000-000000000001",recordedAt:new Date().toISOString(),latitude:41.01,longitude:29.01,accuracyMeters:25,speedMps:12,headingDegrees:359};
    assert.equal(createLocationEventSchema.safeParse(input).success,true);
    assert.equal(createLocationEventSchema.safeParse({...input,headingDegrees:360}).success,false);
  });
});
