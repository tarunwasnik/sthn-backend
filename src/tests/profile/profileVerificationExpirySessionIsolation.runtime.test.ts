import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { upsertProfile } from "../../controllers/profile.controller";
import { expireProfileVerificationRequests } from "../../services/profile/profileVerificationRequest.service";
import { acceptFaceVerificationCapture, fingerprintAvatarReference, startFaceVerificationSession } from "../../services/profile/faceVerificationSession.service";
import { faceVerificationSessionRepository } from "../../repositories/faceVerificationSession.repository";
import { FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS } from "../../services/profile/faceVerification.constants";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

const storage = require("../../services/profile/faceVerificationEvidenceStorage.service") as {
  storeFaceVerificationEvidence: (input: { buffer: Buffer; publicId: string }) => Promise<unknown>;
};
const originalStore = storage.storeFaceVerificationEvidence;
const avatar = "https://example.test/session-isolation-avatar.jpg";
const captureFile = (index: number) => ({
  buffer: Buffer.from([0xff, 0xd8, 0xff, index]),
  mimetype: "image/jpeg",
  size: 4,
  originalname: "capture.jpg",
}) as Express.Multer.File;
const submission = {
  username: "session-isolation-v2", realName: "Session Isolation", dateOfBirth: "1990-01-01",
  mobileCountryCode: "+91", mobileNumber: "9876543210", country: "India", city: "Mumbai",
  languages: ["English"], interests: [], bio: "Recovered verification submission.", avatar,
  cover: "https://example.test/cover.jpg", profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
};
const invokeSubmission = (user: Record<string, unknown>) => new Promise<void>((resolve, reject) => {
  const response = { status: () => response, json: () => { resolve(); return response; } } as unknown as Response;
  upsertProfile({ user, body: submission } as unknown as Request, response, reject as NextFunction);
});
const completeSession = async (userId: string, sessionReference: string) => {
  for (let index = 0; index < 5; index += 1) {
    await acceptFaceVerificationCapture({ userId, sessionReference, challengeIndex: String(index), file: captureFile(index) });
  }
};

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => {
  await clearPhase7HDatabase();
  storage.storeFaceVerificationEvidence = async (input) => ({ publicId: input.publicId, bytes: input.buffer.length, format: "jpeg", mimeType: "image/jpeg" });
});
after(async () => {
  storage.storeFaceVerificationEvidence = originalStore;
  await disconnectPhase7HDatabase();
}, { timeout: 30_000 });

test("expired V1 session never reappears after fresh V2 capture and real recovery submission", async () => {
  const user = await User.create({ email: "session-isolation@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const submittedAt = new Date();
  const profile = await UserProfile.create({
    userId: user._id, username: "legacy-session-isolation", dateOfBirth: new Date("1990-01-01"), interests: [],
    bio: "V1 profile", avatar, cover: "https://example.test/cover.jpg",
    profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
    profileStatus: "pending_verification", verificationSubmittedAt: submittedAt, verificationSubmissionVersion: 1,
  });
  const v1 = await ProfileVerificationRequest.create({
    verificationReference: "PV_S1", profileId: profile._id, userId: user._id, attemptNumber: 1,
    profileSubmissionVersion: 1, submittedAt,
  });
  const s1 = await FaceVerificationSession.create({
    sessionReference: "S1", userId: user._id, profileId: profile._id, verificationRequestId: v1._id,
    profileSubmissionVersion: 1, avatarFingerprint: fingerprintAvatarReference(avatar), status: "CAPTURE_COMPLETE", isCurrent: true,
    challenges: ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"], requiredCaptureCount: 5, acceptedCaptureCount: 5,
    startedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), captureCompletedAt: new Date(),
  });

  await expireProfileVerificationRequests(new Date(submittedAt.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS));
  const [expiredV1, recoveredProfile, invalidatedS1] = await Promise.all([
    ProfileVerificationRequest.findById(v1._id), UserProfile.findById(profile._id), FaceVerificationSession.findById(s1._id),
  ]);
  assert.equal(expiredV1?.status, "EXPIRED");
  assert.equal(expiredV1?.isActive, false);
  assert.equal(recoveredProfile?.profileStatus, "incomplete");
  assert.equal(recoveredProfile?.verificationSubmissionVersion, 1);
  assert.equal(invalidatedS1?.isCurrent, false);
  assert.equal(invalidatedS1?.invalidationCode, "REQUEST_RETENTION_EXPIRED");

  const s2 = await startFaceVerificationSession({ userId: String(user._id), avatar });
  assert.notEqual(String(s2._id), String(s1._id));
  assert.notEqual(s2.sessionReference, s1.sessionReference);
  assert.equal(s2.profileSubmissionVersion, 2);
  assert.equal(s2.isCurrent, true);
  assert.equal((await FaceVerificationSession.findById(s1._id))?.isCurrent, false);

  await completeSession(String(user._id), s2.sessionReference);
  const completedS2 = await FaceVerificationSession.findById(s2._id);
  assert.equal(completedS2?.status, "CAPTURE_COMPLETE");
  assert.equal(completedS2?.acceptedCaptureCount, 5);
  const replay = await startFaceVerificationSession({ userId: String(user._id), avatar });
  assert.equal(String(replay._id), String(s2._id));
  assert.notEqual(String(replay._id), String(s1._id));

  await invokeSubmission({ id: String(user._id), role: "user", status: "active" });
  const submittedV2Profile = await UserProfile.findById(profile._id);
  const v2 = await ProfileVerificationRequest.findOne({ profileId: profile._id, isActive: true });
  assert.equal(submittedV2Profile?.verificationSubmissionVersion, 2);
  assert.equal(v2?.profileSubmissionVersion, 2);
  assert.equal(v2?.isActive, true);
  assert.equal((await ProfileVerificationRequest.findById(v1._id))?.status, "EXPIRED");

  const current = await faceVerificationSessionRepository.findCurrent(profile._id);
  assert.equal(String(current?._id), String(s2._id));
  assert.notEqual(String(current?._id), String(s1._id));
  await assert.rejects(acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: s1.sessionReference, challengeIndex: "0", file: captureFile(0) }));
  assert.equal((await FaceVerificationSession.findById(s1._id))?.isCurrent, false);
  assert.equal((await FaceVerificationSession.findById(s2._id))?.isCurrent, true);
  assert.equal((await ProfileVerificationRequest.findById(v2?._id))?.isActive, true);
});
