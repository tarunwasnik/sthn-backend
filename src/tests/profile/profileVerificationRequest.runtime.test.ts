import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { NextFunction, Request, Response } from "express";

import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { ProfileVerificationJob } from "../../models/profileVerificationJob.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { upsertProfile, updateMyProfile } from "../../controllers/profile.controller";
import {
  decideProfileVerificationRequest,
  escalateProfileVerificationRequest,
  ensureActiveProfileVerificationRequest,
  ensureLegacyPendingProfileVerificationRequest,
  expireProfileVerificationRequests,
  listProfileVerificationQueue,
} from "../../services/profile/profileVerificationRequest.service";
import { FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS } from "../../services/profile/faceVerification.constants";
import { profileVerificationRequestRepository } from "../../repositories/profileVerificationRequest.repository";
import { startFaceVerificationSession } from "../../services/profile/faceVerificationSession.service";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

const invoke = (
  controller: (req: Request, res: Response, next: NextFunction) => unknown,
  request: Record<string, unknown>,
) => new Promise<unknown>((resolve, reject) => {
  const response = {
    status: () => response,
    json: (body: unknown) => {
      resolve(body);
      return response;
    },
  } as unknown as Response;
  controller(request as unknown as Request, response, reject);
});

const profileBody = (username: string) => ({
  username,
  realName: "Verification Test User",
  dateOfBirth: "1990-01-01",
  mobileCountryCode: "+91",
  mobileNumber: "9876543210",
  country: "India",
  city: "Mumbai",
  languages: ["English"],
  interests: ["Music"],
  bio: "Profile verification foundation test.",
  avatar: "https://example.test/avatar.jpg",
  cover: "https://example.test/cover.jpg",
  profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
});

const createUser = (email: string, status: "pending_profile" | "active" = "pending_profile") => User.create({
  email,
  password: "test-password",
  status,
  governanceState: "ACTIVE",
});

const submitProfile = async (email: string, username: string) => {
  const user = await createUser(email);
  const body = profileBody(username);
  const faceSession = await startFaceVerificationSession({ userId: String(user._id), avatar: body.avatar });
  await FaceVerificationSession.updateOne({ _id: faceSession._id }, { $set: { status: "CAPTURE_COMPLETE", acceptedCaptureCount: 5, captureCompletedAt: new Date() } });
  await invoke(upsertProfile, { user: { id: String(user._id), role: "user", status: "pending_profile" }, body });
  const profile = await UserProfile.findOne({ userId: user._id });
  assert.ok(profile);
  return { user, profile };
};

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

test("first submission creates exactly one active verification request and replays safely", async () => {
  const { profile } = await submitProfile("verification-first@test.local", "verification-first");
  assert.equal(profile.profileStatus, "pending_verification");
  assert.equal(profile.verificationSubmissionVersion, 1);
  assert.equal(await ProfileVerificationRequest.countDocuments({ profileId: profile._id, isActive: true }), 1);
  assert.equal(await ProfileVerificationJob.countDocuments({ verificationRequestId: (await ProfileVerificationRequest.findOne({ profileId: profile._id, isActive: true }))?._id }), 1);

  await Promise.all([
    ensureActiveProfileVerificationRequest(profile),
    ensureActiveProfileVerificationRequest(profile),
  ]);
  assert.equal(await ProfileVerificationRequest.countDocuments({ profileId: profile._id, isActive: true }), 1);
});

test("initial onboarding submission requires a current matching completed face session before promotion", async () => {
  const missing = await createUser("verification-face-guard-missing@test.local");
  await assert.rejects(invoke(upsertProfile, { user: { id: String(missing._id), role: "user", status: "pending_profile" }, body: profileBody("verification-face-guard-missing") }), /Complete live face verification/);
  assert.equal(await ProfileVerificationRequest.countDocuments({ userId: missing._id }), 0);

  const invalid = await createUser("verification-face-guard-invalid@test.local");
  const invalidBody = profileBody("verification-face-guard-invalid");
  const cancelled = await startFaceVerificationSession({ userId: String(invalid._id), avatar: invalidBody.avatar });
  await FaceVerificationSession.updateOne({ _id: cancelled._id }, { $set: { status: "CANCELLED", isCurrent: false } });
  await assert.rejects(invoke(upsertProfile, { user: { id: String(invalid._id), role: "user", status: "pending_profile" }, body: invalidBody }), /Complete live face verification/);
  assert.equal((await UserProfile.findById(cancelled.profileId))?.profileStatus, "incomplete");
});

