"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconcileProfileVerificationJobs = exports.recordProfileVerificationJobFailure = exports.claimProfileVerificationJob = exports.ensureProfileVerificationJob = void 0;
const ulid_1 = require("ulid");
const mongoose_1 = require("mongoose");
const profileVerificationJob_repository_1 = require("../../repositories/profileVerificationJob.repository");
const profileVerificationRequest_repository_1 = require("../../repositories/profileVerificationRequest.repository");
const faceVerification_constants_1 = require("./faceVerification.constants");
const LEASE_MS = 5 * 60 * 1000;
const RETRY_DELAYS_MS = [60000, 5 * 60000, 15 * 60000];
const processingJobReference = () => `PROFILE_VERIFICATION_JOB_${(0, ulid_1.ulid)()}`;
const boundedError = (value, maximum) => (typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : undefined);
const isTerminalRequest = (request) => (!request || !request.isActive || request.status === "APPROVED" || request.status === "REJECTED" || request.status === "EXPIRED");
const ensureProfileVerificationJob = async (request) => {
    const existing = await profileVerificationJob_repository_1.profileVerificationJobRepository.findByRequestId(request._id);
    if (existing)
        return { job: existing, created: false };
    try {
        const job = await profileVerificationJob_repository_1.profileVerificationJobRepository.create({
            jobReference: processingJobReference(),
            verificationRequestId: request._id,
            profileId: request.profileId,
            userId: request.userId,
            profileSubmissionVersion: request.profileSubmissionVersion,
            nextAttemptAt: new Date(),
        });
        return { job, created: true };
    }
    catch (error) {
        if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000))
            throw error;
        const concurrent = await profileVerificationJob_repository_1.profileVerificationJobRepository.findByRequestId(request._id);
        if (!concurrent)
            throw error;
        return { job: concurrent, created: false };
    }
};
exports.ensureProfileVerificationJob = ensureProfileVerificationJob;
const claimProfileVerificationJob = async (input) => {
    const now = input.now ?? new Date();
    const job = await profileVerificationJob_repository_1.profileVerificationJobRepository.claimNext(input.workerId, now, new Date(now.getTime() + LEASE_MS));
    if (!job)
        return null;
    const request = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.findById(job.verificationRequestId);
    if (isTerminalRequest(request) || request.profileSubmissionVersion !== job.profileSubmissionVersion
        || request.submittedAt.getTime() + faceVerification_constants_1.FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS <= now.getTime()) {
        await profileVerificationJob_repository_1.profileVerificationJobRepository.completeIfNotTerminal({ jobId: job._id, now });
        return { job, request, actionable: false };
    }
    if (request.status === "PENDING") {
        const processing = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.transitionPendingToProcessing(request._id, now);
        if (!processing) {
            const current = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.findById(request._id);
            if (isTerminalRequest(current) || current?.profileSubmissionVersion !== job.profileSubmissionVersion) {
                await profileVerificationJob_repository_1.profileVerificationJobRepository.completeIfNotTerminal({ jobId: job._id, now });
                return { job, request: current, actionable: false };
            }
        }
    }
    return { job, request, actionable: true };
};
exports.claimProfileVerificationJob = claimProfileVerificationJob;
const recordProfileVerificationJobFailure = async (input) => {
    const now = input.now ?? new Date();
    if (!mongoose_1.Types.ObjectId.isValid(input.jobId))
        return null;
    const job = await profileVerificationJob_repository_1.profileVerificationJobRepository.findById(new mongoose_1.Types.ObjectId(input.jobId));
    if (!job || job.status !== "RUNNING" || job.workerId !== input.workerId)
        return null;
    const errorCode = boundedError(input.errorCode, 80);
    if (!errorCode)
        throw new Error("Profile verification job error code is required");
    const errorMessage = boundedError(input.errorMessage, 500);
    if (job.attemptCount >= job.maxRetryCount) {
        const failed = await profileVerificationJob_repository_1.profileVerificationJobRepository.fail({ jobId: job._id, workerId: input.workerId, now, errorCode, errorMessage });
        if (!failed)
            return null;
        const request = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.findById(failed.verificationRequestId);
        if (request && request.isActive && (request.status === "PENDING" || request.status === "PROCESSING")) {
            const { escalateProfileVerificationRequest } = await Promise.resolve().then(() => __importStar(require("./profileVerificationRequest.service")));
            await escalateProfileVerificationRequest({ profileId: String(request.profileId), reasonCode: "MODEL_FAILURE", reason: "Verification processing could not be completed after bounded retries." });
        }
        return failed;
    }
    const delayIndex = Math.min(job.attemptCount - 1, RETRY_DELAYS_MS.length - 1);
    return profileVerificationJob_repository_1.profileVerificationJobRepository.scheduleRetry({
        jobId: job._id,
        workerId: input.workerId,
        nextAttemptAt: new Date(now.getTime() + RETRY_DELAYS_MS[delayIndex]),
        errorCode,
        errorMessage,
    });
};
exports.recordProfileVerificationJobFailure = recordProfileVerificationJobFailure;
const reconcileProfileVerificationJobs = async (now = new Date()) => {
    const report = { jobsCreated: 0, expiredLeasesRecovered: 0, terminalJobsCompleted: 0, timeoutEscalated: 0, skipped: 0 };
    const { expireProfileVerificationRequests } = await Promise.resolve().then(() => __importStar(require("./profileVerificationRequest.service")));
    await expireProfileVerificationRequests(now);
    const recovered = await profileVerificationJob_repository_1.profileVerificationJobRepository.recoverExpiredLeases(now);
    report.expiredLeasesRecovered = recovered.modifiedCount;
    const activeRequests = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.listActive();
    for (const request of activeRequests) {
        const ensured = await (0, exports.ensureProfileVerificationJob)(request);
        if (ensured.created)
            report.jobsCreated += 1;
    }
    const nonTerminalJobs = await profileVerificationJob_repository_1.profileVerificationJobRepository.listNonTerminal();
    for (const job of nonTerminalJobs) {
        const request = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.findById(job.verificationRequestId);
        if (isTerminalRequest(request) || request.profileSubmissionVersion !== job.profileSubmissionVersion) {
            const completed = await profileVerificationJob_repository_1.profileVerificationJobRepository.completeIfNotTerminal({ jobId: job._id, now });
            if (completed)
                report.terminalJobsCompleted += 1;
        }
    }
    return report;
};
exports.reconcileProfileVerificationJobs = reconcileProfileVerificationJobs;
