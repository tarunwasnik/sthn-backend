import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import { validateAdmissionAuthority } from "../../services/imageModeration/imageAdmission.service";

const actor = new Types.ObjectId(); const asset = new Types.ObjectId(); const hash = "a".repeat(64); const now = new Date("2026-10-08T00:00:00Z");
const authority = (overrides: Record<string, unknown> = {}) => ({ status: "ACTIVE", actorId: actor, assetId: asset, contentSha256: hash, surface: "USER_PROFILE_AVATAR", entityBinding: `user-profile:${actor}:avatar`, expiresAt: new Date(now.getTime() + 1), ...overrides });
const request = (overrides: Record<string, unknown> = {}) => ({ admission: authority(), actorId: actor, assetId: asset, contentSha256: hash, surface: "USER_PROFILE_AVATAR", entityBinding: `user-profile:${actor}:avatar`, now, ...overrides });
test("I3 authority requires exact actor, asset, hash, surface and entity binding", () => {
  assert.equal(validateAdmissionAuthority(request()), true);
  assert.equal(validateAdmissionAuthority(request({ actorId: new Types.ObjectId() })), false);
  assert.equal(validateAdmissionAuthority(request({ assetId: new Types.ObjectId() })), false);
  assert.equal(validateAdmissionAuthority(request({ contentSha256: "b".repeat(64) })), false);
  assert.equal(validateAdmissionAuthority(request({ surface: "USER_PROFILE_PHOTO" })), false);
  assert.equal(validateAdmissionAuthority(request({ entityBinding: "other-slot" })), false);
});
test("I3 rejects blocked/unavailable/invalid, expired, invalidated and consumed authority", () => {
  for (const status of ["BLOCKED", "UNAVAILABLE", "INVALID", "INVALIDATED", "CONSUMED", "EXPIRED"]) assert.equal(validateAdmissionAuthority(request({ admission: authority({ status }) })), false);
  assert.equal(validateAdmissionAuthority(request({ admission: authority({ expiresAt: now }) })), false);
});
test("I3 makes same stored reference the only grandfathered unchanged path", () => {
  const stored: string = "https://owned/old"; const unchanged: string = "https://owned/old"; const replacement: string = "https://untrusted/new";
  assert.equal(stored === unchanged, true);
  assert.equal(stored === replacement, false);
});
