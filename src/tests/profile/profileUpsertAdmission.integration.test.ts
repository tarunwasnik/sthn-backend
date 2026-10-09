import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";

import { upsertProfile } from "../../controllers/profile.controller";
import { ImageAdmission } from "../../models/imageAdmission.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { ImageModerationAttempt } from "../../models/imageModerationAttempt.model";
import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { ProfileVerificationJob } from "../../models/profileVerificationJob.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { UserProfile } from "../../models/userProfile.model";
import User from "../../models/User";
import { ImageModerationSurface } from "../../enums/imageModeration.enums";
import { fingerprintAvatarReference } from "../../services/profile/faceVerificationSession.service";
import { setBiometricReferenceAvatarValidationDependenciesForTests } from "../../services/profile/profileVerificationReferenceAvatarValidation.service";
import { profileVerificationJobRepository } from "../../repositories/profileVerificationJob.repository";
import { faceVerificationSessionRepository } from "../../repositories/faceVerificationSession.repository";
import { withUserProfileTextAdmission } from "../textModeration/helpers/textModerationTestAdmission";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

const sha = "a".repeat(64);
const future = () => new Date(Date.now() + 60_000);
const challenges = ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "LOOK_DOWN"] as const;
const detection = { width: 100, height: 100, decodedBytes: 30_000, faces: [{ x: 30, y: 30, width: 40, height: 40, confidence: 0.9, landmarks: { rightEye: { x: 40, y: 42 }, leftEye: { x: 55, y: 42 }, noseTip: { x: 48, y: 50 }, rightMouthCorner: { x: 42, y: 60 }, leftMouthCorner: { x: 54, y: 60 } } }] } as const;
const claim = (admissionReference: string) => ({ kind: "ADMISSION" as const, admissionReference });
const unchanged = (reference: string) => ({ kind: "UNCHANGED" as const, reference });

const invoke = (userId: Types.ObjectId, body: Record<string, unknown>) => new Promise<unknown>((resolve, reject) => {
  const response = { status: () => response, json: (value: unknown) => { resolve(value); return response; } } as unknown as Response;
  upsertProfile({ user: { id: userId.toString(), role: "user", status: "pending_profile" }, body } as unknown as Request, response, reject as NextFunction);
});

async function user(status: "pending_profile" | "active" = "pending_profile") {
  return User.create({ email: `upsert-${new Types.ObjectId()}@test.local`, password: "test", status, governanceState: "ACTIVE" });
}

async function profile(userId: Types.ObjectId, status: "incomplete" | "rejected" | "verified" = "incomplete") {
  return UserProfile.create({ userId, username: `upsert-${userId}`, realName: "Existing", dateOfBirth: new Date("1990-01-01"), country: "India", city: "Mumbai", languages: ["English"], interests: [], bio: "Existing profile.", avatar: "https://legacy.test/avatar", cover: "https://legacy.test/cover", profilePhotos: ["https://legacy.test/one", "https://legacy.test/two"], profileStatus: status, rejectionReason: status === "rejected" ? "Correct it" : "", verificationSubmissionVersion: status === "rejected" ? 1 : 0 });
}

async function admission(actorId: Types.ObjectId, surface: ImageModerationSurface, reference: string) {
  const entityBinding = `PENDING:${actorId}:${surface}`;
  const asset = await ImageModerationAsset.create({ assetReference: `ima_${new Types.ObjectId()}`, actorId, contentSha256: sha, providerAssetId: `provider_${new Types.ObjectId()}`, trustedMediaReference: reference, expiresAt: future(), retentionDeadline: future() });
  const attempt = await ImageModerationAttempt.create({ attemptReference: `imat_${new Types.ObjectId()}`, assetId: asset._id, actorId, contentSha256: sha, surface, entityBinding, status: "PASSED", provenanceModel: { identifier: "test", revision: "test", artifactSha256: sha }, policy: { key: "TEST", version: "V1" }, expiresAt: future(), retentionDeadline: future() });
  const record = await ImageAdmission.create({ admissionReference: `imauth_${new Types.ObjectId()}`, attemptId: attempt._id, assetId: asset._id, actorId, contentSha256: sha, surface, entityBinding, expiresAt: future() });
  return { asset, record };
}

