"use strict";
// backend/src/repositories/internalProvider/internalWebhook.repository.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalWebhookRepository = void 0;
const internalWebhook_model_1 = __importDefault(require("../../models/internalProvider/internalWebhook.model"));
class InternalWebhookRepository {
    /**
     * Create a provider webhook.
     */
    async create(data) {
        return internalWebhook_model_1.default.create(data);
    }
    /**
     * Find by Mongo id.
     */
    async findById(id) {
        return internalWebhook_model_1.default.findById(id);
    }
    /**
     * Find by provider webhook id.
     */
    async findByProviderWebhookId(providerWebhookId) {
        return internalWebhook_model_1.default.findOne({
            providerWebhookId,
        });
    }
    /**
     * Find by provider entity id.
     */
    async findByProviderEntityId(providerEntityId) {
        return internalWebhook_model_1.default.findOne({
            providerEntityId,
        });
    }
    /**
     * Find by provider payment id.
     */
    async findByProviderPaymentId(providerPaymentId) {
        return internalWebhook_model_1.default.findOne({
            providerPaymentId,
        });
    }
    /**
     * Find by idempotency key.
     */
    async findByIdempotencyKey(idempotencyKey) {
        return internalWebhook_model_1.default.findOne({
            idempotencyKey,
        });
    }
    /**
     * Find using an arbitrary filter.
     */
    async findOne(filter) {
        return internalWebhook_model_1.default.findOne(filter);
    }
    /**
     * Find multiple provider webhooks.
     */
    async findMany(filter = {}) {
        return internalWebhook_model_1.default.find(filter);
    }
    /**
     * Count provider webhooks.
     */
    async count(filter = {}) {
        return internalWebhook_model_1.default.countDocuments(filter);
    }
    /**
     * Update a provider webhook by id.
     */
    async updateById(id, update) {
        return internalWebhook_model_1.default.findByIdAndUpdate(id, update, {
            new: true,
            runValidators: true,
        });
    }
    /**
     * Update a provider webhook using a filter.
     */
    async updateOne(filter, update) {
        return internalWebhook_model_1.default.findOneAndUpdate(filter, update, {
            new: true,
            runValidators: true,
        });
    }
    /**
     * Check whether a provider webhook exists.
     */
    async exists(filter) {
        const document = await internalWebhook_model_1.default.exists(filter);
        return document !== null;
    }
}
exports.InternalWebhookRepository = InternalWebhookRepository;
exports.default = new InternalWebhookRepository();