test("pending profile mutation is rejected and leaves the submitted profile unchanged", async () => {
  const { user, profile } = await submitProfile("verification-lock@test.local", "verification-lock");
  await assert.rejects(invoke(updateMyProfile, {
    user: { id: String(user._id), role: "user", status: "active" },
    body: { bio: "An unauthorized pending mutation." },
  }));
  const reloaded = await UserProfile.findById(profile._id).lean();
  assert.equal(reloaded?.bio, "Profile verification foundation test.");
  assert.equal(await ProfileVerificationRequest.countDocuments({ profileId: profile._id, isActive: true }), 1);
});

test("new submissions appear only in the AI Verification Queue", async () => {
  const { profile } = await submitProfile("verification-ai-queue@test.local", "verification-ai-queue");
  const [aiQueue, adminReviewQueue] = await Promise.all([
    listProfileVerificationQueue("AI"),
    listProfileVerificationQueue("ADMIN_REVIEW"),
  ]);
  assert.equal(aiQueue.filter((entry) => entry._id === String(profile._id)).length, 1);
  assert.equal(aiQueue.find((entry) => entry._id === String(profile._id))?.verificationRequest.status, "PENDING");
  assert.equal(adminReviewQueue.some((entry) => entry._id === String(profile._id)), false);
});

test("escalation moves the same pending request into Admin Review without changing user-facing status", async () => {
  const { profile } = await submitProfile("verification-escalation@test.local", "verification-escalation");
  const before = await ProfileVerificationRequest.findOne({ profileId: profile._id, isActive: true });
  assert.ok(before);
  const escalated = await escalateProfileVerificationRequest({
    profileId: String(profile._id),
    reasonCode: "PROCESSING_TIMEOUT",
    reason: "Automated verification remained unresolved.",
  });
  assert.equal(escalated.replayed, false);
  assert.equal(String(escalated.request._id), String(before._id));
  assert.equal(escalated.request.isActive, true);
  assert.equal(escalated.request.status, "ADMIN_REVIEW_REQUIRED");
  assert.equal(escalated.request.adminReviewReasonCode, "PROCESSING_TIMEOUT");
  assert.ok(escalated.request.adminReviewRequiredAt);
  assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "pending_verification");

  const [aiQueue, adminReviewQueue] = await Promise.all([
    listProfileVerificationQueue("AI"),
    listProfileVerificationQueue("ADMIN_REVIEW"),
  ]);
  assert.equal(aiQueue.some((entry) => entry._id === String(profile._id)), false);
  assert.equal(adminReviewQueue.find((entry) => entry._id === String(profile._id))?.verificationRequest.adminReviewReason, "Automated verification remained unresolved.");
});

test("admin approval is terminal, replay-safe, and cannot be overwritten by future AI", async () => {
  const { profile } = await submitProfile("verification-approve@test.local", "verification-approve");
  const admin = await User.create({ email: "verification-admin@test.local", password: "test-password", role: "admin", status: "active", governanceState: "ACTIVE" });

  const approved = await decideProfileVerificationRequest({ profileId: String(profile._id), decision: "APPROVE", authority: "ADMIN", decidedBy: String(admin._id) });
  assert.equal(approved.replayed, false);
  assert.equal(approved.request.status, "APPROVED");
  assert.equal(approved.request.decisionAuthority, "ADMIN");
  assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "verified");

  const replay = await decideProfileVerificationRequest({ profileId: String(profile._id), decision: "APPROVE", authority: "ADMIN", decidedBy: String(admin._id) });
  assert.equal(replay.replayed, true);
  await assert.rejects(decideProfileVerificationRequest({ profileId: String(profile._id), decision: "REJECT", authority: "AI", reason: "stale result" }));
  assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "verified");
});

