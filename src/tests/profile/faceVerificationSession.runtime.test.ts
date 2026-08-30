import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { ProfileVerificationJob } from "../../models/profileVerificationJob.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { UserProfile } from "../../models/userProfile.model";
import User from "../../models/User";
import { acceptFaceVerificationCapture, fingerprintAvatarReference, startFaceVerificationSession } from "../../services/profile/faceVerificationSession.service";
import { bindCompletedFaceSessionToVerificationRequest, cancelFaceVerificationSession, expireFaceVerificationSessions, getOwnedFaceVerificationSession, invalidateFaceSessionsForAvatar } from "../../services/profile/faceVerificationSession.service";
import { reconcileFaceVerificationEvidenceRetention, scheduleFaceEvidenceRetentionForDecision } from "../../services/profile/faceVerificationEvidenceCleanup.service";
import { faceVerificationEvidenceRepository } from "../../repositories/faceVerificationEvidence.repository";
import { faceVerificationSessionRepository } from "../../repositories/faceVerificationSession.repository";
import { FACE_VERIFICATION_APPROVED_RETENTION_MS, FACE_VERIFICATION_REJECTED_RETENTION_MS, FACE_VERIFICATION_SESSION_TTL_MS, FACE_VERIFICATION_SHORT_CLEANUP_MS } from "../../services/profile/faceVerification.constants";
import { upsertProfile } from "../../controllers/profile.controller";
import { assertFaceVerificationImageBytes } from "../../middlewares/upload.middleware";
import { setBiometricReferenceAvatarValidationDependenciesForTests } from "../../services/profile/profileVerificationReferenceAvatarValidation.service";
import type { NextFunction, Request, Response } from "express";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

const storage = require("../../services/profile/faceVerificationEvidenceStorage.service") as { storeFaceVerificationEvidence: (input: { buffer: Buffer; publicId: string }) => Promise<unknown> };
const deletionStorage = require("../../services/profile/faceVerificationEvidenceStorage.service") as { deleteFaceVerificationEvidence: (publicId: string) => Promise<"DELETED" | "ALREADY_MISSING" | "RETRYABLE_FAILURE" | "PROVIDER_FAILURE"> };
const originalStore = storage.storeFaceVerificationEvidence;
const originalDelete = deletionStorage.deleteFaceVerificationEvidence;
let uploadCalls = 0;
storage.storeFaceVerificationEvidence = async (input) => { uploadCalls += 1; return { publicId: input.publicId, bytes: input.buffer.length, format: "jpeg", mimeType: "image/jpeg" }; };
const file = (index: number) => ({ buffer: Buffer.from([0xff, 0xd8, 0xff, index]), mimetype: "image/jpeg", size: 4, originalname: "capture.jpg" }) as Express.Multer.File;
const validReferenceDetection = { width: 100, height: 100, decodedBytes: 30000, faces: [{ x: 30, y: 30, width: 40, height: 40, confidence: 0.9, landmarks: { rightEye: { x: 40, y: 42 }, leftEye: { x: 55, y: 42 }, noseTip: { x: 48, y: 50 }, rightMouthCorner: { x: 42, y: 60 }, leftMouthCorner: { x: 54, y: 60 } } }] } as const;
const invoke = (controller: (req: Request, res: Response, next: NextFunction) => unknown, request: Record<string, unknown>) => new Promise<unknown>((resolve, reject) => {
  const response = { status: () => response, json: (body: unknown) => { resolve(body); return response; } } as unknown as Response;
  controller(request as unknown as Request, response, reject);
});
const submission = (username: string, avatar: string) => ({ username, realName: "Face Test User", dateOfBirth: "1990-01-01", mobileCountryCode: "+91", mobileNumber: "9876543210", country: "India", city: "Mumbai", languages: ["English"], interests: [], bio: "Face verification test profile.", avatar, cover: "https://example.test/cover.jpg", profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"] });

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => { await clearPhase7HDatabase(); uploadCalls = 0; setBiometricReferenceAvatarValidationDependenciesForTests({ reader: async () => Buffer.from("test-avatar"), detector: async () => validReferenceDetection }); storage.storeFaceVerificationEvidence = async (input) => { uploadCalls += 1; return { publicId: input.publicId, bytes: input.buffer.length, format: "jpeg", mimeType: "image/jpeg" }; }; });
after(async () => { setBiometricReferenceAvatarValidationDependenciesForTests(); storage.storeFaceVerificationEvidence = originalStore; deletionStorage.deleteFaceVerificationEvidence = originalDelete; await disconnectPhase7HDatabase(); }, { timeout: 30_000 });

test("face session provisions only a draft and never creates a submitted verification authority", async () => {
  const user = await User.create({ email: "face-draft@test.local", password: "test-password", status: "pending_profile", governanceState: "ACTIVE" });
  const session = await startFaceVerificationSession({ userId: String(user._id), avatar: "https://example.test/avatar-a.jpg" });
  const profile = await UserProfile.findById(session.profileId);
  assert.equal(profile?.profileStatus, "incomplete");
  assert.equal(await ProfileVerificationRequest.countDocuments({ profileId: session.profileId }), 0);
  assert.equal(await ProfileVerificationJob.countDocuments({ profileId: session.profileId }), 0);
  assert.equal((await User.findById(user._id))?.status, "pending_profile");
  assert.equal(session.challenges.length, 5);
  assert.equal(new Set(session.challenges).size, 5);
});

test("five distinct server-owned capture slots complete a session once and replay does not duplicate", async () => {
  const user = await User.create({ email: "face-captures@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const session = await startFaceVerificationSession({ userId: String(user._id), avatar: "https://example.test/avatar-b.jpg" });
  for (let index = 0; index < 5; index += 1) await acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: String(index), file: file(index) });
  const complete = await FaceVerificationSession.findById(session._id);
  assert.equal(complete?.status, "CAPTURE_COMPLETE");
  assert.equal(complete?.acceptedCaptureCount, 5);
  assert.equal(await FaceVerificationEvidence.countDocuments({ sessionId: session._id, status: "STORED" }), 5);
  const replay = await acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: "0", file: file(0) });
  assert.equal(replay.replayed, true);
  assert.equal(await FaceVerificationEvidence.countDocuments({ sessionId: session._id }), 5);
});

