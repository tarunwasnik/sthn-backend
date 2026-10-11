import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import mongoose, { Types } from "mongoose";

import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { ImageAdmission } from "../../models/imageAdmission.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { ImageModerationAttempt } from "../../models/imageModerationAttempt.model";
import { ProfileMediaCleanupJob } from "../../models/profileMediaCleanupJob.model";
import { ProviderAssetReference } from "../../models/providerAssetReference.model";
import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import type { FaceVerificationAvatarCandidate } from "../../models/faceVerificationSession.model";
import { ProfileVerificationJob } from "../../models/profileVerificationJob.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { ImageModerationSurface } from "../../enums/imageModeration.enums";
import { updateMyProfile } from "../../controllers/profile.controller";
import { profileMediaAdmissionPersistenceService } from "../../services/profile/profileMediaAdmissionPersistence.service";
import { profileSubmissionAccountPersistenceService } from "../../services/profile/profileSubmissionAccountPersistence.service";
import { providerAssetReferenceTransactionService } from "../../services/profile/providerAssetReferenceTransaction.service";
import { fingerprintAvatarReference } from "../../services/profile/faceVerificationSession.service";
import { setBiometricReferenceAvatarValidationDependenciesForTests } from "../../services/profile/profileVerificationReferenceAvatarValidation.service";
import { profileVerificationJobRepository } from "../../repositories/profileVerificationJob.repository";
import { withUserProfileTextAdmission } from "../textModeration/helpers/textModerationTestAdmission";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

const sha = "a".repeat(64);
const future = () => new Date(Date.now() + 60_000);
const claim = (admissionReference: string) => ({ kind: "ADMISSION" as const, admissionReference });
const unchanged = (reference: string) => ({ kind: "UNCHANGED" as const, reference });
const challenges = ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "LOOK_DOWN"] as const;
const referenceDetection = { width: 100, height: 100, decodedBytes: 30_000, faces: [{ x: 30, y: 30, width: 40, height: 40, confidence: 0.9, landmarks: { rightEye: { x: 40, y: 42 }, leftEye: { x: 55, y: 42 }, noseTip: { x: 48, y: 50 }, rightMouthCorner: { x: 42, y: 60 }, leftMouthCorner: { x: 54, y: 60 } } }] } as const;

const invoke = (userId: Types.ObjectId, body: Record<string, unknown>) => new Promise<unknown>((resolve, reject) => {
  const response = { status: () => response, json: (value: unknown) => { resolve(value); return response; } } as unknown as Response;
  updateMyProfile({ user: { id: userId.toString(), role: "user", status: "active" }, body } as unknown as Request, response, reject as NextFunction);
});

async function seedUser(status: "pending_profile" | "active" = "active") {
  return User.create({ email: `profile-patch-${new Types.ObjectId()}@test.local`, password: "test", status, governanceState: "ACTIVE" });
}

async function seedProfile(userId: Types.ObjectId, profileStatus: "incomplete" | "verified" | "pending_verification" | "rejected") {
  return UserProfile.create({
    userId, username: `patch-${new Types.ObjectId()}`, realName: "Existing User", dateOfBirth: new Date("1990-01-01"),
    country: "India", city: "Mumbai", languages: ["English"], interests: ["Music"], bio: "Existing profile.",
    avatar: "https://stored.test/avatar", cover: "https://stored.test/cover", profilePhotos: ["https://stored.test/photo-one", "https://stored.test/photo-two"],
    profileStatus, rejectionReason: profileStatus === "rejected" ? "Correct it." : "", verificationSubmissionVersion: profileStatus === "rejected" ? 1 : 0,
  });
}

async function seedAdmission(actorId: Types.ObjectId, surface: ImageModerationSurface, trustedMediaReference: string) {
  const entityBinding = `PENDING:${actorId}:${surface}`;
  const asset = await ImageModerationAsset.create({ assetReference: `ima_${new Types.ObjectId()}`, actorId, contentSha256: sha, providerAssetId: `provider_${new Types.ObjectId()}`, trustedMediaReference, expiresAt: future(), retentionDeadline: future() });
  const attempt = await ImageModerationAttempt.create({ attemptReference: `imat_${new Types.ObjectId()}`, assetId: asset._id, actorId, contentSha256: sha, surface, entityBinding, status: "PASSED", provenanceModel: { identifier: "test", revision: "test", artifactSha256: sha }, policy: { key: "TEST", version: "V1" }, expiresAt: future(), retentionDeadline: future() });
  const admission = await ImageAdmission.create({ admissionReference: `imauth_${new Types.ObjectId()}`, attemptId: attempt._id, assetId: asset._id, actorId, contentSha256: sha, surface, entityBinding, expiresAt: future() });
  return { asset, admission };
}
const admissionCandidate = (input: Awaited<ReturnType<typeof seedAdmission>>): FaceVerificationAvatarCandidate => ({ kind: "ADMISSION", admissionId: input.admission._id, admissionReference: input.admission.admissionReference, assetId: input.asset._id, trustedMediaReference: input.asset.trustedMediaReference, contentSha256: input.admission.contentSha256, fingerprint: fingerprintAvatarReference(input.asset.trustedMediaReference), expiresAt: input.admission.expiresAt });

