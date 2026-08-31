import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { ProfileVerificationJob } from "../../models/profileVerificationJob.model";
import { ProfileVerificationInferenceResult } from "../../models/profileVerificationInferenceResult.model";
import { Types } from "mongoose";
import { ensureActiveProfileVerificationRequest, decideProfileVerificationRequest, escalateProfileVerificationRequest } from "../../services/profile/profileVerificationRequest.service";
import {
  claimProfileVerificationJob,
  ensureProfileVerificationJob,
  recordProfileVerificationJobFailure,
  reconcileProfileVerificationJobs,
} from "../../services/profile/profileVerificationJob.service";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

const makeProfile = async (suffix: string, submittedAt = new Date()) => {
  const user = await User.create({ email: `verification-job-${suffix}@test.local`, password: "test-password", status: "active", governanceState: "ACTIVE" });
  const profile = await UserProfile.create({
    userId: user._id,
    username: `verification-job-${suffix}`,
    dateOfBirth: new Date("1990-01-01"),
    interests: [], bio: "Verification job test.", avatar: "https://example.test/avatar.jpg", cover: "https://example.test/cover.jpg",
    profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
    profileStatus: "pending_verification", verificationSubmittedAt: submittedAt, verificationSubmissionVersion: 1,
  });
  const request = await ensureActiveProfileVerificationRequest(profile);
  return { user, profile, request: request.request };
};

const recordCompletedInference = async (request: Awaited<ReturnType<typeof makeProfile>>["request"]) => {
  await ProfileVerificationInferenceResult.create({
    inferenceReference: `PROFILE_INFERENCE_COMPLETED_${String(request._id)}`,
    inferenceRunFingerprint: "a".repeat(63) + "1",
    verificationRequestId: request._id, profileId: request.profileId, userId: request.userId,
    profileSubmissionVersion: request.profileSubmissionVersion, faceVerificationSessionId: new Types.ObjectId(),
    evidenceSetFingerprint: "b".repeat(64), pipelineManifestFingerprint: "c".repeat(64),
    pipeline: { kind: "TEST_SYNTHETIC", pipelineVersion: "test", runtimeIdentifier: "test", runtimeVersion: "1" },
    findings: {
      captures: [0, 1, 2, 3, 4].map((challengeIndex) => ({ challengeIndex, challenge: "NEUTRAL", faceCount: "ONE", usability: "USABLE", reasonCodes: [] })),
      crossCapture: { status: "CONSISTENT", usableCaptureCount: 5, outlierCaptureCount: 0 }, avatar: { status: "MATCH_UNCERTAIN" }, antiSpoof: { status: "NOT_RUN" },
    },
    shadowIdentityAnalysis: { status: "COMPLETED", conclusion: "UNABLE_TO_DETERMINE", similarity: 0.42, model: { identifier: "TEST", version: "1" }, processedAt: new Date(), reasonCode: "THRESHOLD_NOT_CONFIGURED", reason: "Threshold is not configured." },
    retentionDeadline: new Date(request.submittedAt.getTime() + 86_400_000),
  });
};

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

test("verification jobs are durable, unique per request, and atomically claimed", async () => {
  const { request, profile } = await makeProfile("creation");
  await Promise.all([ensureProfileVerificationJob(request), ensureProfileVerificationJob(request)]);
  assert.equal(await ProfileVerificationJob.countDocuments({ verificationRequestId: request._id }), 1);

  const now = new Date();
  const [first, second] = await Promise.all([
    claimProfileVerificationJob({ workerId: "worker-a", now }),
    claimProfileVerificationJob({ workerId: "worker-b", now }),
  ]);
  assert.equal([first, second].filter(Boolean).length, 1);
  const claimed = first ?? second;
  assert.ok(claimed?.actionable);
  assert.equal((await ProfileVerificationRequest.findById(request._id))?.status, "PROCESSING");
  assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "pending_verification");
});

test("expired leases recover and background claims do not depend on an HTTP request", async () => {
  const started = new Date("2030-01-01T00:00:00.000Z");
  const { request } = await makeProfile("lease", started);
  await ensureProfileVerificationJob(request);
  const claim = await claimProfileVerificationJob({ workerId: "worker-a", now: started });
  assert.ok(claim?.job);
  await reconcileProfileVerificationJobs(new Date(started.getTime() + (5 * 60 * 1000) + 1));
  const recovered = await ProfileVerificationJob.findById(claim!.job._id);
  assert.equal(recovered?.status, "RETRY_WAIT");
  const reClaimed = await claimProfileVerificationJob({ workerId: "worker-b", now: new Date(started.getTime() + (5 * 60 * 1000) + 1) });
  assert.equal(reClaimed?.actionable, true);
});