test("session TTL is fifteen minutes and cross-user reads, cancellation, and capture are BOLA-safe", async () => {
  const [owner, other] = await Promise.all([
    User.create({ email: "face-owner@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" }),
    User.create({ email: "face-other@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" }),
  ]);
  const session = await startFaceVerificationSession({ userId: String(owner._id), avatar: "https://example.test/avatar-owner.jpg" });
  assert.equal(session.expiresAt.getTime() - session.startedAt.getTime(), FACE_VERIFICATION_SESSION_TTL_MS);
  await assert.rejects(getOwnedFaceVerificationSession({ userId: String(other._id), sessionReference: session.sessionReference }), /not found/);
  await assert.rejects(cancelFaceVerificationSession({ userId: String(other._id), sessionReference: session.sessionReference }), /not found/);
  await assert.rejects(acceptFaceVerificationCapture({ userId: String(other._id), sessionReference: session.sessionReference, challengeIndex: "0", file: file(0) }), /not found/);
  assert.equal(await FaceVerificationEvidence.countDocuments({ sessionId: session._id }), 0);
  assert.equal(uploadCalls, 0);
});

test("current-session, challenge, index, replay, sixth-capture, and terminal-mutation invariants hold", async () => {
  const user = await User.create({ email: "face-invariants@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const session = await startFaceVerificationSession({ userId: String(user._id), avatar: "https://example.test/avatar-invariants.jpg" });
  const replayStart = await startFaceVerificationSession({ userId: String(user._id), avatar: "https://example.test/avatar-invariants.jpg" });
  assert.equal(String(replayStart._id), String(session._id));
  assert.equal(await FaceVerificationSession.countDocuments({ profileId: session.profileId, isCurrent: true }), 1);
  assert.equal(session.challenges.length, 5); assert.equal(new Set(session.challenges).size, 5);
  for (const invalid of ["-1", "5", "bad"]) await assert.rejects(acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: invalid, file: file(0) }), /Invalid/);
  const accepted = await acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: "0", file: file(0) });
  assert.equal(accepted.evidence.status, "STORED");
  assert.equal((await FaceVerificationEvidence.findOne({ sessionId: session._id, challengeIndex: 0 }))?.status, "STORED");
  const replay = await acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: "0", file: file(9) });
  assert.equal(replay.replayed, true); assert.equal(await FaceVerificationEvidence.countDocuments({ sessionId: session._id }), 1);
  for (let index = 1; index < 5; index += 1) await acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: String(index), file: file(index) });
  const completed = await FaceVerificationSession.findById(session._id); assert.equal(completed?.status, "CAPTURE_COMPLETE"); assert.equal(completed?.acceptedCaptureCount, 5);
  await assert.rejects(acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: "5", file: file(5) }), /Invalid/);
  assert.equal((await FaceVerificationSession.findById(session._id))?.acceptedCaptureCount, 5);
});

