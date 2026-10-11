import { ClientSession, Types } from "mongoose";
import { ulid } from "ulid";
import { ProfileMediaCleanupJob } from "../models/profileMediaCleanupJob.model";

const failure = (code: string, message?: string) => ({ lastErrorCode: code.slice(0, 80), ...(message ? { lastErrorMessage: message.slice(0, 500) } : {}) });

export class ProfileMediaCleanupJobRepository {
  async enqueue(input: { replacementEventKey: string; userId: Types.ObjectId; profileId: Types.ObjectId; formerReference: string; cloudinaryPublicId: string; slot: string; session?: ClientSession }) {
    const existing = await ProfileMediaCleanupJob.findOne({ replacementEventKey: input.replacementEventKey }).session(input.session ?? null);
    if (existing) return { job: existing, created: false };
    try {
      const [job] = await ProfileMediaCleanupJob.create([{ ...input, jobReference: `PROFILE_MEDIA_CLEANUP_${ulid()}`, status: "PENDING", attemptCount: 0, maxRetryCount: 3, nextAttemptAt: new Date() }], input.session ? { session: input.session } : undefined);
      return { job, created: true };
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000)) throw error;
      const job = await ProfileMediaCleanupJob.findOne({ replacementEventKey: input.replacementEventKey }).session(input.session ?? null);
      if (!job) throw error;
      return { job, created: false };
    }
  }

  claimDue(now: Date, leaseMs: number) {
    const token = ulid();
    return ProfileMediaCleanupJob.findOneAndUpdate({ status: { $in: ["PENDING", "RETRY_WAIT"] }, nextAttemptAt: { $lte: now }, $expr: { $lt: ["$attemptCount", "$maxRetryCount"] } }, { $set: { status: "RUNNING", leaseToken: token, leaseExpiresAt: new Date(now.getTime() + leaseMs) }, $inc: { attemptCount: 1 } }, { new: true, sort: { nextAttemptAt: 1 } }).exec();
  }

  findRunning(id: Types.ObjectId, token: string, session: ClientSession) { return ProfileMediaCleanupJob.findOne({ _id: id, status: "RUNNING", leaseToken: token }).session(session).exec(); }
  complete(id: Types.ObjectId, token: string, now: Date, session?: ClientSession) { return ProfileMediaCleanupJob.findOneAndUpdate({ _id: id, status: "RUNNING", leaseToken: token }, { $set: { status: "COMPLETED", completedAt: now }, $unset: { leaseToken: 1, leaseExpiresAt: 1 } }, { new: true, session }).exec(); }
  skipStillReferenced(id: Types.ObjectId, token: string, now: Date, session?: ClientSession) { return ProfileMediaCleanupJob.findOneAndUpdate({ _id: id, status: "RUNNING", leaseToken: token }, { $set: { status: "SKIPPED_STILL_REFERENCED", completedAt: now }, $unset: { leaseToken: 1, leaseExpiresAt: 1 } }, { new: true, session }).exec(); }

  async scheduleRetry(id: Types.ObjectId, token: string, next: Date, code: string, message?: string, session?: ClientSession) {
    const retry = await ProfileMediaCleanupJob.findOneAndUpdate({ _id: id, status: "RUNNING", leaseToken: token, $expr: { $lt: ["$attemptCount", "$maxRetryCount"] } }, { $set: { status: "RETRY_WAIT", nextAttemptAt: next, ...failure(code, message) }, $unset: { leaseToken: 1, leaseExpiresAt: 1 } }, { new: true, session }).exec();
    if (retry) return retry;
    return ProfileMediaCleanupJob.findOneAndUpdate({ _id: id, status: "RUNNING", leaseToken: token, $expr: { $gte: ["$attemptCount", "$maxRetryCount"] } }, { $set: { status: "FAILED", completedAt: new Date(), ...failure(code, message) }, $unset: { leaseToken: 1, leaseExpiresAt: 1 } }, { new: true, session }).exec();
  }

  markUnknown(id: Types.ObjectId, token: string, now: Date, code: string, message?: string, session?: ClientSession) { return ProfileMediaCleanupJob.findOneAndUpdate({ _id: id, status: "RUNNING", leaseToken: token }, { $set: { status: "DELETE_UNKNOWN", completedAt: now, ...failure(code, message) }, $unset: { leaseToken: 1, leaseExpiresAt: 1 } }, { new: true, session }).exec(); }
  recoverExpired(now: Date) { return ProfileMediaCleanupJob.updateMany({ status: "RUNNING", leaseExpiresAt: { $lte: now }, $expr: { $lt: ["$attemptCount", "$maxRetryCount"] } }, { $set: { status: "RETRY_WAIT", nextAttemptAt: now }, $unset: { leaseToken: 1, leaseExpiresAt: 1 } }).exec(); }
  listFailed() { return ProfileMediaCleanupJob.find({ status: { $in: ["FAILED", "DELETE_UNKNOWN"] } }).exec(); }
}

export const profileMediaCleanupJobRepository = new ProfileMediaCleanupJobRepository();