async function media(actorId: Types.ObjectId, prefix = "new") {
  const avatar = await admission(actorId, "USER_PROFILE_AVATAR", `https://trusted.test/${prefix}-avatar`);
  const cover = await admission(actorId, "USER_PROFILE_COVER", `https://trusted.test/${prefix}-cover`);
  const one = await admission(actorId, "USER_PROFILE_PHOTO", `https://trusted.test/${prefix}-one`);
  const two = await admission(actorId, "USER_PROFILE_PHOTO", `https://trusted.test/${prefix}-two`);
  return { all: [avatar, cover, one, two], avatar, body: { avatar: claim(avatar.record.admissionReference), cover: claim(cover.record.admissionReference), profilePhotos: [claim(one.record.admissionReference), claim(two.record.admissionReference)] } };
}

async function completedSession(input: { userId: Types.ObjectId; profileId: Types.ObjectId; avatar: string; version: number; evidenceCount?: number }) {
  const session = await FaceVerificationSession.create({ sessionReference: `FACE_${new Types.ObjectId()}`, userId: input.userId, profileId: input.profileId, profileSubmissionVersion: input.version, avatarFingerprint: fingerprintAvatarReference(input.avatar), status: "CAPTURE_COMPLETE", isCurrent: true, challenges: [...challenges], requiredCaptureCount: 5, acceptedCaptureCount: 5, startedAt: new Date(), expiresAt: future(), captureCompletedAt: new Date() });
  await FaceVerificationEvidence.insertMany(challenges.slice(0, input.evidenceCount ?? 5).map((challenge, challengeIndex) => ({ evidenceReference: `E_${new Types.ObjectId()}`, sessionId: session._id, userId: input.userId, profileId: input.profileId, challengeIndex, challenge, cloudinaryPublicId: `face/${new Types.ObjectId()}`, status: "STORED", mimeType: "image/jpeg", bytes: 1, format: "jpg" })));
  return session;
}

const body = (username: string, imageClaims: Record<string, unknown>) => ({ username, realName: "Submitted User", dateOfBirth: "1990-01-01", mobileCountryCode: "+91", mobileNumber: "9876543210", country: "India", city: "Mumbai", languages: ["English"], interests: [], bio: "Submitted profile.", ...imageClaims });

test.before(async () => { process.env.NODE_ENV = "test"; await connectPhase7HDatabase(); });
test.beforeEach(async () => { await clearPhase7HDatabase(); setBiometricReferenceAvatarValidationDependenciesForTests({ reader: async () => Buffer.from("avatar"), detector: async () => detection }); });
test.after(async () => { setBiometricReferenceAvatarValidationDependenciesForTests(); await disconnectPhase7HDatabase(); });

test("initial/incomplete submission atomically commits media, request, job, evidence binding, and account activation", async () => {
  const account = await user(); const draft = await profile(account._id); const claims = await media(account._id);
  const session = await completedSession({ userId: account._id, profileId: draft._id, avatar: `https://trusted.test/new-avatar`, version: 1 });
  const response = await invoke(account._id, withUserProfileTextAdmission(String(account._id), body(draft.username, claims.body))) as { message: string; profileStatus: string; profile: unknown };
  const [stored, request, job, bound, accountAfter] = await Promise.all([UserProfile.findById(draft._id), ProfileVerificationRequest.findOne({ profileId: draft._id }), ProfileVerificationJob.findOne({ profileId: draft._id }), FaceVerificationSession.findById(session._id), User.findById(account._id)]);
  assert.equal(response.message, "Profile saved successfully"); assert.equal(response.profileStatus, "pending_verification"); assert.ok(response.profile); assert.equal(stored?.profileStatus, "pending_verification"); assert.equal(stored?.verificationSubmissionVersion, 1); assert.equal(accountAfter?.status, "active"); assert.equal(accountAfter?.mobileNumber, "9876543210"); assert.ok(request); assert.ok(job); assert.equal(String(bound?.verificationRequestId), String(request?._id)); assert.equal(await FaceVerificationEvidence.countDocuments({ sessionId: session._id, verificationRequestId: request?._id, status: "STORED" }), 5);
  for (const item of claims.all) assert.equal((await ImageAdmission.findById(item.record._id))?.status, "CONSUMED");
});

