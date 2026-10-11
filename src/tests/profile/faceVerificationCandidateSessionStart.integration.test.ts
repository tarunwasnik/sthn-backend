import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";

import { ImageAdmission } from "../../models/imageAdmission.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { ImageModerationAttempt } from "../../models/imageModerationAttempt.model";
import { UserProfile } from "../../models/userProfile.model";
import User from "../../models/User";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { acceptFaceVerificationCapture, startFaceVerificationSession } from "../../services/profile/faceVerificationSession.service";
import { setBiometricReferenceAvatarValidationDependenciesForTests } from "../../services/profile/profileVerificationReferenceAvatarValidation.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

const sha = "a".repeat(64);
const storage = require("../../services/profile/faceVerificationEvidenceStorage.service") as { storeFaceVerificationEvidence: (input: { buffer: Buffer; publicId: string }) => Promise<unknown> };
const originalStore = storage.storeFaceVerificationEvidence;
const detection = { width: 100, height: 100, decodedBytes: 30_000, faces: [{ x: 30, y: 30, width: 40, height: 40, confidence: 0.9, landmarks: { rightEye: { x: 40, y: 42 }, leftEye: { x: 55, y: 42 }, noseTip: { x: 48, y: 50 }, rightMouthCorner: { x: 42, y: 60 }, leftMouthCorner: { x: 54, y: 60 } } }] } as const;
const reference = (suffix: string) => `https://res.cloudinary.com/demo/image/upload/v1/sthn/${suffix}.jpg`;
const file = (index: number) => ({ buffer: Buffer.from([0xff, 0xd8, 0xff, index]), mimetype: "image/jpeg", size: 4, originalname: "capture.jpg" }) as Express.Multer.File;

async function rejectedProfile() {
  const user = await User.create({ email: `candidate-${new Types.ObjectId()}@test.local`, password: "test-password", status: "active", governanceState: "ACTIVE" });
  const profile = await UserProfile.create({ userId: user._id, username: `candidate-${new Types.ObjectId()}`, realName: "Candidate", dateOfBirth: new Date("1990-01-01"), country: "India", city: "Mumbai", languages: ["English"], interests: [], bio: "Rejected profile.", avatar: reference("persisted-avatar"), cover: reference("cover"), profilePhotos: [reference("one"), reference("two")], profileStatus: "rejected", rejectionReason: "Please correct", verificationSubmissionVersion: 2 });
  return { user, profile };
}

async function approvedAvatarAdmission(actorId: Types.ObjectId, input: { mediaReference?: string; surface?: "USER_PROFILE_AVATAR" | "USER_PROFILE_COVER"; expiresAt?: Date; status?: "ACTIVE" | "CONSUMED" } = {}) {
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 5 * 60_000);
  const surface = input.surface ?? "USER_PROFILE_AVATAR";
  const asset = await ImageModerationAsset.create({ assetReference: `ima_${new Types.ObjectId()}`, actorId, contentSha256: sha, providerAssetId: `provider_${new Types.ObjectId()}`, trustedMediaReference: input.mediaReference ?? reference(`candidate-${new Types.ObjectId()}`), expiresAt, retentionDeadline: expiresAt });
  const attempt = await ImageModerationAttempt.create({ attemptReference: `imat_${new Types.ObjectId()}`, assetId: asset._id, actorId, contentSha256: sha, surface, entityBinding: `PENDING:${actorId}:${surface}`, status: "PASSED", provenanceModel: { identifier: "test", revision: "test", artifactSha256: sha }, policy: { key: "TEST", version: "V1" }, expiresAt, retentionDeadline: expiresAt });
  const admission = await ImageAdmission.create({ admissionReference: `imauth_${new Types.ObjectId()}`, attemptId: attempt._id, assetId: asset._id, actorId, contentSha256: sha, surface, entityBinding: attempt.entityBinding, expiresAt, status: input.status ?? "ACTIVE" });
  return { asset, attempt, admission };
}

test.before(async () => { process.env.NODE_ENV = "test"; await connectPhase7HDatabase(); });
test.beforeEach(async () => {
  await clearPhase7HDatabase();
  setBiometricReferenceAvatarValidationDependenciesForTests({ reader: async () => Buffer.from("candidate-avatar"), detector: async () => detection });
  storage.storeFaceVerificationEvidence = async (input) => ({ publicId: input.publicId, bytes: input.buffer.length, format: "jpeg", mimeType: "image/jpeg" });
});
test.after(async () => { setBiometricReferenceAvatarValidationDependenciesForTests(); storage.storeFaceVerificationEvidence = originalStore; await disconnectPhase7HDatabase(); });

