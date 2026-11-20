import { ClientSession, Types } from "mongoose";

import {
  ProfileVerificationJob,
  ProfileVerificationJobDocument,
} from "../models/profileVerificationJob.model";
import { ProfileVerificationRequest } from "../models/profileVerificationRequest.model";
import { VerificationTarget } from "../services/creator/creatorVerificationTarget";

export class ProfileVerificationJobRepository {
  async createForTarget(input: Omit<Pick<ProfileVerificationJobDocument, "jobReference" | "verificationRequestId" | "nextAttemptAt">, "profileId" | "userId" | "profileSubmissionVersion"> & Pick<VerificationTarget, "targetType" | "targetId" | "ownerUserId" | "verificationRevision">, session?: ClientSession) {
    const request = await ProfileVerificationRequest.exists({
      _id: input.verificationRequestId,
      targetType: input.targetType,
      targetId: input.targetId,
      ownerUserId: input.ownerUserId,
      verificationRevision: input.verificationRevision,
    }).session(session ?? null);
    if (!request) throw new Error("Verification job target does not match its request");
    const { targetType, targetId, ownerUserId, verificationRevision, ...jobInput } = input;
    const [job] = await ProfileVerificationJob.create([{
      ...jobInput, userId: ownerUserId, targetType, targetId, ownerUserId, ...(targetType === "USER_PROFILE" ? { profileId: targetId } : {}),
      verificationRevision, profileSubmissionVersion: verificationRevision,
      jobType: "PROFILE_VERIFICATION_PROCESSING", status: "PENDING", attemptCount: 0, maxRetryCount: 3,
    }], session ? { session } : undefined);
    return job;
  }
  findById(jobId: Types.ObjectId) {
    return ProfileVerificationJob.findById(jobId).exec();
  }

  findByRequestId(verificationRequestId: Types.ObjectId, session?: ClientSession) {
    return ProfileVerificationJob.findOne({ verificationRequestId, jobType: "PROFILE_VERIFICATION_PROCESSING" }).session(session ?? null).exec();
  }

  findByRequestIds(verificationRequestIds: Types.ObjectId[]) {
    return ProfileVerificationJob.find({ verificationRequestId: { $in: verificationRequestIds }, jobType: "PROFILE_VERIFICATION_PROCESSING" }).exec();
  }

  async create(input: Pick<ProfileVerificationJobDocument, "jobReference" | "verificationRequestId" | "profileId" | "userId" | "profileSubmissionVersion" | "nextAttemptAt">, session?: ClientSession) {
    const [job] = await ProfileVerificationJob.create([{
      ...input,
      targetType: "USER_PROFILE",
      targetId: input.profileId,
      ownerUserId: input.userId,
      verificationRevision: input.profileSubmissionVersion,
      jobType: "PROFILE_VERIFICATION_PROCESSING", status: "PENDING", attemptCount: 0, maxRetryCount: 3,
    }], session ? { session } : undefined);
    return job;
  }

  claimNext(workerId: string, now: Date, leaseExpiresAt: Date, creatorUpgradeIds: Types.ObjectId[] = []) {
    return ProfileVerificationJob.findOneAndUpdate(
      {
        status: { $in: ["PENDING", "RETRY_WAIT"] },
        $or: [{ targetType: { $ne: "CREATOR_APPLICATION" } }, { targetType: "CREATOR_APPLICATION", targetId: { $in: creatorUpgradeIds } }],
        nextAttemptAt: { $lte: now },
        $expr: { $lt: ["$attemptCount", "$maxRetryCount"] },
      },
      {
        $set: { status: "RUNNING", workerId, claimedAt: now, leaseExpiresAt, lastStartedAt: now },
        $inc: { attemptCount: 1 },
      },
      { new: true, sort: { nextAttemptAt: 1, _id: 1 }, runValidators: true },
    ).exec();
  }

  recoverExpiredLeasesBelowAttemptLimit(now: Date, creatorUpgradeIds: Types.ObjectId[] = []) {
    return ProfileVerificationJob.updateMany(
      { status: "RUNNING", $or: [{ targetType: { $ne: "CREATOR_APPLICATION" } }, { targetType: "CREATOR_APPLICATION", targetId: { $in: creatorUpgradeIds } }], leaseExpiresAt: { $lte: now }, $expr: { $lt: ["$attemptCount", "$maxRetryCount"] } },
      {
        $set: { status: "RETRY_WAIT", nextAttemptAt: now },
        $unset: { workerId: 1, claimedAt: 1, leaseExpiresAt: 1 },
      },
    ).exec();
  }

  /** Atomically terminalizes one abandoned claim whose existing attempt budget is exhausted. */
  failOneExpiredLeaseAtAttemptLimit(now: Date, creatorUpgradeIds: Types.ObjectId[] = []) {
    return ProfileVerificationJob.findOneAndUpdate(
      { status: "RUNNING", $or: [{ targetType: { $ne: "CREATOR_APPLICATION" } }, { targetType: "CREATOR_APPLICATION", targetId: { $in: creatorUpgradeIds } }], leaseExpiresAt: { $lte: now }, $expr: { $gte: ["$attemptCount", "$maxRetryCount"] } },
      {
        $set: {
          status: "FAILED",
          failedAt: now,
          lastErrorCode: "WORKER_LEASE_EXPIRED",
          lastErrorMessage: "Verification worker stopped before completion after bounded attempts.",
        },
        $unset: { workerId: 1, claimedAt: 1, leaseExpiresAt: 1 },
      },
      { new: true, sort: { leaseExpiresAt: 1, _id: 1 }, runValidators: true },
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

  failInactiveCreatorRequest(jobId: Types.ObjectId, now: Date) {
    return ProfileVerificationJob.findOneAndUpdate({ _id: jobId, targetType: "CREATOR_APPLICATION", status: { $in: ["PENDING", "RUNNING", "RETRY_WAIT"] } }, { $set: { status: "FAILED", failedAt: now, lastErrorCode: "REQUEST_INACTIVE" }, $unset: { claimedAt: 1, leaseExpiresAt: 1, workerId: 1 } }, { new: true, runValidators: true }).exec();
  }

  listNonTerminal() {
    return ProfileVerificationJob.find({ status: { $in: ["PENDING", "RUNNING", "RETRY_WAIT"] } }).exec();
  }
}

export const profileVerificationJobRepository = new ProfileVerificationJobRepository();