async function seedTrackedFormerMedia(profile: Awaited<ReturnType<typeof seedProfile>>, slot: string, reference: string) {
  const asset = await ImageModerationAsset.create({ assetReference: `ima_${new Types.ObjectId()}`, actorId: profile.userId, contentSha256: sha, providerAssetId: `profile_media/${new Types.ObjectId()}`, trustedMediaReference: reference, status: "COMMITTED", expiresAt: future(), retentionDeadline: future(), committedAt: new Date(), committedEntityBinding: `USER_PROFILE:${profile._id}:${slot}` });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const trusted = await providerAssetReferenceTransactionService.resolveTrustedCommittedAsset({ session, actorId: profile.userId, assetId: asset._id, destinationBinding: `USER_PROFILE:${profile._id}:${slot}` });
      await providerAssetReferenceTransactionService.acquireTrusted({ session, entity: { entityType: "USER_PROFILE", entityId: profile._id, slot }, trusted });
    });
  } finally { await session.endSession(); }
  return asset;
}

async function completedSession(input: { userId: Types.ObjectId; profileId: Types.ObjectId; avatar: string; version: number; evidenceCount?: number; avatarCandidate?: FaceVerificationAvatarCandidate }) {
  const session = await FaceVerificationSession.create({
    sessionReference: `FACE_${new Types.ObjectId()}`, userId: input.userId, profileId: input.profileId,
    profileSubmissionVersion: input.version, avatarFingerprint: fingerprintAvatarReference(input.avatar), status: "CAPTURE_COMPLETE",
    isCurrent: true, challenges: [...challenges], requiredCaptureCount: 5, acceptedCaptureCount: 5,
    startedAt: new Date(), expiresAt: future(), captureCompletedAt: new Date(), avatarCandidate: input.avatarCandidate,
  });
  await FaceVerificationEvidence.insertMany(challenges.slice(0, input.evidenceCount ?? 5).map((challenge, challengeIndex) => ({
    evidenceReference: `E_${new Types.ObjectId()}`, sessionId: session._id, userId: input.userId, profileId: input.profileId,
    challengeIndex, challenge, cloudinaryPublicId: `face/${new Types.ObjectId()}`, status: "STORED", mimeType: "image/jpeg", bytes: 1, format: "jpg",
  })));
  return session;
}

test.before(async () => { process.env.NODE_ENV = "test"; await connectPhase7HDatabase(); });
test.beforeEach(async () => { await clearPhase7HDatabase(); setBiometricReferenceAvatarValidationDependenciesForTests({ reader: async () => Buffer.from("avatar"), detector: async () => referenceDetection }); });
test.after(async () => { setBiometricReferenceAvatarValidationDependenciesForTests(); await disconnectPhase7HDatabase(); });

test("incomplete PATCH commits admitted media transactionally without activating the account", async () => {
  const account = await seedUser("pending_profile");
  const profile = await seedProfile(account._id, "incomplete");
  const former = await seedTrackedFormerMedia(profile, "avatar", profile.avatar);
  const replacement = await seedAdmission(account._id, "USER_PROFILE_AVATAR", "https://trusted.test/incomplete-avatar");

  await invoke(account._id, { realName: "Updated Draft", avatar: claim(replacement.admission.admissionReference) });

  const [stored, accountAfter, admission, cleanup] = await Promise.all([
    UserProfile.findById(profile._id), User.findById(account._id), ImageAdmission.findById(replacement.admission._id), ProfileMediaCleanupJob.findOne({ formerReference: former.trustedMediaReference }),
  ]);
  assert.equal(stored?.profileStatus, "incomplete");
  assert.equal(stored?.realName, "Updated Draft");
  assert.equal(stored?.avatar, "https://trusted.test/incomplete-avatar");
  assert.equal(accountAfter?.status, "pending_profile");
  assert.equal(admission?.status, "CONSUMED");
  assert.equal(cleanup?.cloudinaryPublicId, former.providerAssetId);
});

