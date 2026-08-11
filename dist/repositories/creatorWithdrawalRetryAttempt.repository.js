"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.creatorWithdrawalRetryAttemptRepository = exports.CreatorWithdrawalRetryAttemptRepository = void 0;
const creatorWithdrawalRetryAttempt_model_1 = require("../models/creatorWithdrawalRetryAttempt.model");
class CreatorWithdrawalRetryAttemptRepository {
    findByKey(key, session) {
        return creatorWithdrawalRetryAttempt_model_1.CreatorWithdrawalRetryAttempt.findOne({ attemptKey: key })
            .select("+attemptKey +snapshotFingerprint +actorId +withdrawalRequestId")
            .session(session ?? null).exec();
    }
    create(data, session) {
        return creatorWithdrawalRetryAttempt_model_1.CreatorWithdrawalRetryAttempt.create([{ ...data, status: "STARTED" }], { session }).then(([record]) => record);
    }
    complete(key, status, code, completedAt, nextRetryAt, session) {
        return creatorWithdrawalRetryAttempt_model_1.CreatorWithdrawalRetryAttempt.findOneAndUpdate({
            attemptKey: key, status: "STARTED",
        }, { $set: { status, safeErrorCode: code, completedAt,
                ...(nextRetryAt ? { nextRetryAt } : {}) } }, { new: true, runValidators: true, session }).select("+attemptKey").exec();
    }
}
exports.CreatorWithdrawalRetryAttemptRepository = CreatorWithdrawalRetryAttemptRepository;
exports.creatorWithdrawalRetryAttemptRepository = new CreatorWithdrawalRetryAttemptRepository();
