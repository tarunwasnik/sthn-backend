"use strict";
// backend/src/repositories/internalProvider/internalProviderEvent.repository.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalProviderEventRepository = void 0;
const internalProviderEvent_model_1 = __importDefault(require("../../models/internalProvider/internalProviderEvent.model"));
class InternalProviderEventRepository {
    /**
     * Create a provider event.
     */
    async create(data, session) {
        const event = new internalProviderEvent_model_1.default(data);
        return event.save({ session });
    }
    /**
     * Find by Mongo id.
     */
    async findById(id) {
        return internalProviderEvent_model_1.default.findById(id);
    }
    /**
     * Find provider events by provider entity id.
     */
    async findByProviderEntityId(providerEntityId) {
        return internalProviderEvent_model_1.default.find({
            providerEntityId,
        }).sort({
            occurredAt: -1,
        });
    }
    /**
     * Find provider events by provider payment id.
     */
    async findByProviderPaymentId(providerPaymentId) {
        return internalProviderEvent_model_1.default.find({
            providerPaymentId,
        }).sort({
            occurredAt: -1,
        });
    }
    /**
     * Find provider events for an Internal Provider entity.
     */
    async findByEntity(entityType, entityId) {
        return internalProviderEvent_model_1.default.find({
            entityType,
            entityId,
        }).sort({
            occurredAt: -1,
        });
    }
    /**
     * Find provider events by event type.
     */
    async findByEventType(eventType) {
        return internalProviderEvent_model_1.default.find({
            eventType,
        }).sort({
            occurredAt: -1,
        });
    }
    /**
     * Find provider events by operation.
     */
    async findByOperation(operation) {
        return internalProviderEvent_model_1.default.find({
            operation,
        }).sort({
            occurredAt: -1,
        });
    }
    /**
     * Find using an arbitrary filter.
     */
    async findOne(filter) {
        return internalProviderEvent_model_1.default.findOne(filter);
    }
    /**
     * Find multiple provider events.
     */
    async findMany(filter = {}, session) {
        return internalProviderEvent_model_1.default.find(filter).session(session ?? null);
    }
    /**
     * Count provider events.
     */
    async count(filter = {}) {
        return internalProviderEvent_model_1.default.countDocuments(filter);
    }
    /**
     * Check whether a provider event exists.
     */
    async exists(filter) {
        const document = await internalProviderEvent_model_1.default.exists(filter);
        return document !== null;
    }
}
exports.InternalProviderEventRepository = InternalProviderEventRepository;
exports.default = new InternalProviderEventRepository();
