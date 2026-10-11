import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";

import { FaceVerificationAvatarCandidate, FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { ImageAdmission } from "../../models/imageAdmission.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { ImageModerationAttempt } from "../../models/imageModerationAttempt.model";
import { UserProfile } from "../../models/userProfile.model";
import User from "../../models/User";
import { fingerprintAvatarReference, requireCompletedFaceSessionForRejectedResubmission } from "../../services/profile/faceVerificationSession.service";
import { setBiometricReferenceAvatarValidationDependenciesForTests } from "../../services/profile/profileVerificationReferenceAvatarValidation.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

const sha = "a".repeat(64);
const challenges = ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "LOOK_DOWN"] as const;
const detection = { width: 100, height: 100, decodedBytes: 30_000, faces: [{ x: 30, y: 30, width: 40, height: 40, confidence: 0.9, landmarks: { rightEye: { x: 40, y: 42 }, leftEye: { x: 55, y: 42 }, noseTip: { x: 48, y: 50 }, rightMouthCorner: { x: 42, y: 60 }, leftMouthCorner: { x: 54, y: 60 } } }] } as const;
const reference = (value: string) => `https://res.cloudinary.com/demo/image/upload/v1/sthn/${value}.jpg`;
type AdmissionCandidate = Extract<FaceVerificationAvatarCandidate, { kind: "ADMISSION" }>;