test("verified PATCH retains unchanged authoritative media and supports partial non-media updates", async () => {
  const account = await seedUser();
  const profile = await seedProfile(account._id, "verified");
  const tracked = await Promise.all([
    seedTrackedFormerMedia(profile, "avatar", profile.avatar), seedTrackedFormerMedia(profile, "cover", profile.cover),
    seedTrackedFormerMedia(profile, "photo:0", profile.profilePhotos[0]), seedTrackedFormerMedia(profile, "photo:1", profile.profilePhotos[1]),
  ]);
  await invoke(account._id, { country: "India", avatar: unchanged(profile.avatar), cover: unchanged(profile.cover), profilePhotos: profile.profilePhotos.map(unchanged) });
  await invoke(account._id, { city: "Delhi" });

  const stored = await UserProfile.findById(profile._id);
  assert.equal(stored?.profileStatus, "verified");
  assert.equal(stored?.city, "Delhi");
  assert.equal(await ProviderAssetReference.countDocuments({ imageModerationAssetId: { $in: tracked.map((asset) => asset._id) }, state: "CURRENT" }), 4);
  assert.equal(await ProfileMediaCleanupJob.countDocuments(), 0);
});

test("migrated PATCH rejects raw, foreign, and consumed admissions without mutation", async () => {
  const account = await seedUser();
  const profile = await seedProfile(account._id, "verified");
  await assert.rejects(invoke(account._id, { avatar: "https://attacker.test/raw" }), /Invalid avatar media claim/);
  const foreign = await seedAdmission(new Types.ObjectId(), "USER_PROFILE_AVATAR", "https://trusted.test/foreign");
  const consumed = await seedAdmission(account._id, "USER_PROFILE_COVER", "https://trusted.test/consumed");
  await ImageAdmission.updateOne({ _id: consumed.admission._id }, { $set: { status: "CONSUMED" } });
  await assert.rejects(invoke(account._id, { avatar: claim(foreign.admission.admissionReference) }), /not valid for this actor and surface/);
  await assert.rejects(invoke(account._id, { cover: claim(consumed.admission.admissionReference) }), /not valid for this actor and surface/);
  assert.equal((await UserProfile.findById(profile._id))?.avatar, profile.avatar);
  assert.equal((await ImageAdmission.findById(foreign.admission._id))?.status, "ACTIVE");
});

test("migrated PATCH detects an optimistic version conflict without consuming media", async () => {
  const account = await seedUser();
  const profile = await seedProfile(account._id, "verified");
  const replacement = await seedAdmission(account._id, "USER_PROFILE_AVATAR", "https://trusted.test/stale-avatar");
  const original = profileMediaAdmissionPersistenceService.persist.bind(profileMediaAdmissionPersistenceService);
  profileMediaAdmissionPersistenceService.persist = async (input) => {
    await UserProfile.updateOne({ _id: profile._id }, { $set: { city: "Concurrent change" }, $inc: { __v: 1 } });
    return original(input);
  };
  try {
    await assert.rejects(invoke(account._id, { avatar: claim(replacement.admission.admissionReference) }), /PROFILE_MEDIA_VERSION_CONFLICT/);
  } finally { profileMediaAdmissionPersistenceService.persist = original; }
  assert.equal((await ImageAdmission.findById(replacement.admission._id))?.status, "ACTIVE");
  assert.equal((await UserProfile.findById(profile._id))?.avatar, profile.avatar);
});

test("migrated PATCH rolls back media and cleanup work when account persistence fails", async () => {
  const account = await seedUser();
  const profile = await seedProfile(account._id, "incomplete");
  await seedTrackedFormerMedia(profile, "avatar", profile.avatar);
  const replacement = await seedAdmission(account._id, "USER_PROFILE_AVATAR", "https://trusted.test/rollback-avatar");
  const original = profileSubmissionAccountPersistenceService.persist.bind(profileSubmissionAccountPersistenceService);
  profileSubmissionAccountPersistenceService.persist = async () => { throw new Error("account callback failure"); };
  try {
    await assert.rejects(invoke(account._id, { avatar: claim(replacement.admission.admissionReference) }), /account callback failure/);
  } finally { profileSubmissionAccountPersistenceService.persist = original; }
  assert.equal((await UserProfile.findById(profile._id))?.avatar, profile.avatar);
  assert.equal((await ImageAdmission.findById(replacement.admission._id))?.status, "ACTIVE");
  assert.equal(await ProfileMediaCleanupJob.countDocuments(), 0);
});