test("deadline reconciliation escalates exactly at 30 minutes without cancelling active work", async () => {
  const now = new Date("2030-01-01T12:30:00.000Z");
  const submittedAt = new Date(now.getTime() - (29 * 60 * 1000));
  const { request, profile } = await makeProfile("deadline", submittedAt);
  await ensureProfileVerificationJob(request);
  const beforeDeadline = await reconcileProfileVerificationJobs(now);
  assert.equal(beforeDeadline.timeoutEscalated, 0);
  assert.equal((await ProfileVerificationRequest.findById(request._id))?.status, "PENDING");

  const deadline = new Date(now.getTime() + 60 * 1000);
  const atDeadline = await reconcileProfileVerificationJobs(deadline);
  assert.equal(atDeadline.timeoutEscalated, 1);
  const escalated = await ProfileVerificationRequest.findById(request._id);
  assert.equal(escalated?.status, "ADMIN_REVIEW_REQUIRED");
  assert.equal(escalated?.isActive, true);
  assert.equal(escalated?.adminReviewReasonCode, "PROCESSING_TIMEOUT");
  assert.equal(escalated?.decision, undefined);
  assert.equal(escalated?.submittedAt.getTime(), submittedAt.getTime());
  assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "pending_verification");
  assert.equal((await ProfileVerificationJob.findOne({ verificationRequestId: request._id }))?.status, "PENDING");
  const replay = await reconcileProfileVerificationJobs(new Date(deadline.getTime() + 60_000));
  assert.equal(replay.timeoutEscalated, 0);
  assert.equal((await ProfileVerificationRequest.findById(request._id))?.status, "ADMIN_REVIEW_REQUIRED");
});

test("completed shadow inference is awaiting Admin and never becomes a processing timeout", async () => {
  const now = new Date("2030-01-01T12:30:00.000Z");
  const { request } = await makeProfile("completed", new Date(now.getTime() - 30 * 60 * 1000));
  const { job } = await ensureProfileVerificationJob(request);
  await ProfileVerificationJob.updateOne({ _id: job._id }, { $set: { status: "COMPLETED", completedAt: now } });
  await recordCompletedInference(request);
  const report = await reconcileProfileVerificationJobs(now);
  assert.equal(report.timeoutEscalated, 0);
  assert.equal((await ProfileVerificationRequest.findById(request._id))?.status, "PENDING");
});

test("retry is durable and exhaustion escalates without rejecting the user", async () => {
  const now = new Date("2030-01-01T00:00:00.000Z");
  const { request, profile } = await makeProfile("retry", now);
  await ensureProfileVerificationJob(request);
  let claimed = await claimProfileVerificationJob({ workerId: "retry-worker", now });
  assert.ok(claimed?.job);
  const retry = await recordProfileVerificationJobFailure({ jobId: String(claimed!.job._id), workerId: "retry-worker", errorCode: "TEMPORARY_UNAVAILABLE", now });
  assert.equal(retry?.status, "RETRY_WAIT");
  assert.ok(retry?.nextAttemptAt.getTime() > now.getTime());

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const job = await ProfileVerificationJob.findById(claimed!.job._id);
    assert.ok(job);
    job.nextAttemptAt = new Date(now.getTime() + (attempt + 1) * 60_000);
    await job.save();
    claimed = await claimProfileVerificationJob({ workerId: "retry-worker", now: job.nextAttemptAt });
    assert.ok(claimed?.job);
    await recordProfileVerificationJobFailure({ jobId: String(claimed!.job._id), workerId: "retry-worker", errorCode: "TEMPORARY_UNAVAILABLE", now: job.nextAttemptAt });
  }
  const failed = await ProfileVerificationJob.findOne({ verificationRequestId: request._id });
  assert.equal(failed?.status, "FAILED");
  assert.equal((await ProfileVerificationRequest.findById(request._id))?.status, "ADMIN_REVIEW_REQUIRED");
  assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "pending_verification");
});

test("terminal or stale-version jobs become no-ops and cannot override decisions", async () => {
  const { request, profile } = await makeProfile("terminal");
  const { job } = await ensureProfileVerificationJob(request);
  const admin = await User.create({ email: "verification-job-admin@test.local", password: "test-password", role: "admin", status: "active", governanceState: "ACTIVE" });
  await decideProfileVerificationRequest({ profileId: String(profile._id), decision: "APPROVE", authority: "ADMIN", decidedBy: String(admin._id) });
  await reconcileProfileVerificationJobs(new Date());
  assert.equal((await ProfileVerificationJob.findById(job._id))?.status, "COMPLETED");
  assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "verified");

  const stale = await makeProfile("stale");
  const staleJob = (await ensureProfileVerificationJob(stale.request)).job;
  staleJob.profileSubmissionVersion = 999;
  await staleJob.save();
  const claimed = await claimProfileVerificationJob({ workerId: "stale-worker", now: new Date() });
  assert.equal(claimed?.actionable, false);
  assert.equal((await ProfileVerificationRequest.findById(stale.request._id))?.status, "PENDING");
  assert.equal((await ProfileVerificationJob.findById(staleJob._id))?.status, "COMPLETED");
});

test("legacy active requests reconcile into one job and unresolved escalated work remains AI-decidable", async () => {
  const { request, profile } = await makeProfile("legacy");
  await reconcileProfileVerificationJobs(new Date());
  await reconcileProfileVerificationJobs(new Date());
  assert.equal(await ProfileVerificationJob.countDocuments({ verificationRequestId: request._id }), 1);
  await escalateProfileVerificationRequest({ profileId: String(profile._id), reasonCode: "OTHER", reason: "Manual review is required." });
  const decision = await decideProfileVerificationRequest({ profileId: String(profile._id), decision: "APPROVE", authority: "AI", aiDecisionSnapshot: { source: "AI", model: { identifier: "OPENCV_ZOO_SFACE", version: "face_recognition_sface_2021dec" }, similarity: 0.99, threshold: 0.9, decidedAt: new Date() } });
  assert.equal(decision.request.status, "APPROVED");
});
