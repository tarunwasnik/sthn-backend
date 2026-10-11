import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import cloudinary from "../../config/cloudinary";

import { ImageAdmission } from "../../models/imageAdmission.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { ImageModerationAttempt } from "../../models/imageModerationAttempt.model";
import { UserProfile } from "../../models/userProfile.model";
import { imageAdmissionService } from "../../services/imageModeration/imageAdmission.service";
import { fingerprintAvatarReference } from "../../services/profile/faceVerificationSession.service";
import { readBoundProfileVerificationAvatar } from "../../services/profile/profileVerificationAvatarRead.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

const hash = "a".repeat(64);
const future = () => new Date(Date.now() + 60_000);

const seed = async (input: Partial<{ actorId: Types.ObjectId; surface: "USER_PROFILE_AVATAR" | "USER_PROFILE_COVER"; attemptStatus: "PASSED" | "BLOCKED" | "UNAVAILABLE"; admissionStatus: "ACTIVE" | "CONSUMED" | "INVALIDATED"; admissionExpiresAt: Date; assetExpiresAt: Date; assetStatus: "TEMPORARY" | "COMMITTED" | "INVALIDATED"; attemptExpiresAt: Date }> = {}) => {
  const actorId = input.actorId ?? new Types.ObjectId();
  const asset = await ImageModerationAsset.create({ assetReference: `ima_${new Types.ObjectId()}`, actorId, contentSha256: hash, providerAssetId: `sthn/avatar/${new Types.ObjectId()}`, trustedMediaReference: `https://res.cloudinary.com/demo/image/upload/v1/sthn/avatar-${new Types.ObjectId()}.jpg`, status: input.assetStatus ?? "TEMPORARY", expiresAt: input.assetExpiresAt ?? future(), retentionDeadline: future() });
  const attempt = await ImageModerationAttempt.create({ attemptReference: `imat_${new Types.ObjectId()}`, assetId: asset._id, actorId, contentSha256: hash, surface: input.surface ?? "USER_PROFILE_AVATAR", entityBinding: `pending:${actorId}`, status: input.attemptStatus ?? "PASSED", provenanceModel: { identifier: "test", revision: "test", artifactSha256: hash }, policy: { key: "TEST", version: "V1" }, expiresAt: input.attemptExpiresAt ?? future(), retentionDeadline: future() });
  const admission = await ImageAdmission.create({ admissionReference: `imauth_${new Types.ObjectId()}`, attemptId: attempt._id, assetId: asset._id, actorId, contentSha256: hash, surface: input.surface ?? "USER_PROFILE_AVATAR", entityBinding: attempt.entityBinding, status: input.admissionStatus ?? "ACTIVE", expiresAt: input.admissionExpiresAt ?? future() });
  return { actorId, asset, attempt, admission };
};

test.before(async () => { process.env.NODE_ENV = "test"; await connectPhase7HDatabase(); });
test.beforeEach(clearPhase7HDatabase);
test.after(disconnectPhase7HDatabase);

test("resolves an active passed caller-owned avatar admission without mutating authority", async () => {
  const seeded = await seed();
  const profile = await UserProfile.create({ userId: seeded.actorId, username: `candidate-${seeded.actorId}`, interests: [], bio: "", avatar: "https://legacy.test/avatar", cover: "", profilePhotos: [], profileStatus: "incomplete" });
  const candidate = await imageAdmissionService.resolveTrustedAvatarAdmissionCandidate({ admissionReference: seeded.admission.admissionReference, actorId: seeded.actorId });
  assert.deepEqual(candidate, {
    admissionId: seeded.admission._id, admissionReference: seeded.admission.admissionReference,
    attemptId: seeded.attempt._id, attemptReference: seeded.attempt.attemptReference,
    assetId: seeded.asset._id, providerAssetId: seeded.asset.providerAssetId,
    contentSha256: hash, trustedMediaReference: seeded.asset.trustedMediaReference,
    expiresAt: seeded.admission.expiresAt, assetExpiresAt: seeded.asset.expiresAt,
  });
  assert.equal((await ImageAdmission.findById(seeded.admission._id))?.status, "ACTIVE");
  assert.equal((await ImageModerationAsset.findById(seeded.asset._id))?.status, "TEMPORARY");
  assert.equal((await UserProfile.findById(profile._id))?.avatar, "https://legacy.test/avatar");
});