test("pending profiles remain locked and rejected PATCH requires a fresh session before transactional resubmission", async () => {
  const pendingAccount = await seedUser();
  const pending = await seedProfile(pendingAccount._id, "pending_verification");
  const admission = await seedAdmission(pendingAccount._id, "USER_PROFILE_AVATAR", "https://trusted.test/pending");
  await assert.rejects(invoke(pendingAccount._id, { avatar: claim(admission.admission.admissionReference) }), /pending verification/);
  assert.equal((await ImageAdmission.findById(admission.admission._id))?.status, "ACTIVE");

  const rejectedAccount = await seedUser();
  const rejected = await seedProfile(rejectedAccount._id, "rejected");
  await assert.rejects(invoke(rejectedAccount._id, withUserProfileTextAdmission(String(rejectedAccount._id), { bio: "Corrected profile." }, { bio: "Corrected profile.", interests: rejected.interests })), /fresh live face verification/);
  assert.equal((await UserProfile.findById(rejected._id))?.profileStatus, "rejected");
});

test("rejected PATCH atomically resubmits admitted media with five bound face captures", async () => {
  const account = await seedUser();
  const profile = await seedProfile(account._id, "rejected");
  const former = await seedTrackedFormerMedia(profile, "avatar", profile.avatar);
  const avatar = await seedAdmission(account._id, "USER_PROFILE_AVATAR", "https://trusted.test/rejected-avatar");
  const cover = await seedAdmission(account._id, "USER_PROFILE_COVER", "https://trusted.test/rejected-cover");
  const one = await seedAdmission(account._id, "USER_PROFILE_PHOTO", "https://trusted.test/rejected-one");
  const two = await seedAdmission(account._id, "USER_PROFILE_PHOTO", "https://trusted.test/rejected-two");
  const face = await completedSession({ userId: account._id, profileId: profile._id, avatar: "https://trusted.test/rejected-avatar", version: 2, avatarCandidate: admissionCandidate(avatar) });

  await invoke(account._id, { avatar: claim(avatar.admission.admissionReference), cover: claim(cover.admission.admissionReference), profilePhotos: [claim(one.admission.admissionReference), claim(two.admission.admissionReference)] });

  const [stored, request, job, boundFace, cleanup] = await Promise.all([
    UserProfile.findById(profile._id), ProfileVerificationRequest.findOne({ profileId: profile._id, isActive: true }),
    ProfileVerificationJob.findOne({ profileId: profile._id }), FaceVerificationSession.findById(face._id),
    ProfileMediaCleanupJob.findOne({ formerReference: former.trustedMediaReference }),
  ]);
  assert.equal(stored?.profileStatus, "pending_verification");
  assert.equal(stored?.verificationSubmissionVersion, 2);
  assert.ok(request); assert.ok(job);
  assert.equal(String(boundFace?.verificationRequestId), String(request?._id));
  assert.equal(await FaceVerificationEvidence.countDocuments({ sessionId: face._id, verificationRequestId: request?._id, status: "STORED" }), 5);
  assert.equal(cleanup?.cloudinaryPublicId, former.providerAssetId);
});

test("rejected PATCH cannot substitute admission B for a completed admission A session with the same fingerprint", async () => {
  const account = await seedUser();
  const profile = await seedProfile(account._id, "rejected");
  const sharedReference = "https://trusted.test/rejected-same-fingerprint";
  const admissionA = await seedAdmission(account._id, "USER_PROFILE_AVATAR", sharedReference);
  const admissionB = await seedAdmission(account._id, "USER_PROFILE_AVATAR", sharedReference);
  await completedSession({ userId: account._id, profileId: profile._id, avatar: sharedReference, version: 2, avatarCandidate: admissionCandidate(admissionA) });

  await assert.rejects(invoke(account._id, { avatar: claim(admissionB.admission.admissionReference) }), /fresh live face verification/);
  assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "rejected");
  assert.equal((await ImageAdmission.findById(admissionA.admission._id))?.status, "ACTIVE");
  assert.equal((await ImageAdmission.findById(admissionB.admission._id))?.status, "ACTIVE");
  assert.equal(await ProfileVerificationRequest.countDocuments({ profileId: profile._id }), 0);
});

