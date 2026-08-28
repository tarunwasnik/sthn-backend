import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";
import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { ProfileVerificationJob } from "../../models/profileVerificationJob.model";
import { ensureActiveProfileVerificationRequest, decideProfileVerificationRequest, escalateProfileVerificationRequest, expireProfileVerificationRequests, listProfileVerificationQueue } from "../../services/profile/profileVerificationRequest.service";
import { claimProfileVerificationJob, ensureProfileVerificationJob, recordProfileVerificationJobFailure, reconcileProfileVerificationJobs } from "../../services/profile/profileVerificationJob.service";
import { FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS } from "../../services/profile/faceVerification.constants";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

const expiredAt = () => new Date(Date.now() - FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS - 1);
const makeAttempt = async (suffix: string, submittedAt = new Date()) => {
  const user = await User.create({ email: `operational-authority-${suffix}@test.local`, password: "test-password", status: "active", governanceState: "ACTIVE" });
  const profile = await UserProfile.create({
    userId: user._id, username: `operational-authority-${suffix}`, dateOfBirth: new Date("1990-01-01"), interests: [],
    bio: "Operational authority.", avatar: "avatar", cover: "cover", profilePhotos: ["one", "two"],
    profileStatus: "pending_verification", verificationSubmittedAt: submittedAt, verificationSubmissionVersion: 1,
  });
  const { request } = await ensureActiveProfileVerificationRequest(profile);
  const { job } = await ensureProfileVerificationJob(request);
  return { user, profile, request, job, submittedAt };
};
const assertExpiredNonPunitive = async (requestId: Types.ObjectId, profileId: Types.ObjectId) => {
  const [request, profile] = await Promise.all([ProfileVerificationRequest.findById(requestId), UserProfile.findById(profileId)]);
  assert.equal(request?.status, "EXPIRED"); assert.equal(request?.isActive, false); assert.ok(request?.expiredAt);
  assert.equal(request?.decision, undefined); assert.equal(request?.decisionAuthority, undefined); assert.equal(request?.decidedAt, undefined); assert.equal(request?.decidedBy, undefined);
  assert.equal(profile?.profileStatus, "incomplete"); assert.equal(profile?.rejectionReason, "");
};

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

test("pending and retry jobs complete as no-ops after request expiry", async () => {
  const pending = await makeAttempt("pending", expiredAt());
  await expireProfileVerificationRequests(new Date());
  const pendingClaim = await claimProfileVerificationJob({ workerId: "worker-pending", now: new Date() });
  assert.equal(pendingClaim?.actionable, false);
  assert.equal((await ProfileVerificationJob.findById(pending.job._id))?.status, "COMPLETED");
  await assertExpiredNonPunitive(pending.request._id, pending.profile._id);

  const retry = await makeAttempt("retry");
  const activeClaim = await claimProfileVerificationJob({ workerId: "worker-retry", now: new Date() });
  assert.ok(activeClaim?.actionable);
  await recordProfileVerificationJobFailure({ jobId: String(retry.job._id), workerId: "worker-retry", errorCode: "TEST_RETRY", now: new Date() });
  assert.equal((await ProfileVerificationJob.findById(retry.job._id))?.status, "RETRY_WAIT");
  const retryDeadline = new Date(retry.request.submittedAt.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS);
  await expireProfileVerificationRequests(retryDeadline);
  await reconcileProfileVerificationJobs(retryDeadline);
  assert.equal((await ProfileVerificationJob.findById(retry.job._id))?.status, "COMPLETED");
  await assertExpiredNonPunitive(retry.request._id, retry.profile._id);
});

test("claimed workers, processing, and admin-review requests cannot revive after expiry", async () => {
  const claimed = await makeAttempt("claimed");
  const claim = await claimProfileVerificationJob({ workerId: "worker-claimed", now: new Date() });
  assert.ok(claim?.actionable);
  const claimedDeadline = new Date(claimed.request.submittedAt.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS);
  await expireProfileVerificationRequests(claimedDeadline);
  await recordProfileVerificationJobFailure({ jobId: String(claimed.job._id), workerId: "worker-claimed", errorCode: "STALE_WORKER", now: claimedDeadline });
  await reconcileProfileVerificationJobs(claimedDeadline);
  assert.equal((await ProfileVerificationJob.findById(claimed.job._id))?.status, "COMPLETED");
  await assertExpiredNonPunitive(claimed.request._id, claimed.profile._id);

  const review = await makeAttempt("review");
  await escalateProfileVerificationRequest({ profileId: String(review.profile._id), reasonCode: "MODEL_FAILURE" });
  assert.equal((await ProfileVerificationRequest.findById(review.request._id))?.status, "ADMIN_REVIEW_REQUIRED");
  const reviewDeadline = new Date(review.request.submittedAt.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS);
  await expireProfileVerificationRequests(reviewDeadline);
  await assertExpiredNonPunitive(review.request._id, review.profile._id);
  const [aiQueue, adminQueue] = await Promise.all([listProfileVerificationQueue("AI"), listProfileVerificationQueue("ADMIN_REVIEW")]);
  assert.equal(aiQueue.some((entry) => entry._id === String(review.profile._id)), false);
  assert.equal(adminQueue.some((entry) => entry._id === String(review.profile._id)), false);
});

test("expired Admin decisions fail while fresh V2 job and queue authority remain independent", async () => {
  const v1 = await makeAttempt("v1", expiredAt());
  await expireProfileVerificationRequests(new Date());
  const admin = await User.create({ email: "operational-authority-admin@test.local", password: "test-password", role: "admin", status: "active", governanceState: "ACTIVE" });
  await assert.rejects(decideProfileVerificationRequest({ profileId: String(v1.profile._id), decision: "APPROVE", authority: "ADMIN", decidedBy: String(admin._id) }), /expired/);
  await assert.rejects(decideProfileVerificationRequest({ profileId: String(v1.profile._id), decision: "REJECT", authority: "ADMIN", decidedBy: String(admin._id), reason: "unused" }), /expired/);
  await assertExpiredNonPunitive(v1.request._id, v1.profile._id);

  const profile = await UserProfile.findById(v1.profile._id); assert.ok(profile);
  profile.profileStatus = "pending_verification"; profile.verificationSubmissionVersion = 2; profile.verificationSubmittedAt = new Date(); await profile.save();
  const { request: v2 } = await ensureActiveProfileVerificationRequest(profile);
  const { job: v2Job } = await ensureProfileVerificationJob(v2);
  const [aiQueue, adminQueue] = await Promise.all([listProfileVerificationQueue("AI"), listProfileVerificationQueue("ADMIN_REVIEW")]);
  assert.equal(v2.isActive, true); assert.equal(v2.profileSubmissionVersion, 2);
  assert.notEqual(String(v2._id), String(v1.request._id)); assert.notEqual(String(v2Job._id), String(v1.job._id));
  assert.equal(String(v2Job.verificationRequestId), String(v2._id)); assert.equal(v2Job.profileSubmissionVersion, 2);
  assert.equal(aiQueue.find((entry) => entry._id === String(v1.profile._id))?.verificationRequest.profileSubmissionVersion, 2);
  assert.equal(adminQueue.some((entry) => entry._id === String(v1.profile._id)), false);
  assert.equal((await ProfileVerificationRequest.findById(v1.request._id))?.submittedAt.getTime(), v1.submittedAt.getTime());
});