test("an AI terminal decision cannot be overwritten by a later admin decision", async () => {
  const { profile } = await submitProfile("verification-ai-first@test.local", "verification-ai-first");
  const admin = await User.create({ email: "verification-ai-first-admin@test.local", password: "test-password", role: "admin", status: "active", governanceState: "ACTIVE" });
  const approved = await decideProfileVerificationRequest({ profileId: String(profile._id), decision: "APPROVE", authority: "AI" });
  assert.equal(approved.request.decisionAuthority, "AI");
  await assert.rejects(decideProfileVerificationRequest({ profileId: String(profile._id), decision: "REJECT", authority: "ADMIN", decidedBy: String(admin._id), reason: "stale manual decision" }));
  assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "verified");
});

test("AI and Admin can decide an unresolved Admin Review request, and terminal requests leave both queues", async () => {
  const { profile } = await submitProfile("verification-review-ai@test.local", "verification-review-ai");
  await escalateProfileVerificationRequest({ profileId: String(profile._id), reasonCode: "MODEL_FAILURE" });
  const decided = await decideProfileVerificationRequest({ profileId: String(profile._id), decision: "REJECT", authority: "AI", reason: "Verification could not be completed." });
  assert.equal(decided.request.status, "REJECTED");
  assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "rejected");
  const [aiQueue, adminReviewQueue] = await Promise.all([
    listProfileVerificationQueue("AI"),
    listProfileVerificationQueue("ADMIN_REVIEW"),
  ]);
  assert.equal(aiQueue.some((entry) => entry._id === String(profile._id)), false);
  assert.equal(adminReviewQueue.some((entry) => entry._id === String(profile._id)), false);

  const { profile: adminProfile } = await submitProfile("verification-review-admin@test.local", "verification-review-admin");
  const admin = await User.create({ email: "verification-review-admin-user@test.local", password: "test-password", role: "admin", status: "active", governanceState: "ACTIVE" });
  await escalateProfileVerificationRequest({ profileId: String(adminProfile._id), reasonCode: "TEXT_MODERATION_UNCERTAIN" });
  const approved = await decideProfileVerificationRequest({ profileId: String(adminProfile._id), decision: "APPROVE", authority: "ADMIN", decidedBy: String(admin._id) });
  assert.equal(approved.request.status, "APPROVED");
  assert.equal((await UserProfile.findById(adminProfile._id))?.profileStatus, "verified");
});

test("first terminal decision still wins after escalation and same-decision replay remains safe", async () => {
  const { profile } = await submitProfile("verification-review-race@test.local", "verification-review-race");
  const admin = await User.create({ email: "verification-review-race-admin@test.local", password: "test-password", role: "admin", status: "active", governanceState: "ACTIVE" });
  await escalateProfileVerificationRequest({ profileId: String(profile._id), reasonCode: "LIVENESS_UNCERTAIN" });
  const adminApproval = await decideProfileVerificationRequest({ profileId: String(profile._id), decision: "APPROVE", authority: "ADMIN", decidedBy: String(admin._id) });
  assert.equal(adminApproval.replayed, false);
  const replay = await decideProfileVerificationRequest({ profileId: String(profile._id), decision: "APPROVE", authority: "ADMIN", decidedBy: String(admin._id) });
  assert.equal(replay.replayed, true);
  await assert.rejects(decideProfileVerificationRequest({ profileId: String(profile._id), decision: "REJECT", authority: "AI", reason: "stale AI result" }));

  const { profile: aiProfile } = await submitProfile("verification-review-ai-race@test.local", "verification-review-ai-race");
  await escalateProfileVerificationRequest({ profileId: String(aiProfile._id), reasonCode: "FACE_MATCH_UNCERTAIN" });
  await decideProfileVerificationRequest({ profileId: String(aiProfile._id), decision: "APPROVE", authority: "AI" });
  await assert.rejects(decideProfileVerificationRequest({ profileId: String(aiProfile._id), decision: "REJECT", authority: "ADMIN", decidedBy: String(admin._id), reason: "stale manual result" }));
  assert.equal((await UserProfile.findById(aiProfile._id))?.profileStatus, "verified");
});

