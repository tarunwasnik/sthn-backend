import { ClientSession } from "mongoose";
import { CreatorWithdrawalRetryAttempt } from
  "../models/creatorWithdrawalRetryAttempt.model";

export class CreatorWithdrawalRetryAttemptRepository {
  findByKey(key: string, session?: ClientSession) {
    return CreatorWithdrawalRetryAttempt.findOne({ attemptKey: key })
      .select("+attemptKey +snapshotFingerprint +actorId +withdrawalRequestId")
      .session(session ?? null).exec();
  }
  create(data: Record<string, unknown>, session: ClientSession) {
    return CreatorWithdrawalRetryAttempt.create([{ ...data, status: "STARTED" }],
      { session }).then(([record]) => record);
  }
  complete(key: string, status: "APPLIED" | "FAILED", code: string,
    completedAt: Date, nextRetryAt: Date | undefined, session: ClientSession) {
    return CreatorWithdrawalRetryAttempt.findOneAndUpdate({
      attemptKey: key, status: "STARTED",
    }, { $set: { status, safeErrorCode: code, completedAt,
      ...(nextRetryAt ? { nextRetryAt } : {}) } },
    { new: true, runValidators: true, session }).select("+attemptKey").exec();
  }
}
export const creatorWithdrawalRetryAttemptRepository =
  new CreatorWithdrawalRetryAttemptRepository();
