"use strict";
// backend/src/repositories/refund.repository.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.refundRepository = exports.RefundRepository = void 0;
const refund_model_1 = require("../models/refund.model");
class RefundRepository {
    async create(data) {
        return refund_model_1.Refund.create(data);
    }
    async findById(id) {
        return refund_model_1.Refund.findById(id).exec();
    }
    async findByRefundReference(refundReference) {
        return refund_model_1.Refund.findOne({ refundReference }).exec();
    }
    async findByPaymentId(paymentId) {
        return refund_model_1.Refund.find({ paymentId }).sort({ createdAt: -1 }).exec();
    }
    async findByBookingId(bookingId) {
        return refund_model_1.Refund.find({ bookingId }).sort({ createdAt: -1 }).exec();
    }
    async findByUserId(userId) {
        return refund_model_1.Refund.find({ userId }).sort({ createdAt: -1 }).exec();
    }
    async findByCreatorId(creatorId) {
        return refund_model_1.Refund.find({ creatorId }).sort({ createdAt: -1 }).exec();
    }
    async findByProviderRefundId(providerRefundId) {
        return refund_model_1.Refund.findOne({ providerRefundId }).exec();
    }
    async findByIdempotencyKey(idempotencyKey) {
        return refund_model_1.Refund.findOne({ idempotencyKey }).exec();
    }
    async findOne(filter) {
        return refund_model_1.Refund.findOne(filter).exec();
    }
    async findMany(filter) {
        return refund_model_1.Refund.find(filter).sort({ createdAt: -1 }).exec();
    }
    async updateById(id, update) {
        return refund_model_1.Refund.findByIdAndUpdate(id, update, {
            new: true,
            runValidators: true,
        }).exec();
    }
    async updateOne(filter, update) {
        return refund_model_1.Refund.findOneAndUpdate(filter, update, {
            new: true,
            runValidators: true,
        }).exec();
    }
    async exists(filter) {
        const result = await refund_model_1.Refund.exists(filter);
        return result !== null;
    }
    async count(filter = {}) {
        return refund_model_1.Refund.countDocuments(filter).exec();
    }
    async deleteById(id) {
        return refund_model_1.Refund.findByIdAndDelete(id).exec();
    }
}
exports.RefundRepository = RefundRepository;
exports.refundRepository = new RefundRepository();
