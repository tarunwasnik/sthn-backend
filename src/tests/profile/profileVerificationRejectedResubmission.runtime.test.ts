import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { ProfileVerificationJob } from "../../models/profileVerificationJob.model";
import { startFaceVerificationSession } from "../../services/profile/faceVerificationSession.service";
import { upsertProfile, updateMyProfile } from "../../controllers/profile.controller";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

const avatar = "https://example.test/avatar-a.jpg";
const body = { username: "rejected-resubmit", realName: "Rejected User", dateOfBirth: "1990-01-01", mobileCountryCode: "+91", mobileNumber: "9876543210", country: "India", city: "Mumbai", languages: ["English"], interests: [], bio: "Corrected profile.", avatar, cover: "https://example.test/cover.jpg", profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"] };
const invoke = (controller: (req: Request, res: Response, next: NextFunction) => unknown, user: Record<string, unknown>, requestBody: Record<string, unknown>) => new Promise<void>((resolve, reject) => {
  const response = { status: () => response, json: () => { resolve(); return response; } } as unknown as Response;
  controller({ user, body: requestBody } as unknown as Request, response, reject);
});

const completeWithEvidence = async (sessionId: Types.ObjectId) => {
  const session = await FaceVerificationSession.findById(sessionId).orFail();
  await FaceVerificationEvidence.insertMany(session.challenges.map((challenge, challengeIndex) => ({
    evidenceReference: `REJECTED_RESUBMIT_${String(sessionId)}_${challengeIndex}`,
    sessionId: session._id, userId: session.userId, profileId: session.profileId,
    challengeIndex, challenge, cloudinaryPublicId: `opaque-${String(sessionId)}-${challengeIndex}`,
    cloudinaryResourceType: "image", status: "STORED", mimeType: "image/jpeg", bytes: 10, format: "jpg", captureReceivedAt: new Date(),
  })));
  await FaceVerificationSession.updateOne({ _id: session._id }, { $set: { status: "CAPTURE_COMPLETE", acceptedCaptureCount: 5, captureCompletedAt: new Date() } });
};

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

test("rejected resubmission cannot create a request or job without a fresh completed session", async () => {
  const user = await User.create({ email: "rejected-without-session@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const profile = await UserProfile.create({ ...body, userId: user._id, profileStatus: "rejected", rejectionReason: "Update your profile.", verificationSubmissionVersion: 1, verificationSubmittedAt: new Date() });
  await assert.rejects(invoke(updateMyProfile, { id: String(user._id), role: "user", status: "active" }, { bio: "Updated profile." }), /fresh live face verification/);
  const current = await UserProfile.findById(profile._id).orFail();
  assert.equal(current.profileStatus, "rejected"); assert.equal(current.verificationSubmissionVersion, 1);
  assert.equal(await ProfileVerificationRequest.countDocuments({ profileId: profile._id }), 0);
  assert.equal(await ProfileVerificationJob.countDocuments({ profileId: profile._id }), 0);
});

test("fresh next-version captures create exactly one isolated rejected resubmission attempt", async () => {
  const user = await User.create({ email: "rejected-with-session@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const profile = await UserProfile.create({ ...body, userId: user._id, profileStatus: "rejected", rejectionReason: "Update your profile.", verificationSubmissionVersion: 1, verificationSubmittedAt: new Date() });
  const session = await startFaceVerificationSession({ userId: String(user._id), avatar });
  assert.equal(session.profileSubmissionVersion, 2);
  await completeWithEvidence(session._id);
  await invoke(upsertProfile, { id: String(user._id), role: "user", status: "active" }, body);
  const current = await UserProfile.findById(profile._id).orFail();
  const request = await ProfileVerificationRequest.findOne({ profileId: profile._id, isActive: true }).orFail();
  const boundSession = await FaceVerificationSession.findById(session._id).orFail();
  assert.equal(current.profileStatus, "pending_verification"); assert.equal(current.verificationSubmissionVersion, 2);
  assert.equal(request.profileSubmissionVersion, 2); assert.equal(String(boundSession.verificationRequestId), String(request._id));
  assert.equal(await FaceVerificationEvidence.countDocuments({ sessionId: session._id, verificationRequestId: request._id, status: "STORED" }), 5);
  assert.equal(await ProfileVerificationJob.countDocuments({ verificationRequestId: request._id }), 1);
});

test("a session completed for avatar A cannot authorize rejected resubmission with avatar B", async () => {
  const user = await User.create({ email: "rejected-avatar-mismatch@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  const profile = await UserProfile.create({ ...body, userId: user._id, profileStatus: "rejected", rejectionReason: "Use the correct photo.", verificationSubmissionVersion: 1, verificationSubmittedAt: new Date() });
  const session = await startFaceVerificationSession({ userId: String(user._id), avatar });
  await completeWithEvidence(session._id);
  await assert.rejects(invoke(upsertProfile, { id: String(user._id), role: "user", status: "active" }, { ...body, avatar: "https://example.test/avatar-b.jpg" }), /fresh live face verification/);
  const current = await UserProfile.findById(profile._id).orFail();
  assert.equal(current.profileStatus, "rejected"); assert.equal(current.verificationSubmissionVersion, 1);
  assert.equal(await ProfileVerificationRequest.countDocuments({ profileId: profile._id }), 0);
});
