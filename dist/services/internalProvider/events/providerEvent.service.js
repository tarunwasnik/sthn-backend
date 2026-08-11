"use strict";
//backend/src/services/internalProvider/events/providerEvent.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderEventService = void 0;
const internalProviderEvent_repository_1 = __importDefault(require("../../../repositories/internalProvider/internalProviderEvent.repository"));
const providerClock_service_1 = __importDefault(require("../base/providerClock.service"));
/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Event Service
 * ------------------------------------------------------------------
 *
 * Responsible for creating immutable provider audit events.
 *
 * Every provider operation should record an event through this service.
 *
 * This service is append-only.
 * Existing events are never modified.
 * ------------------------------------------------------------------
 */
class ProviderEventService {
    /**
     * Record a provider event.
     */
    async recordEvent(params, session) {
        return internalProviderEvent_repository_1.default.create({
            entityType: params.entityType,
            entityId: params.entityId,
            eventType: params.eventType,
            operation: params.operation,
            transitionKey: params.transitionKey,
            providerEntityId: params.providerEntityId,
            providerPaymentId: params.providerPaymentId,
            providerReference: params.providerReference,
            providerMetadata: params.providerMetadata,
            execution: params.execution,
            audit: params.audit,
            payloads: {
                request: params.payloads?.request ?? null,
                response: params.payloads?.response ?? null,
            },
            occurredAt: params.occurredAt ?? providerClock_service_1.default.now(),
        }, session);
    }
    /**
     * Find an event by Mongo id.
     */
    async findById(id) {
        return internalProviderEvent_repository_1.default.findById(id);
    }
    /**
     * Retrieve the timeline for a provider entity.
     */
    async getEntityTimeline(entityType, entityId) {
        return internalProviderEvent_repository_1.default.findByEntity(entityType, entityId);
    }
    /**
     * Retrieve provider events using the provider entity id.
     */
    async getProviderTimeline(providerEntityId) {
        return internalProviderEvent_repository_1.default.findByProviderEntityId(providerEntityId);
    }
    /**
     * Retrieve all events belonging to a provider payment.
     */
    async getPaymentTimeline(providerPaymentId) {
        return internalProviderEvent_repository_1.default.findByProviderPaymentId(providerPaymentId);
    }
    /**
     * Retrieve events by type.
     */
    async getByEventType(eventType) {
        return internalProviderEvent_repository_1.default.findByEventType(eventType);
    }
    /**
     * Retrieve events by operation.
     */
    async getByOperation(operation) {
        return internalProviderEvent_repository_1.default.findByOperation(operation);
    }
}
exports.ProviderEventService = ProviderEventService;
exports.default = new ProviderEventService();
