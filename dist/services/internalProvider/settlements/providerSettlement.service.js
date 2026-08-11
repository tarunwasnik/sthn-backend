"use strict";
// backend/src/services/internalProvider/settlements/providerSettlement.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderSettlementService = void 0;
const internalSettlement_repository_1 = __importDefault(require("../../../repositories/internalProvider/internalSettlement.repository"));
const internalProvider_1 = require("../../../constants/internalProvider");
const providerClock_service_1 = __importDefault(require("../base/providerClock.service"));
const providerEvent_service_1 = __importDefault(require("../events/providerEvent.service"));
/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Settlement Service
 * ------------------------------------------------------------------
 *
 * Responsible for managing the lifecycle of simulated provider
 * settlements.
 *
 * Every settlement lifecycle transition records an immutable
 * provider event.
 *
 * This service owns ONLY provider settlement execution state.
 *
 * Financial ownership remains with the Financial Domain.
 * ------------------------------------------------------------------
 */
class ProviderSettlementService {
    /**
     * -------------------------------------------------------------
     * Records an immutable settlement provider event.
     * -------------------------------------------------------------
     */
    async recordSettlementEvent(settlement, eventType, operation) {
        await providerEvent_service_1.default.recordEvent({
            entityType: internalProvider_1.ProviderEntityType.SETTLEMENT,
            entityId: settlement._id,
            eventType,
            operation,
            providerEntityId: settlement.providerSettlementId,
            providerPaymentId: settlement.providerPaymentId,
            providerReference: settlement.providerReference ?? undefined,
            providerMetadata: settlement.providerMetadata,
            execution: settlement.execution,
            audit: settlement.audit,
            payloads: settlement.payloads,
        });
    }
    /**
     * -------------------------------------------------------------
     * Creates a provider settlement.
     * -------------------------------------------------------------
     */
    async createSettlement(data) {
        const settlement = await internalSettlement_repository_1.default.create({
            ...data,
            status: internalProvider_1.ProviderSettlementStatus.CREATED,
            isTerminal: false,
        });
        await this.recordSettlementEvent(settlement, internalProvider_1.ProviderEventType.SETTLEMENT_CREATED, internalProvider_1.ProviderOperation.CREATE_SETTLEMENT);
        return settlement;
    }
    /**
     * -------------------------------------------------------------
     * Marks settlement as scheduled.
     * -------------------------------------------------------------
     */
    async scheduleSettlement(settlementId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderSettlementStatus.SCHEDULED,
            scheduledAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const settlement = await internalSettlement_repository_1.default.updateById(settlementId, update);
        if (!settlement) {
            return null;
        }
        await this.recordSettlementEvent(settlement, internalProvider_1.ProviderEventType.SETTLEMENT_SCHEDULED, internalProvider_1.ProviderOperation.SCHEDULE_SETTLEMENT);
        return settlement;
    }
    /**
     * -------------------------------------------------------------
     * Marks settlement as processing.
     * -------------------------------------------------------------
     */
    async processSettlement(settlementId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderSettlementStatus.PROCESSING,
            processingAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const settlement = await internalSettlement_repository_1.default.updateById(settlementId, update);
        if (!settlement) {
            return null;
        }
        await this.recordSettlementEvent(settlement, internalProvider_1.ProviderEventType.SETTLEMENT_PROCESSING, internalProvider_1.ProviderOperation.PROCESS_SETTLEMENT);
        return settlement;
    }
    /**
     * -------------------------------------------------------------
     * Marks settlement as completed.
     * -------------------------------------------------------------
     */
    async completeSettlement(settlementId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderSettlementStatus.SETTLED,
            isTerminal: true,
            settledAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const settlement = await internalSettlement_repository_1.default.updateById(settlementId, update);
        if (!settlement) {
            return null;
        }
        await this.recordSettlementEvent(settlement, internalProvider_1.ProviderEventType.SETTLEMENT_COMPLETED, internalProvider_1.ProviderOperation.COMPLETE_SETTLEMENT);
        return settlement;
    }
    /**
     * -------------------------------------------------------------
     * Marks settlement as partially settled.
     * -------------------------------------------------------------
     */
    async partiallySettle(settlementId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderSettlementStatus.PARTIALLY_SETTLED,
            "audit.lastStatusChangedAt": now,
        };
        const settlement = await internalSettlement_repository_1.default.updateById(settlementId, update);
        if (!settlement) {
            return null;
        }
        await this.recordSettlementEvent(settlement, internalProvider_1.ProviderEventType.SETTLEMENT_PARTIALLY_COMPLETED, internalProvider_1.ProviderOperation.PARTIAL_SETTLEMENT);
        return settlement;
    }
    /**
     * -------------------------------------------------------------
     * Marks settlement as failed.
     * -------------------------------------------------------------
     */
    async failSettlement(settlementId, reason) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderSettlementStatus.FAILED,
            failureReason: reason,
            isTerminal: true,
            failedAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const settlement = await internalSettlement_repository_1.default.updateById(settlementId, update);
        if (!settlement) {
            return null;
        }
        await this.recordSettlementEvent(settlement, internalProvider_1.ProviderEventType.SETTLEMENT_FAILED, internalProvider_1.ProviderOperation.FAIL_SETTLEMENT);
        return settlement;
    }
    /**
     * -------------------------------------------------------------
     * Cancels a provider settlement.
     * -------------------------------------------------------------
     */
    async cancelSettlement(settlementId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderSettlementStatus.CANCELLED,
            isTerminal: true,
            cancelledAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const settlement = await internalSettlement_repository_1.default.updateById(settlementId, update);
        if (!settlement) {
            return null;
        }
        await this.recordSettlementEvent(settlement, internalProvider_1.ProviderEventType.SETTLEMENT_CANCELLED, internalProvider_1.ProviderOperation.CANCEL_SETTLEMENT);
        return settlement;
    }
    /**
     * -------------------------------------------------------------
     * Marks settlement as expired.
     * -------------------------------------------------------------
     */
    async expireSettlement(settlementId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderSettlementStatus.EXPIRED,
            isTerminal: true,
            expiredAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const settlement = await internalSettlement_repository_1.default.updateById(settlementId, update);
        if (!settlement) {
            return null;
        }
        await this.recordSettlementEvent(settlement, internalProvider_1.ProviderEventType.SETTLEMENT_EXPIRED, internalProvider_1.ProviderOperation.EXPIRE_SETTLEMENT);
        return settlement;
    }
    /**
     * -------------------------------------------------------------
     * Finds a provider settlement by Mongo id.
     * -------------------------------------------------------------
     */
    async findById(settlementId) {
        return internalSettlement_repository_1.default.findById(settlementId);
    }
    /**
     * -------------------------------------------------------------
     * Finds a provider settlement using the Financial Domain
     * settlement id.
     * -------------------------------------------------------------
     */
    async findBySettlementId(settlementId) {
        return internalSettlement_repository_1.default.findBySettlementId(settlementId);
    }
    /**
     * -------------------------------------------------------------
     * Finds a provider settlement using the provider settlement id.
     * -------------------------------------------------------------
     */
    async findByProviderSettlementId(providerSettlementId) {
        return internalSettlement_repository_1.default.findByProviderSettlementId(providerSettlementId);
    }
    /**
     * -------------------------------------------------------------
     * Finds a provider settlement using the provider payment id.
     * -------------------------------------------------------------
     */
    async findByProviderPaymentId(providerPaymentId) {
        return internalSettlement_repository_1.default.findByProviderPaymentId(providerPaymentId);
    }
    /**
     * -------------------------------------------------------------
     * Finds a provider settlement using the idempotency key.
     * -------------------------------------------------------------
     */
    async findByIdempotencyKey(idempotencyKey) {
        return internalSettlement_repository_1.default.findByIdempotencyKey(idempotencyKey);
    }
}
exports.ProviderSettlementService = ProviderSettlementService;
exports.default = new ProviderSettlementService();
