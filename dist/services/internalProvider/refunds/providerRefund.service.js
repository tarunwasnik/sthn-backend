"use strict";
// backend/src/services/internalProvider/refunds/providerRefund.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderRefundService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const internalRefund_repository_1 = __importDefault(require("../../../repositories/internalProvider/internalRefund.repository"));
const internalProvider_1 = require("../../../constants/internalProvider");
const providerClock_service_1 = __importDefault(require("../base/providerClock.service"));
const providerEvent_service_1 = __importDefault(require("../events/providerEvent.service"));
/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Refund Service
 * ------------------------------------------------------------------
 *
 * Responsible for managing the lifecycle of simulated provider
 * refunds.
 *
 * Every refund lifecycle transition records an immutable provider
 * event.
 *
 * This service owns ONLY provider refund execution state.
 *
 * Financial ownership remains with the Financial Domain.
 * ------------------------------------------------------------------
 */
class ProviderRefundService {
    /**
     * -------------------------------------------------------------
     * Records an immutable refund provider event.
     * -------------------------------------------------------------
     */
    async recordRefundEvent(refund, eventType, operation, session) {
        await providerEvent_service_1.default.recordEvent({
            entityType: internalProvider_1.ProviderEntityType.REFUND,
            entityId: refund._id,
            eventType,
            operation,
            transitionKey: `internal-refund:${refund.providerRefundId}:${operation}`,
            providerEntityId: refund.providerRefundId,
            providerPaymentId: refund.providerPaymentId,
            providerReference: refund.providerReference ?? undefined,
            providerMetadata: refund.providerMetadata,
            execution: refund.execution,
            audit: refund.audit,
            payloads: refund.payloads,
        }, session);
    }
    /**
     * -------------------------------------------------------------
     * Creates a provider refund.
     * -------------------------------------------------------------
     */
    async createRefund(data) {
        const session = await mongoose_1.default.startSession();
        let created = null;
        try {
            await session.withTransaction(async () => {
                const refund = await internalRefund_repository_1.default.create({ ...data, status: internalProvider_1.ProviderRefundStatus.CREATED, isTerminal: false }, session);
                await this.recordRefundEvent(refund, internalProvider_1.ProviderEventType.REFUND_CREATED, internalProvider_1.ProviderOperation.CREATE_REFUND, session);
                created = refund;
            });
        }
        finally {
            await session.endSession();
        }
        if (!created)
            throw new Error("Provider refund creation did not complete.");
        return created;
    }
    async transition(refundId, expectedStatus, update, eventType, operation) {
        const session = await mongoose_1.default.startSession();
        let result = null;
        try {
            await session.withTransaction(async () => {
                const current = await internalRefund_repository_1.default.findById(refundId);
                if (!current)
                    return;
                if (current.status === internalProvider_1.ProviderRefundStatus.REFUNDED && eventType === internalProvider_1.ProviderEventType.REFUND_COMPLETED) {
                    result = current;
                    return;
                }
                if (current.status === internalProvider_1.ProviderRefundStatus.PROCESSING && eventType === internalProvider_1.ProviderEventType.REFUND_PROCESSING) {
                    result = current;
                    return;
                }
                result = await internalRefund_repository_1.default.updateOne({ _id: current._id, status: expectedStatus, isTerminal: false }, update, session);
                if (!result)
                    return;
                await this.recordRefundEvent(result, eventType, operation, session);
            });
        }
        finally {
            await session.endSession();
        }
        return result;
    }
    /**
     * -------------------------------------------------------------
     * Marks refund as processing.
     * -------------------------------------------------------------
     */
    async processRefund(refundId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderRefundStatus.PROCESSING,
            processingStartedAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const refund = await this.transition(refundId, internalProvider_1.ProviderRefundStatus.CREATED, update, internalProvider_1.ProviderEventType.REFUND_PROCESSING, internalProvider_1.ProviderOperation.PROCESS_REFUND);
        if (!refund) {
            return null;
        }
        return refund;
    }
    /**
     * -------------------------------------------------------------
     * Marks refund as completed.
     * -------------------------------------------------------------
     */
    async completeRefund(refundId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderRefundStatus.REFUNDED,
            isTerminal: true,
            completedAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const refund = await this.transition(refundId, internalProvider_1.ProviderRefundStatus.PROCESSING, update, internalProvider_1.ProviderEventType.REFUND_COMPLETED, internalProvider_1.ProviderOperation.COMPLETE_REFUND);
        if (!refund) {
            return null;
        }
        return refund;
    }
    /**
     * -------------------------------------------------------------
     * Marks refund as partially refunded.
     * -------------------------------------------------------------
     */
    async partiallyRefund(refundId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderRefundStatus.PARTIALLY_REFUNDED,
            "audit.lastStatusChangedAt": now,
        };
        const refund = await internalRefund_repository_1.default.updateById(refundId, update);
        if (!refund) {
            return null;
        }
        await this.recordRefundEvent(refund, internalProvider_1.ProviderEventType.REFUND_PARTIALLY_COMPLETED, internalProvider_1.ProviderOperation.PARTIAL_REFUND);
        return refund;
    }
    /**
     * -------------------------------------------------------------
     * Marks refund as failed.
     * -------------------------------------------------------------
     */
    async failRefund(refundId, reason) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderRefundStatus.FAILED,
            failureReason: reason,
            isTerminal: true,
            failedAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const refund = await internalRefund_repository_1.default.updateById(refundId, update);
        if (!refund) {
            return null;
        }
        await this.recordRefundEvent(refund, internalProvider_1.ProviderEventType.REFUND_FAILED, internalProvider_1.ProviderOperation.FAIL_REFUND);
        return refund;
    }
    /**
     * -------------------------------------------------------------
     * Cancels a provider refund.
     * -------------------------------------------------------------
     */
    async cancelRefund(refundId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderRefundStatus.CANCELLED,
            isTerminal: true,
            cancelledAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const refund = await internalRefund_repository_1.default.updateById(refundId, update);
        if (!refund) {
            return null;
        }
        await this.recordRefundEvent(refund, internalProvider_1.ProviderEventType.REFUND_CANCELLED, internalProvider_1.ProviderOperation.CANCEL_REFUND);
        return refund;
    }
    /**
     * -------------------------------------------------------------
     * Marks refund as expired.
     * -------------------------------------------------------------
     */
    async expireRefund(refundId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderRefundStatus.EXPIRED,
            isTerminal: true,
            expiredAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const refund = await internalRefund_repository_1.default.updateById(refundId, update);
        if (!refund) {
            return null;
        }
        await this.recordRefundEvent(refund, internalProvider_1.ProviderEventType.REFUND_EXPIRED, internalProvider_1.ProviderOperation.EXPIRE_REFUND);
        return refund;
    }
    /**
     * -------------------------------------------------------------
     * Finds a provider refund by Mongo id.
     * -------------------------------------------------------------
     */
    async findById(refundId) {
        return internalRefund_repository_1.default.findById(refundId);
    }
    /**
     * -------------------------------------------------------------
     * Finds a provider refund using the Financial Domain refund id.
     * -------------------------------------------------------------
     */
    async findByRefundId(refundId) {
        return internalRefund_repository_1.default.findByRefundId(refundId);
    }
    /**
     * -------------------------------------------------------------
     * Finds a provider refund using the provider refund id.
     * -------------------------------------------------------------
     */
    async findByProviderRefundId(providerRefundId) {
        return internalRefund_repository_1.default.findByProviderRefundId(providerRefundId);
    }
    /**
     * -------------------------------------------------------------
     * Finds provider refunds using the provider payment id.
     * -------------------------------------------------------------
     */
    async findByProviderPaymentId(providerPaymentId) {
        return internalRefund_repository_1.default.findByProviderPaymentId(providerPaymentId);
    }
    /**
     * -------------------------------------------------------------
     * Finds a provider refund using the idempotency key.
     * -------------------------------------------------------------
     */
    async findByIdempotencyKey(idempotencyKey) {
        return internalRefund_repository_1.default.findByIdempotencyKey(idempotencyKey);
    }
    async findByIdempotencyKeyForReplay(idempotencyKey) {
        return internalRefund_repository_1.default.findByIdempotencyKeyForReplay(idempotencyKey);
    }
}
exports.ProviderRefundService = ProviderRefundService;
exports.default = new ProviderRefundService();
