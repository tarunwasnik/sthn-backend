import { Types } from "mongoose";

import {
  ProfileVerificationJob,
  ProfileVerificationJobDocument,
} from "../models/profileVerificationJob.model";

export class ProfileVerificationJobRepository {
  findById(jobId: Types.ObjectId) {
    return ProfileVerificationJob.findById(jobId).exec();
  }

  findByRequestId(verificationRequestId: Types.ObjectId) {
    return ProfileVerificationJob.findOne({ verificationRequestId, jobType: "PROFILE_VERIFICATION_PROCESSING" }).exec();
  }

  findByRequestIds(verificationRequestIds: Types.ObjectId[]) {
    return ProfileVerificationJob.find({ verificationRequestId: { $in: verificationRequestIds }, jobType: "PROFILE_VERIFICATION_PROCESSING" }).exec();
  }

  async create(input: Pick<ProfileVerificationJobDocument, "jobReference" | "verificationRequestId" | "profileId" | "userId" | "profileSubmissionVersion" | "nextAttemptAt">) {
    const [job] = await ProfileVerificationJob.create([{ ...input, jobType: "PROFILE_VERIFICATION_PROCESSING", status: "PENDING", attemptCount: 0, maxRetryCount: 3 }]);
    return job;
  }

  claimNext(workerId: string, now: Date, leaseExpiresAt: Date) {
    return ProfileVerificationJob.findOneAndUpdate(
      {
        status: { $in: ["PENDING", "RETRY_WAIT"] },
        nextAttemptAt: { $lte: now },
      },
      {
        $set: { status: "RUNNING", workerId, claimedAt: now, leaseExpiresAt, lastStartedAt: now },
        $inc: { attemptCount: 1 },
      },
      { new: true, sort: { nextAttemptAt: 1, _id: 1 }, runValidators: true },
    ).exec();
  }

  recoverExpiredLeases(now: Date) {
    return ProfileVerificationJob.updateMany(
      { status: "RUNNING", leaseExpiresAt: { $lte: now } },
      {
        $set: { status: "RETRY_WAIT", nextAttemptAt: now },
        $unset: { workerId: 1, claimedAt: 1, leaseExpiresAt: 1 },
      },
    ).exec();
  }

  scheduleRetry(input: { jobId: Types.ObjectId; workerId: string; nextAttemptAt: Date; errorCode: string; errorMessage?: string }) {
    return ProfileVerificationJob.findOneAndUpdate(
      { _id: input.jobId, status: "RUNNING", workerId: input.workerId },
      {
        $set: { status: "RETRY_WAIT", nextAttemptAt: input.nextAttemptAt, lastErrorCode: input.errorCode, ...(input.errorMessage ? { lastErrorMessage: input.errorMessage } : {}) },
        $unset: { claimedAt: 1, leaseExpiresAt: 1, workerId: 1 },
      },
      { new: true, runValidators: true },
    ).exec();
  }

  fail(input: { jobId: Types.ObjectId; workerId: string; now: Date; errorCode: string; errorMessage?: string }) {
    return ProfileVerificationJob.findOneAndUpdate(
      { _id: input.jobId, status: "RUNNING", workerId: input.workerId },
      {
        $set: { status: "FAILED", failedAt: input.now, lastErrorCode: input.errorCode, ...(input.errorMessage ? { lastErrorMessage: input.errorMessage } : {}) },
        $unset: { claimedAt: 1, leaseExpiresAt: 1, workerId: 1 },
      },
      { new: true, runValidators: true },
    ).exec();
  }

  completeIfNotTerminal(input: { jobId: Types.ObjectId; now: Date }) {
    return ProfileVerificationJob.findOneAndUpdate(
      { _id: input.jobId, status: { $in: ["PENDING", "RUNNING", "RETRY_WAIT"] } },
      { $set: { status: "COMPLETED", completedAt: input.now }, $unset: { claimedAt: 1, leaseExpiresAt: 1, workerId: 1 } },
      { new: true, runValidators: true },
    ).exec();
  }

  listNonTerminal() {
    return ProfileVerificationJob.find({ status: { $in: ["PENDING", "RUNNING", "RETRY_WAIT"] } }).exec();
  }
}

export const profileVerificationJobRepository = new ProfileVerificationJobRepository();
