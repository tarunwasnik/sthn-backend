"use strict";
// backend/src/repositories/internalProvider/internalPayment.repository.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalPaymentRepository = void 0;
const internalPayment_model_1 = __importDefault(require("../../models/internalProvider/internalPayment.model"));
class InternalPaymentRepository {
    /**
     * Create a provider payment.
     */
    async create(data, session) {
        if (!session)
            return internalPayment_model_1.default.create(data);
        const [payment] = await internalPayment_model_1.default.create([data], { session });
        return payment;
    }
    /**
     * Find by Mongo id.
     */
    async findById(id, session) {
        return internalPayment_model_1.default.findById(id).session(session ?? null);
    }
    /**
     * Find by Financial Domain payment.
     */
    async findByPaymentId(paymentId) {
        return internalPayment_model_1.default.findOne({
            paymentId,
        });
    }
    /**
     * Find by provider payment id.
     */
    async findByProviderPaymentId(providerPaymentId) {
        return internalPayment_model_1.default.findOne({
            providerPaymentId,
        });
    }
    /**
     * Find by provider transaction id.
     */
    async findByProviderTransactionId(providerTransactionId) {
        return internalPayment_model_1.default.findOne({
            providerTransactionId,
        });
    }
    /**
     * Find by idempotency key.
     */
    async findByIdempotencyKey(idempotencyKey) {
        return internalPayment_model_1.default.findOne({
            idempotencyKey,
        });
    }
    /** Read the hidden replay fingerprint only for creation consistency checks. */
    async findByIdempotencyKeyForReplay(idempotencyKey) {
        return internalPayment_model_1.default.findOne({ idempotencyKey })
            .select("+requestFingerprint")
            .exec();
    }
    /**
     * Find using an arbitrary filter.
     */
    async findOne(filter) {
        return internalPayment_model_1.default.findOne(filter);
    }
    /**
     * Find multiple provider payments.
     */
    async findMany(filter = {}) {
        return internalPayment_model_1.default.find(filter);
    }
    /**
     * Count provider payments.
     */
    async count(filter = {}) {
        return internalPayment_model_1.default.countDocuments(filter);
    }
    /**
     * Update a provider payment using a filter.
     */
    async updateOne(filter, update, session) {
        return internalPayment_model_1.default.findOneAndUpdate(filter, update, {
            new: true,
            runValidators: true,
            session,
        });
    }
    /**
     * Check whether a provider payment exists.
     */
    async exists(filter) {
        const document = await internalPayment_model_1.default.exists(filter);
        return document !== null;
    }
    /**
     * Find provider payments with pagination.
     */
    async paginate(filter, page, limit) {
        const skip = (page - 1) * limit;
        return internalPayment_model_1.default.find(filter).skip(skip).limit(limit);
    }
}
exports.InternalPaymentRepository = InternalPaymentRepository;
exports.default = new InternalPaymentRepository();
