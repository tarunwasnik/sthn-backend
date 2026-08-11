"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawalRepository = exports.WithdrawalRepository = void 0;
const withdrawal_model_1 = require("../models/withdrawal.model");
class WithdrawalRepository {
    async create(data, session) {
        if (!session) {
            return withdrawal_model_1.Withdrawal.create(data);
        }
        const [withdrawal] = await withdrawal_model_1.Withdrawal.create([data], { session });
        return withdrawal;
    }
    async findById(id, session) {
        return withdrawal_model_1.Withdrawal.findById(id).session(session ?? null).exec();
    }
    async findByIdForPayoutExecution(id) {
        return withdrawal_model_1.Withdrawal.findById(id)
            .select("_id withdrawalReference creatorId status payoutId payoutDestinationId destinationSnapshot +destinationSnapshot.encryptedPayload")
            .exec();
    }
    async findByReference(withdrawalReference) {
        return withdrawal_model_1.Withdrawal.findOne({ withdrawalReference }).exec();
    }
    async findByIdempotencyKey(idempotencyKey, session) {
        return withdrawal_model_1.Withdrawal.findOne({ idempotencyKey })
            .session(session ?? null)
            .exec();
    }
    async findActiveByCreator(creatorId, session) {
        return withdrawal_model_1.Withdrawal.findOne({ creatorId, isActiveObligation: true }).session(session ?? null).exec();
    }
    async findByReferenceForCreator(withdrawalReference, creatorId) { return withdrawal_model_1.Withdrawal.findOne({ withdrawalReference, creatorId }).exec(); }
    async listByCreator(creatorId, page, limit, status) { return withdrawal_model_1.Withdrawal.find({ creatorId, ...(status ? { status } : {}) }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).exec(); }
    async updateById(id, update, session) {
        return withdrawal_model_1.Withdrawal.findByIdAndUpdate(id, update, {
            new: true,
            runValidators: true,
            session,
        }).exec();
    }
}
exports.WithdrawalRepository = WithdrawalRepository;
exports.withdrawalRepository = new WithdrawalRepository();
