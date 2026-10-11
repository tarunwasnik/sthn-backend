import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";

import { FaceVerificationAvatarCandidate, FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { faceVerificationAvatarCandidateMatches, faceVerificationSessionRepository } from "../../repositories/faceVerificationSession.repository";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

const challenges = ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"] as const;
const fingerprint = "a".repeat(64);
type AdmissionCandidate = Extract<FaceVerificationAvatarCandidate, { kind: "ADMISSION" }>;
const profileCandidate = (): FaceVerificationAvatarCandidate => ({ kind: "PROFILE_REFERENCE", trustedMediaReference: "https://res.cloudinary.com/demo/image/upload/v1/sthn/avatar.jpg", fingerprint });
const admissionCandidate = (suffix = "a"): AdmissionCandidate => ({ kind: "ADMISSION", admissionId: new Types.ObjectId(), admissionReference: `imauth_${suffix}`, assetId: new Types.ObjectId(), trustedMediaReference: `https://res.cloudinary.com/demo/image/upload/v1/sthn/avatar-${suffix}.jpg`, contentSha256: suffix.repeat(64).slice(0, 64), fingerprint, expiresAt: new Date(Date.now() + 60_000) });
const base = (candidate?: FaceVerificationAvatarCandidate) => ({ sessionReference: `FACE_CANDIDATE_${new Types.ObjectId()}`, userId: new Types.ObjectId(), profileId: new Types.ObjectId(), profileSubmissionVersion: 1, avatarFingerprint: fingerprint, challenges: [...challenges], expiresAt: new Date(Date.now() + 60_000), ...(candidate ? { avatarCandidate: candidate } : {}) });

test.before(async () => { process.env.NODE_ENV = "test"; await connectPhase7HDatabase(); });
test.beforeEach(clearPhase7HDatabase);
test.after(disconnectPhase7HDatabase);

test("persists immutable profile-reference and admission candidate authority", async () => {
  const profile = await faceVerificationSessionRepository.create(base(profileCandidate()));
  const admission = await faceVerificationSessionRepository.create(base(admissionCandidate("b")));
  assert.equal(profile.avatarCandidate?.kind, "PROFILE_REFERENCE");
  assert.equal(admission.avatarCandidate?.kind, "ADMISSION");
  assert.equal(admission.avatarCandidate?.kind === "ADMISSION" && admission.avatarCandidate.admissionReference, "imauth_b");
  assert.equal(admission.requiredCaptureCount, 5);
  assert.deepEqual(admission.challenges, challenges);
});

test("candidate metadata validates kind-specific required fields and fingerprint consistency", async () => {
  const missingAdmission = new FaceVerificationSession({ ...base(), avatarCandidate: { kind: "ADMISSION", trustedMediaReference: "https://res.cloudinary.com/demo/image/upload/v1/x.jpg", fingerprint } });
  await assert.rejects(() => missingAdmission.validate());
  const inconsistentFingerprint = new FaceVerificationSession({ ...base(), avatarCandidate: { ...profileCandidate(), fingerprint: "b".repeat(64) } });
  await assert.rejects(() => inconsistentFingerprint.validate());
  const profileWithAdmissionFields = new FaceVerificationSession({ ...base(), avatarCandidate: { ...profileCandidate(), admissionReference: "imauth_unexpected" } });
  await assert.rejects(() => profileWithAdmissionFields.validate());
});

test("candidate identity cannot be changed and admission identity is stricter than a fingerprint", async () => {
  const first = admissionCandidate("c");
  const second = admissionCandidate("d");
  assert.equal(faceVerificationAvatarCandidateMatches(first, second), false);
  assert.equal(faceVerificationAvatarCandidateMatches(first, { ...first }), true);
  const session = await faceVerificationSessionRepository.create(base(first));
  (session as unknown as { avatarCandidate: FaceVerificationAvatarCandidate }).avatarCandidate = second;
  await session.save();
  const stored = await FaceVerificationSession.findById(session._id);
  assert.equal(stored?.avatarCandidate?.kind, "ADMISSION");
  assert.equal(stored?.avatarCandidate?.kind === "ADMISSION" && stored.avatarCandidate.admissionReference, first.admissionReference);
});

test("candidate-aware repository queries do not match admission A with admission B and legacy sessions remain readable", async () => {
  const candidateA = admissionCandidate("e");
  const candidateB = admissionCandidate("f");
  const session = await FaceVerificationSession.create({ ...base(candidateA), status: "CAPTURE_COMPLETE", acceptedCaptureCount: 5, requiredCaptureCount: 5, startedAt: new Date(), captureCompletedAt: new Date() });
  const matching = await faceVerificationSessionRepository.findCurrentCompletedForCandidate({ profileId: session.profileId, userId: session.userId, version: 1, avatarFingerprint: fingerprint, avatarCandidate: candidateA });
  const mismatch = await faceVerificationSessionRepository.findCurrentCompletedForCandidate({ profileId: session.profileId, userId: session.userId, version: 1, avatarFingerprint: fingerprint, avatarCandidate: candidateB });
  assert.equal(String(matching?._id), String(session._id));
  assert.equal(mismatch, null);
  const legacy = await faceVerificationSessionRepository.create(base());
  assert.equal(legacy.avatarCandidate, undefined);
  assert.equal(legacy.isCurrent, true);
});
