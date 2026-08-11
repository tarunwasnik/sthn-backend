"use strict";
// backend/src/repositories/payout.repository.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.payoutRepository = exports.PayoutRepository = void 0;
const payout_model_1 = require("../models/payout.model");
class PayoutRepository {
    async create(data, session) {
        if (!session) {
            return payout_model_1.Payout.create(data);
        }
        const [payout] = await payout_model_1.Payout.create([data], { session });
        return payout;
    }
    async findById(id, session) {
        return payout_model_1.Payout.findById(id).session(session ?? null).exec();
    }
    async findByPayoutReference(payoutReference) {
        return payout_model_1.Payout.findOne({ payoutReference }).exec();
    }
    async findByCreatorId(creatorId) {
        return payout_model_1.Payout.find({ creatorId }).sort({ createdAt: -1 }).exec();
    }
    async findBySettlementId(settlementId) {
        return payout_model_1.Payout.find({ settlementId }).sort({ createdAt: -1 }).exec();
    }
    async findByBookingId(bookingId) {
        return payout_model_1.Payout.find({ bookingId }).sort({ createdAt: -1 }).exec();
    }
    async findByPaymentId(paymentId) {
        return payout_model_1.Payout.find({ paymentId }).sort({ createdAt: -1 }).exec();
    }
    async findByWithdrawalId(withdrawalId, session) {
        return payout_model_1.Payout.findOne({ withdrawalId })
            .session(session ?? null)
            .exec();
    }
    async findByProviderPayoutId(providerPayoutId) {
        return payout_model_1.Payout.findOne({
            providerPayoutId,
        }).exec();
    }
    async findByProviderTransferId(providerTransferId) {
        return payout_model_1.Payout.findOne({
            providerTransferId,
        }).exec();
    }
    async findByBeneficiaryId(beneficiaryId) {
        return payout_model_1.Payout.findOne({
            beneficiaryId,
        }).exec();
    }
    async findByIdempotencyKey(idempotencyKey) {
        return payout_model_1.Payout.findOne({
            idempotencyKey,
        }).exec();
    }
    async findOne(filter) {
        return payout_model_1.Payout.findOne(filter).exec();
    }
    async findMany(filter) {
        return payout_model_1.Payout.find(filter).sort({ createdAt: -1 }).exec();
    }
    async updateById(id, update, session) {
        return payout_model_1.Payout.findByIdAndUpdate(id, update, {
            new: true,
            runValidators: true,
            session,
        }).exec();
    }
    async updateOne(filter, update) {
        return payout_model_1.Payout.findOneAndUpdate(filter, update, {
            new: true,
            runValidators: true,
        }).exec();
    }
    async exists(filter) {
        const result = await payout_model_1.Payout.exists(filter);
        return result !== null;
    }
    async count(filter = {}) {
        return payout_model_1.Payout.countDocuments(filter).exec();
    }
    async deleteById(id) {
        return payout_model_1.Payout.findByIdAndDelete(id).exec();
    }
}
exports.PayoutRepository = PayoutRepository;
exports.payoutRepository = new PayoutRepository();
