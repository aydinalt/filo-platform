import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  claimMobileEnrollmentSchema,
  createMobileEnrollmentSchema,
  mobileLocationBatchSchema,
  mobileTrackingStateSchema,
} from "@filo/contracts";
import { createMobileSecret, hashMobileSecret, parseMobileToken } from "../src/lib/mobile-token.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("native mobile background tracking boundary", () => {
  it("creates opaque fixed-length capabilities and parses only tenant-safe token shapes", () => {
    const secret = createMobileSecret();
    assert.match(secret, /^[A-Za-z0-9_-]{43}$/u);
    assert.match(hashMobileSecret(secret), /^[0-9a-f]{64}$/u);
    assert.deepEqual(
      parseMobileToken(`10000000-0000-4000-8000-000000000001.${secret}`),
      { id: "10000000-0000-4000-8000-000000000001", secret },
    );
    assert.equal(parseMobileToken(`not-a-uuid.${secret}`), null);
  });

  it("bounds enrollment, permission and offline batch inputs", () => {
    assert.equal(createMobileEnrollmentSchema.safeParse({
      assignmentId: "10000000-0000-4000-8000-000000000001",
      label: "34 ABC 123 sürücü telefonu",
    }).success, true);
    assert.equal(claimMobileEnrollmentSchema.safeParse({
      token: `10000000-0000-4000-8000-000000000001.${"A".repeat(43)}`,
      platform: "android",
      deviceName: "Saha telefonu",
    }).success, true);
    assert.equal(mobileTrackingStateSchema.safeParse({
      permission: "granted_always", state: "tracking",
    }).success, true);
    assert.equal(mobileTrackingStateSchema.safeParse({
      permission: "denied", state: "tracking",
    }).success, false);
    assert.equal(mobileLocationBatchSchema.safeParse({ events: [] }).success, false);
    assert.equal(mobileLocationBatchSchema.safeParse({ events: Array.from({ length: 101 }, () => ({
      eventId: "10000000-0000-4000-8000-000000000001",
      recordedAt: "2026-08-12T10:00:00.000Z",
      latitude: 41,
      longitude: 29,
      accuracyMeters: 10,
    })) }).success, false);
  });

  it("keeps enrollment and mobile credentials tenant-isolated, hashed and revocable", async () => {
    const migration = await readFile(
      resolve(root, "packages/database/migrations/047_mobile_background_tracking.sql"),
      "utf8",
    );
    assert.match(migration, /token_hash text NOT NULL UNIQUE/u);
    assert.match(migration, /ALTER TABLE mobile_enrollments FORCE ROW LEVEL SECURITY/u);
    assert.match(migration, /ALTER TABLE mobile_access_credentials FORCE ROW LEVEL SECURITY/u);
    assert.match(migration, /WHERE id = p_enrollment_id[\s\S]+FOR UPDATE/u);
    assert.match(migration, /SET revoked_at = COALESCE\(revoked_at, now\(\)\)[\s\S]+assignment_id = enrollment\.assignment_id/u);
    assert.match(migration, /expires_at > now\(\)/u);
    assert.match(migration, /REVOKE ALL ON FUNCTION claim_mobile_enrollment/u);
  });

  it("declares native background location permissions for both platforms", async () => {
    const appConfig = await readFile(resolve(root, "apps/mobile/app.json"), "utf8");
    assert.match(appConfig, /ACCESS_BACKGROUND_LOCATION/u);
    assert.match(appConfig, /FOREGROUND_SERVICE_LOCATION/u);
    assert.match(appConfig, /UIBackgroundModes/u);
    assert.match(appConfig, /isIosBackgroundLocationEnabled/u);
  });
});