test("rejected resubmission advances only the profile submission version while verified edit does not", async () => {
  const account = await user("active"); const rejected = await profile(account._id, "rejected"); const claims = await media(account._id, "rejected");
  await completedSession({ userId: account._id, profileId: rejected._id, avatar: "https://trusted.test/rejected-avatar", version: 2 });
  await invoke(account._id, withUserProfileTextAdmission(String(account._id), body(rejected.username, claims.body)));
  assert.equal((await UserProfile.findById(rejected._id))?.verificationSubmissionVersion, 2);
  const verified = await profile((await user("active"))._id, "verified");
  const verifiedBody = { ...body(verified.username, { avatar: unchanged(verified.avatar), cover: unchanged(verified.cover), profilePhotos: [unchanged(verified.profilePhotos[0]), unchanged(verified.profilePhotos[1])] }), bio: "Verified edit." };
  await invoke(verified.userId, withUserProfileTextAdmission(String(verified.userId), verifiedBody));
  const edited = await UserProfile.findById(verified._id); assert.equal(edited?.profileStatus, "verified"); assert.equal(edited?.verificationSubmissionVersion, 0); assert.equal(edited?.bio, "Verified edit.");
});

test("rejects raw, foreign, missing-session, fingerprint-mismatched, and version-mismatched submissions without consumption", async () => {
  const account = await user(); const draft = await profile(account._id); const claims = await media(account._id, "reject");
  await assert.rejects(invoke(account._id, withUserProfileTextAdmission(String(account._id), body(draft.username, { avatar: "https://attacker.test/a", cover: "https://attacker.test/c", profilePhotos: ["a", "b"] }))), /Invalid avatar media claim/);
  await assert.rejects(invoke(account._id, withUserProfileTextAdmission(String(account._id), body(draft.username, claims.body))), /Complete live face verification/);
  await completedSession({ userId: account._id, profileId: draft._id, avatar: "https://wrong.test/avatar", version: 1 });
  await assert.rejects(invoke(account._id, withUserProfileTextAdmission(String(account._id), body(draft.username, claims.body))), /Complete live face verification/);
  await FaceVerificationSession.updateOne({ profileId: draft._id }, { $set: { avatarFingerprint: fingerprintAvatarReference("https://trusted.test/reject-avatar"), profileSubmissionVersion: 2 } });
  await assert.rejects(invoke(account._id, withUserProfileTextAdmission(String(account._id), body(draft.username, claims.body))), /Complete live face verification/);
  const other = await media(new Types.ObjectId(), "foreign");
  await assert.rejects(invoke(account._id, withUserProfileTextAdmission(String(account._id), body(draft.username, { ...claims.body, avatar: claim(other.avatar.record.admissionReference) }))), /Avatar image admission/);
  assert.equal((await ImageAdmission.findById(claims.avatar.record._id))?.status, "ACTIVE");
});

test("missing bound evidence and job failure abort all profile, admission, account, and request writes", async () => {
  const account = await user(); const draft = await profile(account._id); const claims = await media(account._id, "rollback");
  await completedSession({ userId: account._id, profileId: draft._id, avatar: "https://trusted.test/rollback-avatar", version: 1, evidenceCount: 4 });
  await assert.rejects(invoke(account._id, withUserProfileTextAdmission(String(account._id), body(draft.username, claims.body))), /evidence is no longer eligible/);
  assert.equal((await UserProfile.findById(draft._id))?.profileStatus, "incomplete"); assert.equal((await User.findById(account._id))?.status, "pending_profile"); assert.equal(await ProfileVerificationRequest.countDocuments({ profileId: draft._id }), 0); assert.equal((await ImageAdmission.findById(claims.avatar.record._id))?.status, "ACTIVE");

  await FaceVerificationEvidence.deleteMany({ sessionId: (await FaceVerificationSession.findOne({ profileId: draft._id }))?._id }); await FaceVerificationSession.deleteMany({ profileId: draft._id });
  await completedSession({ userId: account._id, profileId: draft._id, avatar: "https://trusted.test/rollback-avatar", version: 1 });
  const original = profileVerificationJobRepository.create.bind(profileVerificationJobRepository); profileVerificationJobRepository.create = async () => { throw new Error("job persistence failure"); };
  try { await assert.rejects(invoke(account._id, withUserProfileTextAdmission(String(account._id), body(draft.username, claims.body))), /job persistence failure/); } finally { profileVerificationJobRepository.create = original; }
  assert.equal((await UserProfile.findById(draft._id))?.profileStatus, "incomplete"); assert.equal(await ProfileVerificationRequest.countDocuments({ profileId: draft._id }), 0); assert.equal((await ImageAdmission.findById(claims.avatar.record._id))?.status, "ACTIVE");
});