test("cancelled and expired partial sessions become cleanup eligible and cannot accept captures", async () => {
  const user = await User.create({ email: "face-terminal@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const cancelled = await startFaceVerificationSession({ userId: String(user._id), avatar: "https://example.test/avatar-cancel.jpg" });
  await acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: cancelled.sessionReference, challengeIndex: "0", file: file(0) });
  await cancelFaceVerificationSession({ userId: String(user._id), sessionReference: cancelled.sessionReference });
  await assert.rejects(acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: cancelled.sessionReference, challengeIndex: "1", file: file(1) }), /not accepting/);
  const cancelledEvidence = await FaceVerificationEvidence.findOne({ sessionId: cancelled._id }); assert.ok(cancelledEvidence?.cleanupAfter);
  const expired = await startFaceVerificationSession({ userId: String(user._id), avatar: "https://example.test/avatar-expired.jpg" });
  await acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: expired.sessionReference, challengeIndex: "0", file: file(0) });
  await FaceVerificationSession.updateOne({ _id: expired._id }, { $set: { expiresAt: new Date(Date.now() - 1) } });
  await expireFaceVerificationSessions(new Date());
  await assert.rejects(acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: expired.sessionReference, challengeIndex: "1", file: file(1) }), /not accepting/);
  assert.equal((await FaceVerificationSession.findById(expired._id))?.status, "EXPIRED");
  assert.ok((await FaceVerificationEvidence.findOne({ sessionId: expired._id }))?.cleanupAfter);
});

test("avatar invalidates complete evidence while non-avatar profile data does not", async () => {
  const user = await User.create({ email: "face-avatar@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const session = await startFaceVerificationSession({ userId: String(user._id), avatar: "https://example.test/avatar-a.jpg" });
  for (let index = 0; index < 5; index += 1) await acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: String(index), file: file(index) });
  const profile = await UserProfile.findById(session.profileId); assert.ok(profile);
  profile.bio = "Changed bio only"; await profile.save(); await invalidateFaceSessionsForAvatar(profile);
  assert.equal((await FaceVerificationSession.findById(session._id))?.status, "CAPTURE_COMPLETE");
  profile.avatar = "https://example.test/avatar-b.jpg"; await profile.save(); await invalidateFaceSessionsForAvatar(profile);
  assert.equal((await FaceVerificationSession.findById(session._id))?.status, "INVALIDATED");
  await assert.rejects(acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: "0", file: file(0) }), /not accepting/);
});