test("rejected candidate claims bind immutable authority without mutating or consuming media", async () => {
  const { user, profile } = await rejectedProfile();
  const admission = await approvedAvatarAdmission(user._id);
  const session = await startFaceVerificationSession({ userId: String(user._id), candidateAvatar: { kind: "ADMISSION", admissionReference: admission.admission.admissionReference } });
  const stored = await FaceVerificationSession.findById(session._id);
  assert.equal(stored?.avatarCandidate?.kind, "ADMISSION");
  assert.equal(stored?.avatarCandidate?.kind === "ADMISSION" && stored.avatarCandidate.admissionReference, admission.admission.admissionReference);
  assert.equal((await UserProfile.findById(profile._id))?.avatar, profile.avatar);
  assert.equal((await ImageAdmission.findById(admission.admission._id))?.status, "ACTIVE");
  assert.ok(session.expiresAt.getTime() <= admission.admission.expiresAt.getTime());
  assert.equal(String((await startFaceVerificationSession({ userId: String(user._id), candidateAvatar: { kind: "ADMISSION", admissionReference: admission.admission.admissionReference } }))._id), String(session._id));
  for (let index = 0; index < 5; index += 1) await acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: String(index), file: file(index) });
  assert.equal((await FaceVerificationSession.findById(session._id))?.status, "CAPTURE_COMPLETE");
});

test("rejected unchanged candidates and changed admission identities isolate sessions", async () => {
  const { user, profile } = await rejectedProfile();
  const unchanged = await startFaceVerificationSession({ userId: String(user._id), candidateAvatar: { kind: "UNCHANGED", reference: profile.avatar } });
  assert.equal(unchanged.avatarCandidate?.kind, "PROFILE_REFERENCE");
  const first = await approvedAvatarAdmission(user._id, { mediaReference: reference("same-content") });
  const second = await approvedAvatarAdmission(user._id, { mediaReference: reference("same-content") });
  const admissionOne = await startFaceVerificationSession({ userId: String(user._id), candidateAvatar: { kind: "ADMISSION", admissionReference: first.admission.admissionReference } });
  const admissionTwo = await startFaceVerificationSession({ userId: String(user._id), candidateAvatar: { kind: "ADMISSION", admissionReference: second.admission.admissionReference } });
  assert.notEqual(String(admissionOne._id), String(admissionTwo._id));
  assert.equal((await FaceVerificationSession.findById(unchanged._id))?.status, "INVALIDATED");
  assert.equal((await FaceVerificationSession.findById(admissionOne._id))?.status, "INVALIDATED");
  assert.equal((await FaceVerificationSession.findById(admissionTwo._id))?.avatarCandidate?.kind, "ADMISSION");
});

test("rejected session start rejects raw, ambiguous, malformed, foreign, wrong-surface, expired, and consumed candidates", async () => {
  const { user, profile } = await rejectedProfile();
  await assert.rejects(() => startFaceVerificationSession({ userId: String(user._id), avatar: profile.avatar }), /candidate claim/);
  await assert.rejects(() => startFaceVerificationSession({ userId: String(user._id), avatar: profile.avatar, candidateAvatar: { kind: "UNCHANGED", reference: profile.avatar } }), /either avatar or candidateAvatar/);
  await assert.rejects(() => startFaceVerificationSession({ userId: String(user._id), candidateAvatar: { kind: "UNCHANGED", reference: reference("other") } }), /does not match/);
  await assert.rejects(() => startFaceVerificationSession({ userId: String(user._id), candidateAvatar: { kind: "ADMISSION", admissionReference: "bad" } }), /Invalid candidateAvatar/);
  const foreign = await approvedAvatarAdmission(new Types.ObjectId());
  const cover = await approvedAvatarAdmission(user._id, { surface: "USER_PROFILE_COVER" });
  const expired = await approvedAvatarAdmission(user._id, { expiresAt: new Date(Date.now() - 1) });
  const consumed = await approvedAvatarAdmission(user._id, { status: "CONSUMED" });
  for (const item of [foreign, cover, expired, consumed]) {
    await assert.rejects(() => startFaceVerificationSession({ userId: String(user._id), candidateAvatar: { kind: "ADMISSION", admissionReference: item.admission.admissionReference } }), /not eligible/);
  }
});

test("persisted legacy incomplete avatar remains compatible without replacement", async () => {
  const user = await User.create({ email: `legacy-${new Types.ObjectId()}@test.local`, password: "test-password", status: "pending_profile", governanceState: "ACTIVE" });
  const avatar = reference("legacy-avatar");
  const profile = await UserProfile.create({ userId: user._id, username: `legacy-${new Types.ObjectId()}`, bio: "", interests: [], avatar, cover: "", profilePhotos: [], profileStatus: "incomplete", verificationSubmissionVersion: 0 });
  const session = await startFaceVerificationSession({ userId: String(user._id), avatar });
  assert.equal(session.avatarCandidate, undefined);
  assert.equal((await UserProfile.findById(session.profileId))?.avatar, avatar);
  await assert.rejects(() => startFaceVerificationSession({ userId: String(user._id), avatar: reference("legacy-replacement") }), /must match the persisted profile avatar/);
  assert.equal((await UserProfile.findById(profile._id))?.avatar, avatar);
});
