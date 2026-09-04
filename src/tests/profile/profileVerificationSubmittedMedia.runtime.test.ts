import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { ensureActiveProfileVerificationRequest, ensureLegacyPendingProfileVerificationRequest } from "../../services/profile/profileVerificationRequest.service";
import {
  fingerprintProfileMediaReference,
  resolveProfileVerificationSubmittedMediaSnapshot,
} from "../../services/profile/profileVerificationSubmittedMedia.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

const media = (suffix: string) => ({
  avatar: `https://example.test/${suffix}/avatar.jpg`,
  cover: `https://example.test/${suffix}/cover.jpg`,
  profilePhotos: [`https://example.test/${suffix}/one.jpg`, `https://example.test/${suffix}/two.jpg`],
});

const pendingProfile = async (suffix: string, submittedMedia = media(suffix)) => {
  const user = await User.create({ email: `submitted-media-${suffix}@test.local`, password: "test-password", status: "active", governanceState: "ACTIVE" });
  const profile = await UserProfile.create({
    userId: user._id, username: `submitted-media-${suffix}`, dateOfBirth: new Date("1990-01-01"), interests: [], bio: "Submitted media authority.",
    ...submittedMedia, profileStatus: "pending_verification", verificationSubmittedAt: new Date(), verificationSubmissionVersion: 1,
  });
  return { user, profile };
};

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

test("submission freezes avatar, cover, and ordered profile-photo authority without persisting biometric data", async () => {
  const { user, profile } = await pendingProfile("freeze");
  const request = (await ensureActiveProfileVerificationRequest(profile)).request;
  const snapshot = request.submittedMedia!;
  const frozenSnapshot = JSON.parse(JSON.stringify(snapshot));
  assert.ok(snapshot);
  assert.equal(snapshot.avatar.role, "AVATAR");
  assert.equal(snapshot.avatar.sourceReference, profile.avatar);
  assert.equal(snapshot.avatar.fingerprint, fingerprintProfileMediaReference(profile.avatar));
  assert.equal(snapshot.cover.role, "COVER");
  assert.equal(snapshot.cover.sourceReference, profile.cover);
  assert.deepEqual(snapshot.profilePhotos.map((photo) => [photo.role, photo.profilePhotoIndex, photo.sourceReference]), [
    ["PROFILE_PHOTO", 0, profile.profilePhotos[0]], ["PROFILE_PHOTO", 1, profile.profilePhotos[1]],
  ]);
  assert.equal("bytes" in snapshot.avatar, false);
  assert.equal("embedding" in snapshot.avatar, false);
  assert.equal("landmarks" in snapshot.avatar, false);

  profile.avatar = "https://example.test/new/avatar.jpg";
  profile.cover = "https://example.test/new/cover.jpg";
  profile.profilePhotos = ["https://example.test/new/one.jpg", "https://example.test/new/two.jpg"];
  await profile.save();
  const reloaded = await ProfileVerificationRequest.findById(request._id);
  assert.deepEqual(JSON.parse(JSON.stringify(reloaded?.submittedMedia)), frozenSnapshot);
  const authority = resolveProfileVerificationSubmittedMediaSnapshot({ request: reloaded!, userId: String(user._id), profileId: String(profile._id), profileSubmissionVersion: 1 });
  assert.equal(authority.noOp, null);
  assert.equal(authority.snapshot?.avatar.sourceReference, media("freeze").avatar);
  await ProfileVerificationRequest.updateOne({ _id: request._id }, { $set: { "submittedMedia.avatar.sourceReference": "https://example.test/replaced.jpg" } });
  assert.equal((await ProfileVerificationRequest.findById(request._id))?.submittedMedia?.avatar.sourceReference, media("freeze").avatar);
});

test("new submission versions receive fresh snapshots while historical snapshots remain unchanged", async () => {
  const { profile } = await pendingProfile("versions");
  const v1 = (await ensureActiveProfileVerificationRequest(profile)).request;
  const v1Snapshot = JSON.parse(JSON.stringify(v1.submittedMedia!));
  v1.status = "REJECTED"; v1.isActive = false; v1.decision = "REJECT"; v1.decisionAuthority = "ADMIN"; v1.decisionReason = "test"; v1.decidedAt = new Date();
  await v1.save();
  profile.profileStatus = "rejected";
  await profile.save();
  const next = media("versions-v2");
  profile.avatar = next.avatar; profile.cover = next.cover; profile.profilePhotos = next.profilePhotos;
  profile.profileStatus = "pending_verification"; profile.verificationSubmissionVersion = 2; profile.verificationSubmittedAt = new Date();
  await profile.save();
  const v2 = (await ensureActiveProfileVerificationRequest(profile)).request;
  assert.equal(v2.profileSubmissionVersion, 2);
  assert.notEqual(v2.submittedMedia?.avatar.fingerprint, v1Snapshot.avatar.fingerprint);
  assert.deepEqual(JSON.parse(JSON.stringify((await ProfileVerificationRequest.findById(v1._id))?.submittedMedia)), v1Snapshot);
});

test("mismatched and legacy requests never receive mutable profile-media authority", async () => {
  const { user, profile } = await pendingProfile("authority");
  const request = (await ensureActiveProfileVerificationRequest(profile)).request;
  assert.throws(
    () => resolveProfileVerificationSubmittedMediaSnapshot({ request, userId: String(user._id), profileId: String(profile._id), profileSubmissionVersion: 2 }),
    (error: unknown) => (error as { code?: string }).code === "STALE_SUBMISSION",
  );
  request.isActive = false;
  await request.save();
  const legacy = await ProfileVerificationRequest.create({ verificationReference: "PROFILE_MEDIA_LEGACY", profileId: profile._id, userId: user._id, attemptNumber: 2, profileSubmissionVersion: 2, submittedAt: new Date() });
  const unavailable = resolveProfileVerificationSubmittedMediaSnapshot({ request: legacy, userId: String(user._id), profileId: String(profile._id), profileSubmissionVersion: 2 });
  assert.equal(unavailable.snapshot, null);
  assert.equal(unavailable.noOp, "MEDIA_SNAPSHOT_UNAVAILABLE");

  const legacySource = await pendingProfile("legacy-source");
  legacySource.profile.verificationSubmissionVersion = 0;
  await legacySource.profile.save();
  const createdFromLegacy = await ensureLegacyPendingProfileVerificationRequest(legacySource.profile);
  assert.equal(createdFromLegacy?.request.submittedMedia, undefined);
});

test("invalid submitted media cannot leave a partially authoritative request", async () => {
  const { profile } = await pendingProfile("invalid");
  profile.avatar = "";
  await assert.rejects(ensureActiveProfileVerificationRequest(profile), (error: unknown) => (error as { code?: string }).code === "STALE_SUBMISSION");
  assert.equal(await ProfileVerificationRequest.countDocuments({ profileId: profile._id }), 0);
});
