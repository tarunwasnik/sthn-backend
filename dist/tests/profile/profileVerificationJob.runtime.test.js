"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const User_1 = __importDefault(require("../../models/User"));
const userProfile_model_1 = require("../../models/userProfile.model");
const profileVerificationRequest_model_1 = require("../../models/profileVerificationRequest.model");
const profileVerificationJob_model_1 = require("../../models/profileVerificationJob.model");
const profileVerificationRequest_service_1 = require("../../services/profile/profileVerificationRequest.service");
const profileVerificationJob_service_1 = require("../../services/profile/profileVerificationJob.service");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
const makeProfile = async (suffix, submittedAt = new Date()) => {
    const user = await User_1.default.create({ email: `verification-job-${suffix}@test.local`, password: "test-password", status: "active", governanceState: "ACTIVE" });
    const profile = await userProfile_model_1.UserProfile.create({
        userId: user._id,
        username: `verification-job-${suffix}`,
        dateOfBirth: new Date("1990-01-01"),
        interests: [], bio: "Verification job test.", avatar: "https://example.test/avatar.jpg", cover: "https://example.test/cover.jpg",
        profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
        profileStatus: "pending_verification", verificationSubmittedAt: submittedAt, verificationSubmissionVersion: 1,
    });
    const request = await (0, profileVerificationRequest_service_1.ensureActiveProfileVerificationRequest)(profile);
    return { user, profile, request: request.request };
};
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
(0, node_test_1.test)("verification jobs are durable, unique per request, and atomically claimed", async () => {
    const { request, profile } = await makeProfile("creation");
    await Promise.all([(0, profileVerificationJob_service_1.ensureProfileVerificationJob)(request), (0, profileVerificationJob_service_1.ensureProfileVerificationJob)(request)]);
    strict_1.default.equal(await profileVerificationJob_model_1.ProfileVerificationJob.countDocuments({ verificationRequestId: request._id }), 1);
    const now = new Date();
    const [first, second] = await Promise.all([
        (0, profileVerificationJob_service_1.claimProfileVerificationJob)({ workerId: "worker-a", now }),
        (0, profileVerificationJob_service_1.claimProfileVerificationJob)({ workerId: "worker-b", now }),
    ]);
    strict_1.default.equal([first, second].filter(Boolean).length, 1);
    const claimed = first ?? second;
    strict_1.default.ok(claimed?.actionable);
    strict_1.default.equal((await profileVerificationRequest_model_1.ProfileVerificationRequest.findById(request._id))?.status, "PROCESSING");
    strict_1.default.equal((await userProfile_model_1.UserProfile.findById(profile._id))?.profileStatus, "pending_verification");
});
(0, node_test_1.test)("expired leases recover and background claims do not depend on an HTTP request", async () => {
    const { request } = await makeProfile("lease");
    await (0, profileVerificationJob_service_1.ensureProfileVerificationJob)(request);
    const started = new Date("2030-01-01T00:00:00.000Z");
    const claim = await (0, profileVerificationJob_service_1.claimProfileVerificationJob)({ workerId: "worker-a", now: started });
    strict_1.default.ok(claim?.job);
    await (0, profileVerificationJob_service_1.reconcileProfileVerificationJobs)(new Date(started.getTime() + (5 * 60 * 1000) + 1));
    const recovered = await profileVerificationJob_model_1.ProfileVerificationJob.findById(claim.job._id);
    strict_1.default.equal(recovered?.status, "RETRY_WAIT");
    const reClaimed = await (0, profileVerificationJob_service_1.claimProfileVerificationJob)({ workerId: "worker-b", now: new Date(started.getTime() + (5 * 60 * 1000) + 1) });
    strict_1.default.equal(reClaimed?.actionable, true);
});
(0, node_test_1.test)("deadline reconciliation escalates exactly at 30 minutes without cancelling active work", async () => {
    const now = new Date("2030-01-01T12:30:00.000Z");
    const { request, profile } = await makeProfile("deadline", new Date(now.getTime() - (29 * 60 * 1000)));
    await (0, profileVerificationJob_service_1.ensureProfileVerificationJob)(request);
    await (0, profileVerificationJob_service_1.reconcileProfileVerificationJobs)(now);
    strict_1.default.equal((await profileVerificationRequest_model_1.ProfileVerificationRequest.findById(request._id))?.status, "PENDING");
    const deadline = new Date(now.getTime() + 60 * 1000);
    await (0, profileVerificationJob_service_1.reconcileProfileVerificationJobs)(deadline);
    const escalated = await profileVerificationRequest_model_1.ProfileVerificationRequest.findById(request._id);
    strict_1.default.equal(escalated?.status, "ADMIN_REVIEW_REQUIRED");
    strict_1.default.equal(escalated?.adminReviewReasonCode, "PROCESSING_TIMEOUT");
    strict_1.default.equal((await userProfile_model_1.UserProfile.findById(profile._id))?.profileStatus, "pending_verification");
    strict_1.default.equal((await profileVerificationJob_model_1.ProfileVerificationJob.findOne({ verificationRequestId: request._id }))?.status, "PENDING");
    await (0, profileVerificationJob_service_1.reconcileProfileVerificationJobs)(new Date(deadline.getTime() + 60000));
    strict_1.default.equal((await profileVerificationRequest_model_1.ProfileVerificationRequest.findById(request._id))?.status, "ADMIN_REVIEW_REQUIRED");
});
(0, node_test_1.test)("retry is durable and exhaustion escalates without rejecting the user", async () => {
    const { request, profile } = await makeProfile("retry");
    await (0, profileVerificationJob_service_1.ensureProfileVerificationJob)(request);
    const now = new Date("2030-01-01T00:00:00.000Z");
    let claimed = await (0, profileVerificationJob_service_1.claimProfileVerificationJob)({ workerId: "retry-worker", now });
    strict_1.default.ok(claimed?.job);
    const retry = await (0, profileVerificationJob_service_1.recordProfileVerificationJobFailure)({ jobId: String(claimed.job._id), workerId: "retry-worker", errorCode: "TEMPORARY_UNAVAILABLE", now });
    strict_1.default.equal(retry?.status, "RETRY_WAIT");
    strict_1.default.ok(retry?.nextAttemptAt.getTime() > now.getTime());
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const job = await profileVerificationJob_model_1.ProfileVerificationJob.findById(claimed.job._id);
        strict_1.default.ok(job);
        job.nextAttemptAt = new Date(now.getTime() + (attempt + 1) * 60000);
        await job.save();
        claimed = await (0, profileVerificationJob_service_1.claimProfileVerificationJob)({ workerId: "retry-worker", now: job.nextAttemptAt });
        strict_1.default.ok(claimed?.job);
        await (0, profileVerificationJob_service_1.recordProfileVerificationJobFailure)({ jobId: String(claimed.job._id), workerId: "retry-worker", errorCode: "TEMPORARY_UNAVAILABLE", now: job.nextAttemptAt });
    }
    const failed = await profileVerificationJob_model_1.ProfileVerificationJob.findOne({ verificationRequestId: request._id });
    strict_1.default.equal(failed?.status, "FAILED");
    strict_1.default.equal((await profileVerificationRequest_model_1.ProfileVerificationRequest.findById(request._id))?.status, "ADMIN_REVIEW_REQUIRED");
    strict_1.default.equal((await userProfile_model_1.UserProfile.findById(profile._id))?.profileStatus, "pending_verification");
});
(0, node_test_1.test)("terminal or stale-version jobs become no-ops and cannot override decisions", async () => {
    const { request, profile } = await makeProfile("terminal");
    const { job } = await (0, profileVerificationJob_service_1.ensureProfileVerificationJob)(request);
    const admin = await User_1.default.create({ email: "verification-job-admin@test.local", password: "test-password", role: "admin", status: "active", governanceState: "ACTIVE" });
    await (0, profileVerificationRequest_service_1.decideProfileVerificationRequest)({ profileId: String(profile._id), decision: "APPROVE", authority: "ADMIN", decidedBy: String(admin._id) });
    await (0, profileVerificationJob_service_1.reconcileProfileVerificationJobs)(new Date());
    strict_1.default.equal((await profileVerificationJob_model_1.ProfileVerificationJob.findById(job._id))?.status, "COMPLETED");
    strict_1.default.equal((await userProfile_model_1.UserProfile.findById(profile._id))?.profileStatus, "verified");
    const stale = await makeProfile("stale");
    const staleJob = (await (0, profileVerificationJob_service_1.ensureProfileVerificationJob)(stale.request)).job;
    staleJob.profileSubmissionVersion = 999;
    await staleJob.save();
    const claimed = await (0, profileVerificationJob_service_1.claimProfileVerificationJob)({ workerId: "stale-worker", now: new Date() });
    strict_1.default.equal(claimed?.actionable, false);
    strict_1.default.equal((await profileVerificationRequest_model_1.ProfileVerificationRequest.findById(stale.request._id))?.status, "PENDING");
    strict_1.default.equal((await profileVerificationJob_model_1.ProfileVerificationJob.findById(staleJob._id))?.status, "COMPLETED");
});
(0, node_test_1.test)("legacy active requests reconcile into one job and unresolved escalated work remains AI-decidable", async () => {
    const { request, profile } = await makeProfile("legacy");
    await (0, profileVerificationJob_service_1.reconcileProfileVerificationJobs)(new Date());
    await (0, profileVerificationJob_service_1.reconcileProfileVerificationJobs)(new Date());
    strict_1.default.equal(await profileVerificationJob_model_1.ProfileVerificationJob.countDocuments({ verificationRequestId: request._id }), 1);
    await (0, profileVerificationRequest_service_1.escalateProfileVerificationRequest)({ profileId: String(profile._id), reasonCode: "OTHER", reason: "Manual review is required." });
    const decision = await (0, profileVerificationRequest_service_1.decideProfileVerificationRequest)({ profileId: String(profile._id), decision: "APPROVE", authority: "AI" });
    strict_1.default.equal(decision.request.status, "APPROVED");
});
