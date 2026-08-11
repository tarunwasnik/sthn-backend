"use strict";
// backend/src/repositories/internalProvider/internalSettlement.repository.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalSettlementRepository = void 0;
const internalSettlement_model_1 = __importDefault(require("../../models/internalProvider/internalSettlement.model"));
class InternalSettlementRepository {
    /**
     * Create a provider settlement.
     */
    async create(data) {
        return internalSettlement_model_1.default.create(data);
    }
    /**
     * Find by Mongo id.
     */
    async findById(id) {
        return internalSettlement_model_1.default.findById(id);
    }
    /**
     * Find by Financial Domain settlement.
     */
    async findBySettlementId(settlementId) {
        return internalSettlement_model_1.default.findOne({
            settlementId,
        });
    }
    /**
     * Find by provider settlement id.
     */
    async findByProviderSettlementId(providerSettlementId) {
        return internalSettlement_model_1.default.findOne({
            providerSettlementId,
        });
    }
    /**
     * Find by provider payment id.
     */
    async findByProviderPaymentId(providerPaymentId) {
        return internalSettlement_model_1.default.findOne({
            providerPaymentId,
        });
    }
    /**
     * Find by idempotency key.
     */
    async findByIdempotencyKey(idempotencyKey) {
        return internalSettlement_model_1.default.findOne({
            idempotencyKey,
        });
    }
    /**
     * Find using an arbitrary filter.
     */
    async findOne(filter) {
        return internalSettlement_model_1.default.findOne(filter);
    }
    /**
     * Find multiple provider settlements.
     */
    async findMany(filter = {}) {
        return internalSettlement_model_1.default.find(filter);
    }
    /**
     * Count provider settlements.
     */
    async count(filter = {}) {
        return internalSettlement_model_1.default.countDocuments(filter);
    }
    /**
     * Update a provider settlement by id.
     */
    async updateById(id, update) {
        return internalSettlement_model_1.default.findByIdAndUpdate(id, update, {
            new: true,
            runValidators: true,
        });
    }
    /**
     * Update a provider settlement using a filter.
     */
    async updateOne(filter, update) {
        return internalSettlement_model_1.default.findOneAndUpdate(filter, update, {
            new: true,
            runValidators: true,
        });
    }
    /**
     * Check whether a provider settlement exists.
     */
    async exists(filter) {
        const document = await internalSettlement_model_1.default.exists(filter);
        return document !== null;
    }
}
exports.InternalSettlementRepository = InternalSettlementRepository;
exports.default = new InternalSettlementRepository();
