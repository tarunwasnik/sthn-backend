"use strict";
// backend/src/repositories/internalProvider/internalRefund.repository.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalRefundRepository = void 0;
const internalRefund_model_1 = __importDefault(require("../../models/internalProvider/internalRefund.model"));
class InternalRefundRepository {
    /**
     * Create a provider refund.
     */
    async create(data, session) {
        if (!session)
            return internalRefund_model_1.default.create(data);
        const [refund] = await internalRefund_model_1.default.create([data], { session });
        return refund;
    }
    /**
     * Find by Mongo id.
     */
    async findById(id) {
        return internalRefund_model_1.default.findById(id);
    }
    /**
     * Find by Financial Domain refund.
     */
    async findByRefundId(refundId) {
        return internalRefund_model_1.default.findOne({
            refundId,
        });
    }
    /**
     * Find by provider refund id.
     */
    async findByProviderRefundId(providerRefundId) {
        return internalRefund_model_1.default.findOne({
            providerRefundId,
        });
    }
    /**
     * Find by provider payment id.
     */
    async findByProviderPaymentId(providerPaymentId) {
        return internalRefund_model_1.default.findOne({
            providerPaymentId,
        });
    }
    /**
     * Find by idempotency key.
     */
    async findByIdempotencyKey(idempotencyKey) {
        return internalRefund_model_1.default.findOne({
            idempotencyKey,
        });
    }
    async findByIdempotencyKeyForReplay(idempotencyKey) {
        return internalRefund_model_1.default.findOne({ idempotencyKey }).select("+requestFingerprint").exec();
    }
    /**
     * Find using an arbitrary filter.
     */
    async findOne(filter) {
        return internalRefund_model_1.default.findOne(filter);
    }
    /**
     * Find multiple provider refunds.
     */
    async findMany(filter = {}) {
        return internalRefund_model_1.default.find(filter);
    }
    /**
     * Count provider refunds.
     */
    async count(filter = {}) {
        return internalRefund_model_1.default.countDocuments(filter);
    }
    /**
     * Update a provider refund by id.
     */
    async updateById(id, update, session) {
        return internalRefund_model_1.default.findByIdAndUpdate(id, update, {
            new: true,
            runValidators: true, session,
        });
    }
    /**
     * Update a provider refund using a filter.
     */
    async updateOne(filter, update, session) {
        return internalRefund_model_1.default.findOneAndUpdate(filter, update, {
            new: true,
            runValidators: true, session,
        });
    }
    /**
     * Check whether a provider refund exists.
     */
    async exists(filter) {
        const document = await internalRefund_model_1.default.exists(filter);
        return document !== null;
    }
}
exports.InternalRefundRepository = InternalRefundRepository;
exports.default = new InternalRefundRepository();
