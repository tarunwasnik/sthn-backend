"use strict";
// backend/src/repositories/settlement.repository.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.settlementRepository = exports.SettlementRepository = void 0;
const settlement_model_1 = require("../models/settlement.model");
class SettlementRepository {
    async create(data, session) {
        if (!session)
            return settlement_model_1.Settlement.create(data);
        return new settlement_model_1.Settlement(data).save({ session });
    }
    async findById(id) {
        return settlement_model_1.Settlement.findById(id).exec();
    }
    async findBySettlementReference(settlementReference) {
        return settlement_model_1.Settlement.findOne({ settlementReference }).exec();
    }
    async findByBookingId(bookingId) {
        return settlement_model_1.Settlement.find({ bookingId }).sort({ createdAt: -1 }).exec();
    }
    async findByPaymentId(paymentId, session) {
        return settlement_model_1.Settlement.find({ paymentId })
            .sort({ createdAt: -1 })
            .session(session ?? null)
            .exec();
    }
    async findByUserId(userId) {
        return settlement_model_1.Settlement.find({ userId }).sort({ createdAt: -1 }).exec();
    }
    async findByCreatorId(creatorId) {
        return settlement_model_1.Settlement.find({ creatorId }).sort({ createdAt: -1 }).exec();
    }
    async findByProviderSettlementId(providerSettlementId) {
        return settlement_model_1.Settlement.findOne({
            providerSettlementId,
        }).exec();
    }
    async findByProviderBatchId(providerBatchId) {
        return settlement_model_1.Settlement.findOne({
            providerBatchId,
        }).exec();
    }
    async findByProviderTransactionId(providerTransactionId) {
        return settlement_model_1.Settlement.findOne({
            providerTransactionId,
        }).exec();
    }
    async findByIdempotencyKey(idempotencyKey) {
        return settlement_model_1.Settlement.findOne({
            idempotencyKey,
        }).exec();
    }
    async findByFinancialObligationKey(financialObligationKey, session) {
        return settlement_model_1.Settlement.findOne({ financialObligationKey }).session(session ?? null).exec();
    }
    async findOne(filter) {
        return settlement_model_1.Settlement.findOne(filter).exec();
    }
    async findMany(filter) {
        return settlement_model_1.Settlement.find(filter).sort({ createdAt: -1 }).exec();
    }
    async updateById(id, update, session) {
        return settlement_model_1.Settlement.findByIdAndUpdate(id, update, {
            new: true,
            runValidators: true,
            session,
        }).exec();
    }
    async updateOne(filter, update) {
        return settlement_model_1.Settlement.findOneAndUpdate(filter, update, {
            new: true,
            runValidators: true,
        }).exec();
    }
    async exists(filter) {
        const result = await settlement_model_1.Settlement.exists(filter);
        return result !== null;
    }
    async count(filter = {}) {
        return settlement_model_1.Settlement.countDocuments(filter).exec();
    }
    async deleteById(id) {
        return settlement_model_1.Settlement.findByIdAndDelete(id).exec();
    }
}
exports.SettlementRepository = SettlementRepository;
exports.settlementRepository = new SettlementRepository();
