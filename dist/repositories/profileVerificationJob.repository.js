"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileVerificationJobRepository = exports.ProfileVerificationJobRepository = void 0;
const profileVerificationJob_model_1 = require("../models/profileVerificationJob.model");
class ProfileVerificationJobRepository {
    findById(jobId) {
        return profileVerificationJob_model_1.ProfileVerificationJob.findById(jobId).exec();
    }
    findByRequestId(verificationRequestId) {
        return profileVerificationJob_model_1.ProfileVerificationJob.findOne({ verificationRequestId, jobType: "PROFILE_VERIFICATION_PROCESSING" }).exec();
    }
    async create(input) {
        const [job] = await profileVerificationJob_model_1.ProfileVerificationJob.create([{ ...input, jobType: "PROFILE_VERIFICATION_PROCESSING", status: "PENDING", attemptCount: 0, maxRetryCount: 3 }]);
        return job;
    }
    claimNext(workerId, now, leaseExpiresAt) {
        return profileVerificationJob_model_1.ProfileVerificationJob.findOneAndUpdate({
            status: { $in: ["PENDING", "RETRY_WAIT"] },
            nextAttemptAt: { $lte: now },
        }, {
            $set: { status: "RUNNING", workerId, claimedAt: now, leaseExpiresAt, lastStartedAt: now },
            $inc: { attemptCount: 1 },
        }, { new: true, sort: { nextAttemptAt: 1, _id: 1 }, runValidators: true }).exec();
    }
    recoverExpiredLeases(now) {
        return profileVerificationJob_model_1.ProfileVerificationJob.updateMany({ status: "RUNNING", leaseExpiresAt: { $lte: now } }, {
            $set: { status: "RETRY_WAIT", nextAttemptAt: now },
            $unset: { workerId: 1, claimedAt: 1, leaseExpiresAt: 1 },
        }).exec();
    }
    scheduleRetry(input) {
        return profileVerificationJob_model_1.ProfileVerificationJob.findOneAndUpdate({ _id: input.jobId, status: "RUNNING", workerId: input.workerId }, {
            $set: { status: "RETRY_WAIT", nextAttemptAt: input.nextAttemptAt, lastErrorCode: input.errorCode, ...(input.errorMessage ? { lastErrorMessage: input.errorMessage } : {}) },
            $unset: { claimedAt: 1, leaseExpiresAt: 1, workerId: 1 },
        }, { new: true, runValidators: true }).exec();
    }
    fail(input) {
        return profileVerificationJob_model_1.ProfileVerificationJob.findOneAndUpdate({ _id: input.jobId, status: "RUNNING", workerId: input.workerId }, {
            $set: { status: "FAILED", failedAt: input.now, lastErrorCode: input.errorCode, ...(input.errorMessage ? { lastErrorMessage: input.errorMessage } : {}) },
            $unset: { claimedAt: 1, leaseExpiresAt: 1, workerId: 1 },
        }, { new: true, runValidators: true }).exec();
    }
    completeIfNotTerminal(input) {
        return profileVerificationJob_model_1.ProfileVerificationJob.findOneAndUpdate({ _id: input.jobId, status: { $in: ["PENDING", "RUNNING", "RETRY_WAIT"] } }, { $set: { status: "COMPLETED", completedAt: input.now }, $unset: { claimedAt: 1, leaseExpiresAt: 1, workerId: 1 } }, { new: true, runValidators: true }).exec();
    }
    listNonTerminal() {
        return profileVerificationJob_model_1.ProfileVerificationJob.find({ status: { $in: ["PENDING", "RUNNING", "RETRY_WAIT"] } }).exec();
    }
}
exports.ProfileVerificationJobRepository = ProfileVerificationJobRepository;
exports.profileVerificationJobRepository = new ProfileVerificationJobRepository();