test("admin rejection preserves reason and a rejected resubmission creates a new active attempt", async () => {
  const { user, profile } = await submitProfile("verification-reject@test.local", "verification-reject");
  const admin = await User.create({ email: "verification-reject-admin@test.local", password: "test-password", role: "admin", status: "active", governanceState: "ACTIVE" });
  const rejected = await decideProfileVerificationRequest({ profileId: String(profile._id), decision: "REJECT", authority: "ADMIN", decidedBy: String(admin._id), reason: "Please improve the profile information." });
  assert.equal(rejected.request.status, "REJECTED");
  assert.equal((await UserProfile.findById(profile._id))?.rejectionReason, "Please improve the profile information.");

  const resubmissionSession = await startFaceVerificationSession({ userId: String(user._id), avatar: profileBody("verification-reject").avatar });
  await FaceVerificationEvidence.insertMany(resubmissionSession.challenges.map((challenge, challengeIndex) => ({
    evidenceReference: `REQUEST_RESUBMIT_${String(resubmissionSession._id)}_${challengeIndex}`,
    sessionId: resubmissionSession._id, userId: user._id, profileId: profile._id,
    challengeIndex, challenge, cloudinaryPublicId: `opaque-${String(resubmissionSession._id)}-${challengeIndex}`,
    cloudinaryResourceType: "image", status: "STORED", mimeType: "image/jpeg", bytes: 10, format: "jpg", captureReceivedAt: new Date(),
  })));
  await FaceVerificationSession.updateOne({ _id: resubmissionSession._id }, { $set: { status: "CAPTURE_COMPLETE", acceptedCaptureCount: 5, captureCompletedAt: new Date() } });

  await invoke(updateMyProfile, {
    user: { id: String(user._id), role: "user", status: "active" },
    body: { ...profileBody("verification-reject"), bio: "Corrected profile information." },
  });
  const reloaded = await UserProfile.findById(profile._id);
  assert.equal(reloaded?.profileStatus, "pending_verification");
  assert.equal(reloaded?.verificationSubmissionVersion, 2);
  const requests = await ProfileVerificationRequest.find({ profileId: profile._id }).sort({ attemptNumber: 1 }).lean();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].status, "REJECTED");
  assert.equal(requests[1].status, "PENDING");
  assert.equal(requests[1].isActive, true);
  const [aiQueue, adminReviewQueue] = await Promise.all([
    listProfileVerificationQueue("AI"),
    listProfileVerificationQueue("ADMIN_REVIEW"),
  ]);
  assert.equal(aiQueue.some((entry) => entry._id === String(profile._id)), true);
  assert.equal(adminReviewQueue.some((entry) => entry._id === String(profile._id)), false);
});

test("legacy pending profiles receive one compatible active request without duplicate creation", async () => {
  const user = await createUser("verification-legacy@test.local", "active");
  const profile = await UserProfile.create({
    userId: user._id,
    username: "verification-legacy",
    dateOfBirth: new Date("1990-01-01"),
    interests: [],
    bio: "Legacy pending profile.",
    avatar: "https://example.test/avatar.jpg",
    cover: "https://example.test/cover.jpg",
    profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
    profileStatus: "pending_verification",
    verificationSubmittedAt: new Date(),
  });

  await ensureLegacyPendingProfileVerificationRequest(profile);
  await ensureLegacyPendingProfileVerificationRequest(profile);
  assert.equal(await ProfileVerificationRequest.countDocuments({ profileId: profile._id, isActive: true }), 1);
  assert.equal((await UserProfile.findById(profile._id))?.verificationSubmissionVersion, 1);
  const [aiQueue, adminReviewQueue] = await Promise.all([
    listProfileVerificationQueue("AI"),
    listProfileVerificationQueue("ADMIN_REVIEW"),
  ]);
  assert.equal(aiQueue.some((entry) => entry._id === String(profile._id)), true);
  assert.equal(adminReviewQueue.some((entry) => entry._id === String(profile._id)), false);
});