test("rejected PATCH accepts unchanged claims but rejects raw, foreign, and consumed admissions", async () => {
  const account = await seedUser();
  const profile = await seedProfile(account._id, "rejected");
  await assert.rejects(invoke(account._id, { avatar: "https://attacker.test/raw" }), /Invalid avatar media claim/);
  const foreign = await seedAdmission(new Types.ObjectId(), "USER_PROFILE_AVATAR", "https://trusted.test/foreign-rejected");
  await assert.rejects(invoke(account._id, { avatar: claim(foreign.admission.admissionReference) }), /Avatar image admission is not eligible/);
  const consumed = await seedAdmission(account._id, "USER_PROFILE_AVATAR", "https://trusted.test/consumed-rejected");
  await ImageAdmission.updateOne({ _id: consumed.admission._id }, { $set: { status: "CONSUMED" } });
  await assert.rejects(invoke(account._id, { avatar: claim(consumed.admission.admissionReference) }), /Avatar image admission is not eligible/);

  await completedSession({ userId: account._id, profileId: profile._id, avatar: profile.avatar, version: 2 });
  await invoke(account._id, { avatar: unchanged(profile.avatar), cover: unchanged(profile.cover), profilePhotos: profile.profilePhotos.map(unchanged) });
  assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "pending_verification");
  assert.equal((await ImageAdmission.findById(foreign.admission._id))?.status, "ACTIVE");
});

test("rejected PATCH rolls back profile, media, request, and job when evidence or verification work fails", async () => {
  const account = await seedUser();
  const profile = await seedProfile(account._id, "rejected");
  const avatar = await seedAdmission(account._id, "USER_PROFILE_AVATAR", "https://trusted.test/rejected-rollback");
  await completedSession({ userId: account._id, profileId: profile._id, avatar: "https://trusted.test/rejected-rollback", version: 2, evidenceCount: 4, avatarCandidate: admissionCandidate(avatar) });
  await assert.rejects(invoke(account._id, { avatar: claim(avatar.admission.admissionReference) }), /Complete fresh live face verification/);
  assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "rejected");
  assert.equal((await ImageAdmission.findById(avatar.admission._id))?.status, "ACTIVE");
  assert.equal(await ProfileVerificationRequest.countDocuments({ profileId: profile._id }), 0);

  await FaceVerificationEvidence.create({ evidenceReference: `E_${new Types.ObjectId()}`, sessionId: (await FaceVerificationSession.findOne({ profileId: profile._id }))!._id, userId: account._id, profileId: profile._id, challengeIndex: 4, challenge: "LOOK_DOWN", cloudinaryPublicId: `face/${new Types.ObjectId()}`, status: "STORED", mimeType: "image/jpeg", bytes: 1, format: "jpg" });
  const original = profileVerificationJobRepository.create.bind(profileVerificationJobRepository);
  profileVerificationJobRepository.create = async () => { throw new Error("job persistence failure"); };
  try {
    await assert.rejects(invoke(account._id, { avatar: claim(avatar.admission.admissionReference) }), /job persistence failure/);
  } finally { profileVerificationJobRepository.create = original; }
  assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "rejected");
  assert.equal((await ImageAdmission.findById(avatar.admission._id))?.status, "ACTIVE");
  assert.equal(await ProfileVerificationRequest.countDocuments({ profileId: profile._id }), 0);
});

test("rejected PATCH rejects a stale snapshot without consuming its admission", async () => {
  const account = await seedUser();
  const profile = await seedProfile(account._id, "rejected");
  const avatar = await seedAdmission(account._id, "USER_PROFILE_AVATAR", "https://trusted.test/rejected-stale");
  await completedSession({ userId: account._id, profileId: profile._id, avatar: "https://trusted.test/rejected-stale", version: 2, avatarCandidate: admissionCandidate(avatar) });
  const original = profileMediaAdmissionPersistenceService.persist.bind(profileMediaAdmissionPersistenceService);
  profileMediaAdmissionPersistenceService.persist = async (input) => {
    await UserProfile.updateOne({ _id: profile._id }, { $set: { city: "Concurrent change" }, $inc: { __v: 1 } });
    return original(input);
  };
  try {
    await assert.rejects(invoke(account._id, { avatar: claim(avatar.admission.admissionReference) }), /PROFILE_MEDIA_VERSION_CONFLICT/);
  } finally { profileMediaAdmissionPersistenceService.persist = original; }
  assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "rejected");
  assert.equal((await ImageAdmission.findById(avatar.admission._id))?.status, "ACTIVE");
});