test("unchanged media must belong to the profile and expired avatar admissions are rejected before submission", async () => {
  const account = await user("active"); const verified = await profile(account._id, "verified");
  const foreignUnchanged = body(verified.username, { avatar: unchanged("https://attacker.test/avatar"), cover: unchanged(verified.cover), profilePhotos: [unchanged(verified.profilePhotos[0]), unchanged(verified.profilePhotos[1])] });
  await assert.rejects(invoke(account._id, withUserProfileTextAdmission(String(account._id), foreignUnchanged)), /unchanged reference/);

  const pending = await user(); const draft = await profile(pending._id); const claims = await media(pending._id, "expired");
  await ImageAdmission.collection.updateOne({ _id: claims.avatar.record._id }, { $set: { expiresAt: new Date(0) } });
  await completedSession({ userId: pending._id, profileId: draft._id, avatar: "https://trusted.test/expired-avatar", version: 1 });
  await assert.rejects(invoke(pending._id, withUserProfileTextAdmission(String(pending._id), body(draft.username, claims.body))), /Avatar image admission/);
  assert.equal((await ImageAdmission.findById(claims.avatar.record._id))?.status, "ACTIVE");
});

test("account persistence failure rolls back submission writes", async () => {
  const account = await user(); const draft = await profile(account._id); const claims = await media(account._id, "account-rollback");
  await completedSession({ userId: account._id, profileId: draft._id, avatar: "https://trusted.test/account-rollback-avatar", version: 1 });
  await User.deleteOne({ _id: account._id });
  await assert.rejects(invoke(account._id, withUserProfileTextAdmission(String(account._id), body(draft.username, claims.body))), /ACCOUNT_NOT_FOUND/);
  assert.equal((await UserProfile.findById(draft._id))?.profileStatus, "incomplete");
  assert.equal(await ProfileVerificationRequest.countDocuments({ profileId: draft._id }), 0);
  assert.equal((await ImageAdmission.findById(claims.avatar.record._id))?.status, "ACTIVE");
});

test("a null completed-session binding aborts the entire submission transaction", async () => {
  const account = await user(); const draft = await profile(account._id); const claims = await media(account._id, "null-bind");
  await completedSession({ userId: account._id, profileId: draft._id, avatar: "https://trusted.test/null-bind-avatar", version: 1 });
  const original = faceVerificationSessionRepository.bindCompletedToRequest.bind(faceVerificationSessionRepository);
  faceVerificationSessionRepository.bindCompletedToRequest = async () => null;
  try {
    await assert.rejects(invoke(account._id, withUserProfileTextAdmission(String(account._id), body(draft.username, claims.body))), /no longer eligible/);
  } finally {
    faceVerificationSessionRepository.bindCompletedToRequest = original;
  }
  assert.equal((await UserProfile.findById(draft._id))?.profileStatus, "incomplete");
  assert.equal(await ProfileVerificationRequest.countDocuments({ profileId: draft._id }), 0);
  assert.equal((await User.findById(account._id))?.status, "pending_profile");
  assert.equal((await ImageAdmission.findById(claims.avatar.record._id))?.status, "ACTIVE");
});

test("verified avatar replacement invalidates only incompatible completed face sessions", async () => {
  const account = await user("active"); const verified = await profile(account._id, "verified"); const claims = await media(account._id, "verified-avatar");
  const old = await completedSession({ userId: account._id, profileId: verified._id, avatar: verified.avatar, version: 1 });
  await invoke(account._id, withUserProfileTextAdmission(String(account._id), body(verified.username, claims.body)));
  assert.equal((await FaceVerificationSession.findById(old._id))?.status, "INVALIDATED");
  assert.equal(await ProfileVerificationRequest.countDocuments({ profileId: verified._id }), 0);
  assert.equal((await UserProfile.findById(verified._id))?.verificationSubmissionVersion, 0);
});