test("retention expiry is non-punitive, terminal, and releases a fresh submission version", async () => {
  const user = await createUser("verification-expired@test.local", "active");
  const submittedAt = new Date(Date.now() - FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS - 1);
  const profile = await UserProfile.create({
    userId: user._id, username: "verification-expired", dateOfBirth: new Date("1990-01-01"), interests: [], bio: "Expired verification.",
    avatar: "https://example.test/avatar.jpg", cover: "https://example.test/cover.jpg", profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
    profileStatus: "pending_verification", verificationSubmittedAt: submittedAt, verificationSubmissionVersion: 3,
  });
  const request = await ProfileVerificationRequest.create({ verificationReference: "PROFILE_VERIFICATION_EXPIRED_TEST", profileId: profile._id, userId: user._id, attemptNumber: 1, profileSubmissionVersion: 3, submittedAt });
  await expireProfileVerificationRequests(new Date());
  const [expired, recoveredProfile] = await Promise.all([ProfileVerificationRequest.findById(request._id), UserProfile.findById(profile._id)]);
  assert.equal(expired?.status, "EXPIRED"); assert.equal(expired?.isActive, false); assert.ok(expired?.expiredAt);
  assert.equal(expired?.decision, undefined); assert.equal(recoveredProfile?.profileStatus, "incomplete"); assert.equal(recoveredProfile?.rejectionReason, "");
});

test("conditional terminal and expiry transitions leave exactly one retention-valid terminal authority", async () => {
  const user = await createUser("verification-transition-race@test.local", "active");
  const profile = await UserProfile.create({ userId: user._id, username: "verification-transition-race", dateOfBirth: new Date("1990-01-01"), interests: [], bio: "Transition race.", avatar: "https://example.test/avatar.jpg", cover: "https://example.test/cover.jpg", profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"], profileStatus: "pending_verification", verificationSubmittedAt: new Date(), verificationSubmissionVersion: 1 });
  const valid = await ProfileVerificationRequest.create({ verificationReference: "PROFILE_VERIFICATION_TRANSITION_VALID", profileId: profile._id, userId: user._id, attemptNumber: 1, profileSubmissionVersion: 1, submittedAt: new Date() });
  const approved = await profileVerificationRequestRepository.transitionToTerminal({ requestId: valid._id, decision: "APPROVE", authority: "ADMIN", decidedAt: new Date(), now: new Date() });
  assert.equal(approved?.status, "APPROVED");
  assert.equal(await profileVerificationRequestRepository.transitionToExpired({ requestId: valid._id, now: new Date(), retentionDeadline: new Date() }), null);

  const old = new Date(Date.now() - FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS - 1);
  const expired = await ProfileVerificationRequest.create({ verificationReference: "PROFILE_VERIFICATION_TRANSITION_EXPIRED", profileId: profile._id, userId: user._id, attemptNumber: 2, profileSubmissionVersion: 2, submittedAt: old });
  assert.equal(await profileVerificationRequestRepository.transitionToTerminal({ requestId: expired._id, decision: "REJECT", authority: "ADMIN", reason: "unused", decidedAt: new Date(), now: new Date() }), null);
  assert.equal((await profileVerificationRequestRepository.transitionToExpired({ requestId: expired._id, now: new Date(), retentionDeadline: new Date(old.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS) }))?.status, "EXPIRED");
  await ProfileVerificationRequest.updateOne({ _id: expired._id }, { $set: { submittedAt: new Date() } });
  assert.equal((await ProfileVerificationRequest.findById(expired._id))?.submittedAt.getTime(), old.getTime());
});