test("storage failure and finalization failure never falsely accept evidence and leave recoverable cleanup state", async () => {
  const user = await User.create({ email: "face-failure@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const failedUpload = await startFaceVerificationSession({ userId: String(user._id), avatar: "https://example.test/avatar-failure.jpg" });
  storage.storeFaceVerificationEvidence = async () => { throw new Error("controlled upload failure"); };
  await assert.rejects(acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: failedUpload.sessionReference, challengeIndex: "0", file: file(0) }), /controlled upload failure/);
  assert.equal((await FaceVerificationSession.findById(failedUpload._id))?.acceptedCaptureCount, 0);
  assert.equal((await FaceVerificationEvidence.findOne({ sessionId: failedUpload._id }))?.status, "UPLOADING");
  const originalFinalize = faceVerificationEvidenceRepository.finalizeStored.bind(faceVerificationEvidenceRepository);
  faceVerificationEvidenceRepository.finalizeStored = async () => null;
  storage.storeFaceVerificationEvidence = async (input) => ({ publicId: input.publicId, bytes: 4, format: "jpeg", mimeType: "image/jpeg" });
  const secondUser = await User.create({ email: "face-finalization@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  try {
    const finalizationFailed = await startFaceVerificationSession({ userId: String(secondUser._id), avatar: "https://example.test/avatar-finalize.jpg" });
    await assert.rejects(acceptFaceVerificationCapture({ userId: String(secondUser._id), sessionReference: finalizationFailed.sessionReference, challengeIndex: "0", file: file(0) }), /could not be finalized/);
    const orphan = await FaceVerificationEvidence.findOne({ sessionId: finalizationFailed._id }); assert.equal(orphan?.status, "UPLOADING"); assert.ok(orphan?.cleanupAfter);
  } finally { faceVerificationEvidenceRepository.finalizeStored = originalFinalize; }
});

test("retention defaults start at terminal decision, not capture completion", async () => {
  const user = await User.create({ email: "face-retention@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const session = await startFaceVerificationSession({ userId: String(user._id), avatar: "https://example.test/avatar-retention.jpg" });
  await acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: "0", file: file(0) });
  const evidence = await FaceVerificationEvidence.findOne({ sessionId: session._id }); assert.equal(evidence?.cleanupAfter, undefined);
  const requestId = new (require("mongoose").Types.ObjectId)();
  const approvedAt = new Date();
  await ProfileVerificationRequest.create({ _id: requestId, verificationReference: `PROFILE_VERIFICATION_RETENTION_${Date.now()}`, profileId: session.profileId, userId: user._id, attemptNumber: 1, profileSubmissionVersion: 1, submittedAt: approvedAt });
  await FaceVerificationEvidence.updateOne({ _id: evidence?._id }, { $set: { verificationRequestId: requestId } });
  await scheduleFaceEvidenceRetentionForDecision(requestId, "APPROVE", approvedAt);
  assert.equal((await FaceVerificationEvidence.findById(evidence?._id))?.cleanupAfter?.getTime(), approvedAt.getTime() + FACE_VERIFICATION_APPROVED_RETENTION_MS);
  await FaceVerificationEvidence.updateOne({ _id: evidence?._id }, { $set: { status: "STORED" } });
  await scheduleFaceEvidenceRetentionForDecision(requestId, "REJECT", approvedAt);
  assert.equal((await FaceVerificationEvidence.findById(evidence?._id))?.cleanupAfter?.getTime(), approvedAt.getTime() + FACE_VERIFICATION_REJECTED_RETENTION_MS);
  assert.equal(FACE_VERIFICATION_SHORT_CLEANUP_MS, 24 * 60 * 60 * 1000);
});

test("matching completed pre-submit capture binds once to the first real verification request, while mismatches do not bind", async () => {
  const user = await User.create({ email: "face-binding@test.local", password: "test-password", status: "pending_profile", governanceState: "ACTIVE" });
  const avatarA = "https://example.test/avatar-binding-a.jpg";
  const session = await startFaceVerificationSession({ userId: String(user._id), avatar: avatarA });
  for (let index = 0; index < 5; index += 1) await acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: String(index), file: file(index) });
  await invoke(upsertProfile, { user: { id: String(user._id), role: "user", status: "pending_profile" }, body: submission("face-binding", avatarA) });
  const [profile, request, bound] = await Promise.all([
    UserProfile.findById(session.profileId), ProfileVerificationRequest.findOne({ profileId: session.profileId }), FaceVerificationSession.findById(session._id),
  ]);
  assert.equal(profile?.profileStatus, "pending_verification"); assert.ok(request); assert.equal(String(bound?.verificationRequestId), String(request?._id));
  assert.equal(await ProfileVerificationJob.countDocuments({ verificationRequestId: request?._id }), 1);

  const mismatchUser = await User.create({ email: "face-binding-mismatch@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const mismatch = await startFaceVerificationSession({ userId: String(mismatchUser._id), avatar: "https://example.test/avatar-old.jpg" });
  for (let index = 0; index < 5; index += 1) await acceptFaceVerificationCapture({ userId: String(mismatchUser._id), sessionReference: mismatch.sessionReference, challengeIndex: String(index), file: file(index) });
  const mismatchProfile = await UserProfile.findById(mismatch.profileId); assert.ok(mismatchProfile);
  mismatchProfile.avatar = "https://example.test/avatar-new.jpg"; mismatchProfile.verificationSubmissionVersion = 1; await mismatchProfile.save();
  const unbound = await bindCompletedFaceSessionToVerificationRequest({ profile: mismatchProfile, requestId: new (require("mongoose").Types.ObjectId)() });
  assert.equal(unbound, null);
});

test("face evidence magic-byte validation rejects non-image, SVG, GIF, and malformed payloads", () => {
  assert.doesNotThrow(() => assertFaceVerificationImageBytes(file(0)));
  for (const buffer of [Buffer.from("<svg></svg>"), Buffer.from("GIF89a"), Buffer.from("%PDF-1.7"), Buffer.from([0x00, 0x01, 0x02])]) {
    assert.throws(() => assertFaceVerificationImageBytes({ ...file(0), buffer }));
  }
});

test("cleanup is idempotent and only deletes evidence that is due", async () => {
  const user = await User.create({ email: "face-cleanup@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const session = await startFaceVerificationSession({ userId: String(user._id), avatar: "https://example.test/avatar-cleanup.jpg" });
  await acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: "0", file: file(0) });
  const evidence = await FaceVerificationEvidence.findOne({ sessionId: session._id }); assert.ok(evidence);
  await FaceVerificationEvidence.updateOne({ _id: evidence._id }, { $set: { status: "DELETE_PENDING", cleanupAfter: new Date(Date.now() - 1) } });
  let deletes = 0; deletionStorage.deleteFaceVerificationEvidence = async () => { deletes += 1; return "DELETED"; };
  await reconcileFaceVerificationEvidenceRetention(new Date());
  await reconcileFaceVerificationEvidenceRetention(new Date());
  assert.equal(deletes, 1); assert.equal((await FaceVerificationEvidence.findById(evidence._id))?.status, "DELETED");
  deletionStorage.deleteFaceVerificationEvidence = originalDelete;
});

test("an abandoned partial session is retired and a same-avatar restart begins at challenge index zero", async () => {
  const user = await User.create({ email: "face-restart-partial@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const previous = await startFaceVerificationSession({ userId: String(user._id), avatar: "https://example.test/avatar-restart.jpg" });
  await acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: previous.sessionReference, challengeIndex: "0", file: file(0) });
  const replacement = await startFaceVerificationSession({ userId: String(user._id), avatar: "https://example.test/avatar-restart.jpg" });
  const retired = await FaceVerificationSession.findById(previous._id);
  assert.notEqual(String(replacement._id), String(previous._id)); assert.equal(replacement.status, "CREATED"); assert.equal(replacement.acceptedCaptureCount, 0);
  assert.equal(retired?.status, "CANCELLED"); assert.equal(retired?.isCurrent, false); assert.ok(retired?.cleanupAfter);
  assert.equal(await FaceVerificationSession.countDocuments({ profileId: previous.profileId, isCurrent: true }), 1);
});

test("avatar mismatch replaces created, partial, and completed sessions without preserving current authority", async () => {
  const createdUser = await User.create({ email: "face-avatar-created@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const created = await startFaceVerificationSession({ userId: String(createdUser._id), avatar: "https://example.test/avatar-created-a.jpg" });
  const createdReplacement = await startFaceVerificationSession({ userId: String(createdUser._id), avatar: "https://example.test/avatar-created-b.jpg" });
  assert.equal((await FaceVerificationSession.findById(created._id))?.status, "INVALIDATED"); assert.equal(createdReplacement.acceptedCaptureCount, 0);

  const partialUser = await User.create({ email: "face-avatar-partial@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const partial = await startFaceVerificationSession({ userId: String(partialUser._id), avatar: "https://example.test/avatar-partial-a.jpg" });
  await acceptFaceVerificationCapture({ userId: String(partialUser._id), sessionReference: partial.sessionReference, challengeIndex: "0", file: file(0) });
  await startFaceVerificationSession({ userId: String(partialUser._id), avatar: "https://example.test/avatar-partial-b.jpg" });
  const invalidatedPartial = await FaceVerificationSession.findById(partial._id); assert.equal(invalidatedPartial?.status, "INVALIDATED"); assert.equal(invalidatedPartial?.isCurrent, false); assert.ok(invalidatedPartial?.cleanupAfter);

  const completeUser = await User.create({ email: "face-avatar-complete@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const complete = await startFaceVerificationSession({ userId: String(completeUser._id), avatar: "https://example.test/avatar-complete-a.jpg" });
  for (let index = 0; index < 5; index += 1) await acceptFaceVerificationCapture({ userId: String(completeUser._id), sessionReference: complete.sessionReference, challengeIndex: String(index), file: file(index) });
  const completeReplacement = await startFaceVerificationSession({ userId: String(completeUser._id), avatar: "https://example.test/avatar-complete-b.jpg" });
  const invalidatedComplete = await FaceVerificationSession.findById(complete._id); assert.equal(invalidatedComplete?.status, "INVALIDATED"); assert.equal(invalidatedComplete?.isCurrent, false); assert.ok(invalidatedComplete?.cleanupAfter);
  assert.equal(await FaceVerificationEvidence.countDocuments({ sessionId: complete._id, status: "STORED" }), 5); assert.equal(completeReplacement.acceptedCaptureCount, 0);
});

test("matching completed sessions replay while expired, terminal, and version-mismatched sessions are replaced", async () => {
  const user = await User.create({ email: "face-replay-terminal@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const avatar = "https://example.test/avatar-replay.jpg"; const complete = await startFaceVerificationSession({ userId: String(user._id), avatar });
  for (let index = 0; index < 5; index += 1) await acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: complete.sessionReference, challengeIndex: String(index), file: file(index) });
  const replay = await startFaceVerificationSession({ userId: String(user._id), avatar });
  assert.equal(String(replay._id), String(complete._id)); assert.equal(await FaceVerificationEvidence.countDocuments({ sessionId: complete._id, status: "STORED" }), 5);

  const expiredUser = await User.create({ email: "face-immediate-expiry@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const expired = await startFaceVerificationSession({ userId: String(expiredUser._id), avatar: "https://example.test/avatar-expired-now.jpg" });
  await FaceVerificationSession.updateOne({ _id: expired._id }, { $set: { expiresAt: new Date(Date.now() - 1) } });
  const afterExpiry = await startFaceVerificationSession({ userId: String(expiredUser._id), avatar: "https://example.test/avatar-expired-now.jpg" });
  assert.notEqual(String(afterExpiry._id), String(expired._id)); assert.equal((await FaceVerificationSession.findById(expired._id))?.status, "EXPIRED");

  const versionUser = await User.create({ email: "face-version-mismatch@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const versioned = await startFaceVerificationSession({ userId: String(versionUser._id), avatar: "https://example.test/avatar-version.jpg" });
  await UserProfile.updateOne({ _id: versioned.profileId }, { $set: { verificationSubmissionVersion: 1 } });
  const versionReplacement = await startFaceVerificationSession({ userId: String(versionUser._id), avatar: "https://example.test/avatar-version.jpg" });
  assert.equal((await FaceVerificationSession.findById(versioned._id))?.status, "INVALIDATED"); assert.equal(versionReplacement.profileSubmissionVersion, 2);

  const cancelledUser = await User.create({ email: "face-cancelled-restart@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const cancelled = await startFaceVerificationSession({ userId: String(cancelledUser._id), avatar: "https://example.test/avatar-cancelled.jpg" });
  await cancelFaceVerificationSession({ userId: String(cancelledUser._id), sessionReference: cancelled.sessionReference });
  const afterCancel = await startFaceVerificationSession({ userId: String(cancelledUser._id), avatar: "https://example.test/avatar-cancelled.jpg" });
  assert.notEqual(String(afterCancel._id), String(cancelled._id));
});

test("concurrent starts converge on one compatible current session", async () => {
  const user = await User.create({ email: "face-concurrent-start@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const avatar = "https://example.test/avatar-concurrent.jpg";
  const prior = await startFaceVerificationSession({ userId: String(user._id), avatar });
  await cancelFaceVerificationSession({ userId: String(user._id), sessionReference: prior.sessionReference });
  const [first, second] = await Promise.all([startFaceVerificationSession({ userId: String(user._id), avatar }), startFaceVerificationSession({ userId: String(user._id), avatar })]);
  assert.equal(String(first._id), String(second._id)); assert.equal(first.avatarFingerprint, second.avatarFingerprint); assert.equal(first.profileSubmissionVersion, second.profileSubmissionVersion);
  assert.equal(await FaceVerificationSession.countDocuments({ profileId: first.profileId, isCurrent: true }), 1);
});

test("duplicate-key recovery retires an incompatible winner instead of returning incorrect authority", async () => {
  const user = await User.create({ email: "face-duplicate-recovery@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const avatar = "https://example.test/avatar-duplicate.jpg";
  const draft = await startFaceVerificationSession({ userId: String(user._id), avatar });
  await cancelFaceVerificationSession({ userId: String(user._id), sessionReference: draft.sessionReference });
  const originalCreate = faceVerificationSessionRepository.create.bind(faceVerificationSessionRepository); let injected = false;
  faceVerificationSessionRepository.create = async (input) => {
    if (!injected) {
      injected = true;
      await originalCreate({ ...input, avatarFingerprint: fingerprintAvatarReference("https://example.test/avatar-other.jpg") });
      const duplicate = Object.assign(new Error("controlled duplicate"), { code: 11000 }); throw duplicate;
    }
    return originalCreate(input);
  };
  try {
    const recovered = await startFaceVerificationSession({ userId: String(user._id), avatar });
    assert.equal(recovered.avatarFingerprint, fingerprintAvatarReference(avatar)); assert.equal(recovered.profileSubmissionVersion, 1);
    assert.equal(await FaceVerificationSession.countDocuments({ profileId: draft.profileId, isCurrent: true }), 1);
    assert.equal(await FaceVerificationSession.countDocuments({ profileId: draft.profileId, avatarFingerprint: fingerprintAvatarReference("https://example.test/avatar-other.jpg"), isCurrent: false, status: "INVALIDATED" }), 1);
  } finally {
    faceVerificationSessionRepository.create = originalCreate;
  }
});

test("invalid and technical reference validation never creates a session, request, job, or submission version", async () => {
  const user = await User.create({ email: "face-reference-negative@test.local", password: "test-password", status: "pending_profile", governanceState: "ACTIVE" });
  const avatar = "https://example.test/avatar-negative.jpg";
  for (const detector of [
    async () => ({ ...validReferenceDetection, faces: [] }),
    async () => ({ ...validReferenceDetection, faces: [validReferenceDetection.faces[0], validReferenceDetection.faces[0]] }),
  ]) {
    setBiometricReferenceAvatarValidationDependenciesForTests({ reader: async () => Buffer.from("test-avatar"), detector });
    await assert.rejects(startFaceVerificationSession({ userId: String(user._id), avatar }), /profile photo cannot be used/);
    assert.equal(await FaceVerificationSession.countDocuments({ userId: user._id }), 0);
    assert.equal(await ProfileVerificationRequest.countDocuments({ userId: user._id }), 0);
    assert.equal(await ProfileVerificationJob.countDocuments({ userId: user._id }), 0);
    assert.equal((await UserProfile.findOne({ userId: user._id }))?.verificationSubmissionVersion ?? 0, 0);
  }
  setBiometricReferenceAvatarValidationDependenciesForTests({ reader: async () => { throw new Error("reader unavailable"); } });
  await assert.rejects(startFaceVerificationSession({ userId: String(user._id), avatar }), /reader unavailable/);
  assert.equal(await FaceVerificationSession.countDocuments({ userId: user._id }), 0);
});