async function rejectedProfile() {
  const user = await User.create({ email: `rejected-candidate-${new Types.ObjectId()}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  const profile = await UserProfile.create({ userId: user._id, username: `rejected-candidate-${new Types.ObjectId()}`, realName: "Candidate", dateOfBirth: new Date("1990-01-01"), country: "India", city: "Mumbai", languages: ["English"], interests: [], bio: "Rejected profile", avatar: reference("persisted"), cover: reference("cover"), profilePhotos: [reference("one"), reference("two")], profileStatus: "rejected", rejectionReason: "Correct it", verificationSubmissionVersion: 2 });
  return { user, profile };
}

async function activeAdmission(actorId: Types.ObjectId, trustedMediaReference = reference(`admission-${new Types.ObjectId()}`), expiresAt = new Date(Date.now() + 60_000)) {
  const asset = await ImageModerationAsset.create({ assetReference: `ima_${new Types.ObjectId()}`, actorId, contentSha256: sha, providerAssetId: `provider_${new Types.ObjectId()}`, trustedMediaReference, expiresAt, retentionDeadline: expiresAt });
  const attempt = await ImageModerationAttempt.create({ attemptReference: `imat_${new Types.ObjectId()}`, assetId: asset._id, actorId, contentSha256: sha, surface: "USER_PROFILE_AVATAR", entityBinding: `PENDING:${actorId}:USER_PROFILE_AVATAR`, status: "PASSED", provenanceModel: { identifier: "test", revision: "test", artifactSha256: sha }, policy: { key: "TEST", version: "V1" }, expiresAt, retentionDeadline: expiresAt });
  const admission = await ImageAdmission.create({ admissionReference: `imauth_${new Types.ObjectId()}`, attemptId: attempt._id, assetId: asset._id, actorId, contentSha256: sha, surface: "USER_PROFILE_AVATAR", entityBinding: attempt.entityBinding, expiresAt });
  const candidate: AdmissionCandidate = { kind: "ADMISSION", admissionId: admission._id, admissionReference: admission.admissionReference, assetId: asset._id, trustedMediaReference, contentSha256: sha, fingerprint: fingerprintAvatarReference(trustedMediaReference), expiresAt };
  return { asset, admission, candidate };
}

async function completedSession(input: { userId: Types.ObjectId; profileId: Types.ObjectId; version?: number; avatar: string; candidate?: FaceVerificationAvatarCandidate; expiresAt?: Date; captures?: number; evidence?: number }) {
  const count = input.captures ?? 5;
  const session = await FaceVerificationSession.create({ sessionReference: `FACE_REJECTED_CANDIDATE_${new Types.ObjectId()}`, userId: input.userId, profileId: input.profileId, profileSubmissionVersion: input.version ?? 3, avatarFingerprint: fingerprintAvatarReference(input.avatar), avatarCandidate: input.candidate, status: "CAPTURE_COMPLETE", isCurrent: true, challenges: [...challenges], requiredCaptureCount: 5, acceptedCaptureCount: count, startedAt: new Date(), expiresAt: input.expiresAt ?? new Date(Date.now() + 60_000), captureCompletedAt: new Date() });
  await FaceVerificationEvidence.insertMany(challenges.slice(0, input.evidence ?? count).map((challenge, challengeIndex) => ({ evidenceReference: `FACE_REJECTED_EVIDENCE_${new Types.ObjectId()}`, sessionId: session._id, userId: input.userId, profileId: input.profileId, challengeIndex, challenge, cloudinaryPublicId: `face/${new Types.ObjectId()}`, status: "STORED", mimeType: "image/jpeg", bytes: 1, format: "jpg" })));
  return session;
}

test.before(async () => { process.env.NODE_ENV = "test"; await connectPhase7HDatabase(); });
test.beforeEach(async () => { await clearPhase7HDatabase(); setBiometricReferenceAvatarValidationDependenciesForTests({ reader: async () => Buffer.from("test-avatar"), detector: async () => detection }); });
test.after(async () => { setBiometricReferenceAvatarValidationDependenciesForTests(); await disconnectPhase7HDatabase(); });

test("accepts matching profile-reference and explicitly grandfathered legacy candidates", async () => {
  const { user, profile } = await rejectedProfile();
  const profileCandidate: FaceVerificationAvatarCandidate = { kind: "PROFILE_REFERENCE", trustedMediaReference: profile.avatar, fingerprint: fingerprintAvatarReference(profile.avatar) };
  const candidateSession = await completedSession({ userId: user._id, profileId: profile._id, avatar: profile.avatar, candidate: profileCandidate });
  assert.equal(String((await requireCompletedFaceSessionForRejectedResubmission({ userId: String(user._id), avatar: profile.avatar, avatarCandidate: profileCandidate }))._id), String(candidateSession._id));
  assert.equal(String((await requireCompletedFaceSessionForRejectedResubmission({ userId: String(user._id), avatar: profile.avatar }))._id), String(candidateSession._id));
  await FaceVerificationSession.deleteMany({ profileId: profile._id }); await FaceVerificationEvidence.deleteMany({ profileId: profile._id });
  const legacy = await completedSession({ userId: user._id, profileId: profile._id, avatar: profile.avatar });
  assert.equal(String((await requireCompletedFaceSessionForRejectedResubmission({ userId: String(user._id), avatar: profile.avatar }))._id), String(legacy._id));
});

test("accepts only the exact active admission candidate without mutation or consumption", async () => {
  const { user, profile } = await rejectedProfile();
  const admitted = await activeAdmission(user._id);
  const session = await completedSession({ userId: user._id, profileId: profile._id, avatar: admitted.candidate.trustedMediaReference, candidate: admitted.candidate });
  const matched = await requireCompletedFaceSessionForRejectedResubmission({ userId: String(user._id), avatar: admitted.candidate.trustedMediaReference, avatarCandidate: admitted.candidate });
  assert.equal(String(matched._id), String(session._id));
  assert.equal((await ImageAdmission.findById(admitted.admission._id))?.status, "ACTIVE");
  assert.equal((await UserProfile.findById(profile._id))?.avatar, profile.avatar);
});

test("does not let admission A authorize B, including same-fingerprint candidates", async () => {
  const { user, profile } = await rejectedProfile();
  const sharedReference = reference("same-fingerprint");
  const first = await activeAdmission(user._id, sharedReference);
  const second = await activeAdmission(user._id, sharedReference);
  await completedSession({ userId: user._id, profileId: profile._id, avatar: sharedReference, candidate: first.candidate });
  await assert.rejects(() => requireCompletedFaceSessionForRejectedResubmission({ userId: String(user._id), avatar: sharedReference, avatarCandidate: second.candidate }), /fresh live face verification/);
  assert.equal((await ImageAdmission.findById(first.admission._id))?.status, "ACTIVE");
  assert.equal((await ImageAdmission.findById(second.admission._id))?.status, "ACTIVE");
});

test("rejects candidate identity mismatches, wrong versions, incomplete evidence, and expired authority", async () => {
  const { user, profile } = await rejectedProfile();
  const admitted = await activeAdmission(user._id);
  const invalid = async (input: Parameters<typeof completedSession>[0], candidate = admitted.candidate) => {
    await completedSession(input);
    await assert.rejects(() => requireCompletedFaceSessionForRejectedResubmission({ userId: String(user._id), avatar: admitted.candidate.trustedMediaReference, avatarCandidate: candidate }), /fresh live face verification/);
    await FaceVerificationSession.deleteMany({ profileId: profile._id }); await FaceVerificationEvidence.deleteMany({ profileId: profile._id });
  };
  await invalid({ userId: user._id, profileId: profile._id, avatar: admitted.candidate.trustedMediaReference, candidate: admitted.candidate, version: 2 });
  await invalid({ userId: user._id, profileId: profile._id, avatar: admitted.candidate.trustedMediaReference, candidate: admitted.candidate, captures: 4, evidence: 4 });
  await invalid({ userId: user._id, profileId: profile._id, avatar: admitted.candidate.trustedMediaReference, candidate: admitted.candidate, evidence: 4 });
  await invalid({ userId: user._id, profileId: profile._id, avatar: admitted.candidate.trustedMediaReference, candidate: admitted.candidate, expiresAt: new Date(Date.now() - 1) });
  const expired = { ...admitted.candidate, expiresAt: new Date(Date.now() - 1) };
  await assert.rejects(() => requireCompletedFaceSessionForRejectedResubmission({ userId: String(user._id), avatar: admitted.candidate.trustedMediaReference, avatarCandidate: expired }), /fresh live face verification/);
  const profileCandidate: FaceVerificationAvatarCandidate = { kind: "PROFILE_REFERENCE", trustedMediaReference: profile.avatar, fingerprint: fingerprintAvatarReference(profile.avatar) };
  await assert.rejects(() => requireCompletedFaceSessionForRejectedResubmission({ userId: String(user._id), avatar: admitted.candidate.trustedMediaReference, avatarCandidate: profileCandidate }), /fresh live face verification/);
});