test("rejects foreign, wrong-surface, non-passed, expired, and terminal candidate authority", async () => {
  const foreign = await seed();
  await assert.rejects(() => imageAdmissionService.resolveTrustedAvatarAdmissionCandidate({ admissionReference: foreign.admission.admissionReference, actorId: new Types.ObjectId() }));
  const cover = await seed({ surface: "USER_PROFILE_COVER" });
  await assert.rejects(() => imageAdmissionService.resolveTrustedAvatarAdmissionCandidate({ admissionReference: cover.admission.admissionReference, actorId: cover.actorId }));
  for (const input of [
    { attemptStatus: "BLOCKED" as const }, { attemptStatus: "UNAVAILABLE" as const },
    { admissionStatus: "CONSUMED" as const }, { admissionStatus: "INVALIDATED" as const },
    { admissionExpiresAt: new Date(0) }, { assetExpiresAt: new Date(0) }, { assetStatus: "INVALIDATED" as const }, { attemptExpiresAt: new Date(0) },
  ]) {
    const seeded = await seed(input);
    const originalAdmissionStatus = seeded.admission.status;
    await assert.rejects(() => imageAdmissionService.resolveTrustedAvatarAdmissionCandidate({ admissionReference: seeded.admission.admissionReference, actorId: seeded.actorId }));
    assert.equal((await ImageAdmission.findById(seeded.admission._id))?.status, originalAdmissionStatus);
  }
});

test("rejects missing or inconsistent admission links without consuming a candidate", async () => {
  const missingAttempt = await seed();
  await ImageModerationAttempt.deleteOne({ _id: missingAttempt.attempt._id });
  await assert.rejects(() => imageAdmissionService.resolveTrustedAvatarAdmissionCandidate({ admissionReference: missingAttempt.admission.admissionReference, actorId: missingAttempt.actorId }));
  const inconsistentAsset = await seed();
  await ImageModerationAsset.collection.updateOne({ _id: inconsistentAsset.asset._id }, { $set: { contentSha256: "b".repeat(64) } });
  await assert.rejects(() => imageAdmissionService.resolveTrustedAvatarAdmissionCandidate({ admissionReference: inconsistentAsset.admission.admissionReference, actorId: inconsistentAsset.actorId }));
  assert.equal((await ImageAdmission.findById(inconsistentAsset.admission._id))?.status, "ACTIVE");
});

test("existing profile-bound avatar reader retains its authority and bounded-reader path", async () => {
  const userId = new Types.ObjectId();
  const avatar = "https://res.cloudinary.com/demo/image/upload/v1/sthn/profile-bound.jpg";
  const profile = await UserProfile.create({ userId, username: `profile-reader-${userId}`, interests: [], bio: "", avatar, cover: "", profilePhotos: [], profileStatus: "incomplete" });
  const originalFetch = globalThis.fetch;
  const originalCloudinary = cloudinary.config();
  cloudinary.config({ cloud_name: "demo" });
  globalThis.fetch = async () => new Response(new Uint8Array([4, 5, 6]), { status: 200, headers: { "content-length": "3" } });
  try {
    assert.deepEqual(await readBoundProfileVerificationAvatar({ profileId: String(profile._id), userId: String(userId), avatarFingerprint: fingerprintAvatarReference(avatar) }), Buffer.from([4, 5, 6]));
  } finally { globalThis.fetch = originalFetch; cloudinary.config(originalCloudinary); }
});
