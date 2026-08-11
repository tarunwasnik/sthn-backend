"use strict";
// backend/src/repositories/internalProvider/internalPayout.repository.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalPayoutRepository = void 0;
const internalPayout_model_1 = __importDefault(require("../../models/internalProvider/internalPayout.model"));
class InternalPayoutRepository {
    /**
     * Create a provider payout.
     */
    async create(data, session) {
        if (!session)
            return internalPayout_model_1.default.create(data);
        const [payout] = await internalPayout_model_1.default.create([data], { session });
        return payout;
    }
    /**
     * Find by Mongo id.
     */
    async findById(id) {
        return internalPayout_model_1.default.findById(id);
    }
    /**
     * Find by Financial Domain payout.
     */
    async findByPayoutId(payoutId) {
        return internalPayout_model_1.default.findOne({
            payoutId,
        });
    }
    /**
     * Find by provider payout id.
     */
    async findByProviderPayoutId(providerPayoutId, session) {
        return internalPayout_model_1.default.findOne({
            providerPayoutId,
        }).session(session ?? null);
    }
    /**
     * Find by provider settlement id.
     */
    async findByProviderSettlementId(providerSettlementId) {
        return internalPayout_model_1.default.findOne({
            providerSettlementId,
        });
    }
    /**
     * Find by provider payment id.
     */
    async findByProviderPaymentId(providerPaymentId) {
        return internalPayout_model_1.default.findOne({
            providerPaymentId,
        });
    }
    /**
     * Find by idempotency key.
     */
    async findByIdempotencyKey(idempotencyKey) {
        return internalPayout_model_1.default.findOne({
            idempotencyKey,
        });
    }
    async findByIdempotencyKeyForDestinationConsistency(idempotencyKey) {
        return internalPayout_model_1.default.findOne({ idempotencyKey })
            .select("+providerDestination.fingerprint")
            .exec();
    }
    /**
     * Find using an arbitrary filter.
     */
    async findOne(filter) {
        return internalPayout_model_1.default.findOne(filter);
    }
    /**
     * Find multiple provider payouts.
     */
    async findMany(filter = {}) {
        return internalPayout_model_1.default.find(filter);
    }
    /**
     * Count provider payouts.
     */
    async count(filter = {}) {
        return internalPayout_model_1.default.countDocuments(filter);
    }
    /**
     * Update a provider payout by id.
     */
    async updateById(id, update) {
        return internalPayout_model_1.default.findByIdAndUpdate(id, update, {
            new: true,
            runValidators: true,
        });
    }
    /**
     * Update a provider payout using a filter.
     */
    async updateOne(filter, update, session) {
        return internalPayout_model_1.default.findOneAndUpdate(filter, update, {
            new: true,
            runValidators: true,
            session,
        });
    }
    /**
     * Check whether a provider payout exists.
     */
    async exists(filter) {
        const document = await internalPayout_model_1.default.exists(filter);
        return document !== null;
    }
}
exports.InternalPayoutRepository = InternalPayoutRepository;
exports.default = new InternalPayoutRepository();
