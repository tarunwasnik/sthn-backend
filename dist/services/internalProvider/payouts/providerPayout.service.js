"use strict";
// backend/src/services/internalProvider/payouts/providerPayout.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderPayoutService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const internalPayout_repository_1 = __importDefault(require("../../../repositories/internalProvider/internalPayout.repository"));
const internalProvider_1 = require("../../../constants/internalProvider");
const providerClock_service_1 = __importDefault(require("../base/providerClock.service"));
const providerEvent_service_1 = __importDefault(require("../events/providerEvent.service"));
const providerId_service_1 = __importDefault(require("../base/providerId.service"));
const ProviderSimulatorError_1 = require("../../../errors/internalProvider/ProviderSimulatorError");
/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Payout Service
 * ------------------------------------------------------------------
 *
 * Responsible for managing the lifecycle of simulated provider
 * payouts.
 *
 * Every payout lifecycle transition records an immutable
 * provider event.
 *
 * This service owns ONLY provider payout execution state.
 *
 * Financial ownership remains with the Financial Domain.
 * ------------------------------------------------------------------
 */
class ProviderPayoutService {
    /**
     * -------------------------------------------------------------
     * Records an immutable payout provider event.
     * -------------------------------------------------------------
     */
    async recordPayoutEvent(payout, eventType, operation, session) {
        await providerEvent_service_1.default.recordEvent({
            entityType: internalProvider_1.ProviderEntityType.PAYOUT,
            entityId: payout._id,
            eventType,
            operation,
            providerEntityId: payout.providerPayoutId,
            providerPaymentId: payout.providerPaymentId,
            providerReference: payout.providerReference ?? undefined,
            providerMetadata: payout.providerMetadata,
            execution: payout.execution,
            audit: payout.audit,
            payloads: payout.payloads,
        }, session);
    }
    /**
     * Executes a trusted admin simulator command against provider-owned payout
     * state. The conditional update and append-only event share one transaction.
     */
    async simulatePayoutTransition(input) {
        const session = await mongoose_1.default.startSession();
        let result = null;
        try {
            await session.withTransaction(async () => {
                const current = await internalPayout_repository_1.default.findByProviderPayoutId(input.providerPayoutId, session);
                if (!current) {
                    throw new ProviderSimulatorError_1.ProviderSimulatorError("Internal Provider payout not found.", "PROVIDER_PAYOUT_NOT_FOUND", 404);
                }
                const targetStatus = this.getSimulationTargetStatus(input.action);
                const previousStatus = current.status;
                if (current.status === targetStatus) {
                    result = { payout: current, previousStatus, idempotent: true };
                    return;
                }
                if (current.isTerminal) {
                    throw new ProviderSimulatorError_1.ProviderSimulatorError(`Cannot apply ${input.action} to terminal provider payout ${current.status}.`, "PROVIDER_PAYOUT_TERMINAL_CONFLICT", 409);
                }
                const now = providerClock_service_1.default.now();
                const update = this.buildSimulationUpdate(current, input, now);
                const payout = await internalPayout_repository_1.default.updateOne({
                    _id: current._id,
                    status: current.status,
                    isTerminal: false,
                }, update, session);
                if (!payout) {
                    throw new ProviderSimulatorError_1.ProviderSimulatorError("Provider payout state changed concurrently. Retry the simulation command.", "PROVIDER_PAYOUT_TRANSITION_CONFLICT", 409);
                }
                const { eventType, operation } = this.getSimulationEvent(input.action);
                await this.recordPayoutEvent(payout, eventType, operation, session);
                result = { payout, previousStatus, idempotent: false };
            });
        }
        finally {
            await session.endSession();
        }
        if (!result) {
            throw new ProviderSimulatorError_1.ProviderSimulatorError("Provider payout simulation did not complete.", "PROVIDER_PAYOUT_SIMULATION_FAILED", 500);
        }
        return result;
    }
    getSimulationTargetStatus(action) {
        switch (action) {
            case internalProvider_1.ProviderPayoutSimulationAction.PROCESS:
                return internalProvider_1.ProviderPayoutStatus.PROCESSING;
            case internalProvider_1.ProviderPayoutSimulationAction.COMPLETE:
                return internalProvider_1.ProviderPayoutStatus.PAID;
            case internalProvider_1.ProviderPayoutSimulationAction.FAIL:
                return internalProvider_1.ProviderPayoutStatus.FAILED;
            case internalProvider_1.ProviderPayoutSimulationAction.CANCEL:
                return internalProvider_1.ProviderPayoutStatus.CANCELLED;
            case internalProvider_1.ProviderPayoutSimulationAction.EXPIRE:
                return internalProvider_1.ProviderPayoutStatus.EXPIRED;
        }
    }
    buildSimulationUpdate(current, input, now) {
        const targetStatus = this.getSimulationTargetStatus(input.action);
        const update = {
            status: targetStatus,
            simulated: true,
            simulatedAction: input.action,
            simulatedAt: now,
            simulatedByAdminId: input.adminId,
            simulationNote: input.note ?? current.simulationNote,
            "audit.updatedBy": "ProviderSimulatorService",
            "audit.lastStatusChangedAt": now,
        };
        switch (input.action) {
            case internalProvider_1.ProviderPayoutSimulationAction.PROCESS:
                update.processingAt = current.processingAt ?? now;
                break;
            case internalProvider_1.ProviderPayoutSimulationAction.COMPLETE:
                update.isTerminal = true;
                update.paidAt = current.paidAt ?? now;
                update.providerTransactionId =
                    current.providerTransactionId ??
                        providerId_service_1.default.generatePayoutTransactionId();
                break;
            case internalProvider_1.ProviderPayoutSimulationAction.FAIL:
                update.isTerminal = true;
                update.failedAt = current.failedAt ?? now;
                update.failureReason = internalProvider_1.ProviderFailureReason.PAYOUT_FAILED;
                update.failureCode = input.failureCode ?? "SIMULATED_PROVIDER_FAILURE";
                update.failureMessage =
                    input.failureMessage ?? "Simulated terminal provider payout failure.";
                break;
            case internalProvider_1.ProviderPayoutSimulationAction.CANCEL:
                update.isTerminal = true;
                update.cancelledAt = current.cancelledAt ?? now;
                update.failureReason = internalProvider_1.ProviderFailureReason.ADMIN_CANCELLED;
                update.failureCode = "SIMULATED_PROVIDER_CANCELLED";
                update.failureMessage = input.failureMessage ?? "Provider payout cancelled by administrator.";
                break;
            case internalProvider_1.ProviderPayoutSimulationAction.EXPIRE:
                update.isTerminal = true;
                update.expiredAt = current.expiredAt ?? now;
                update.failureReason = internalProvider_1.ProviderFailureReason.TIMEOUT;
                update.failureCode = "SIMULATED_PROVIDER_EXPIRED";
                update.failureMessage = input.failureMessage ?? "Provider payout expired.";
                break;
        }
        return update;
    }
    getSimulationEvent(action) {
        switch (action) {
            case internalProvider_1.ProviderPayoutSimulationAction.PROCESS:
                return {
                    eventType: internalProvider_1.ProviderEventType.PAYOUT_PROCESSING,
                    operation: internalProvider_1.ProviderOperation.PROCESS_PAYOUT,
                };
            case internalProvider_1.ProviderPayoutSimulationAction.COMPLETE:
                return {
                    eventType: internalProvider_1.ProviderEventType.PAYOUT_COMPLETED,
                    operation: internalProvider_1.ProviderOperation.COMPLETE_PAYOUT,
                };
            case internalProvider_1.ProviderPayoutSimulationAction.FAIL:
                return {
                    eventType: internalProvider_1.ProviderEventType.PAYOUT_FAILED,
                    operation: internalProvider_1.ProviderOperation.FAIL_PAYOUT,
                };
            case internalProvider_1.ProviderPayoutSimulationAction.CANCEL:
                return {
                    eventType: internalProvider_1.ProviderEventType.PAYOUT_CANCELLED,
                    operation: internalProvider_1.ProviderOperation.CANCEL_PAYOUT,
                };
            case internalProvider_1.ProviderPayoutSimulationAction.EXPIRE:
                return {
                    eventType: internalProvider_1.ProviderEventType.PAYOUT_EXPIRED,
                    operation: internalProvider_1.ProviderOperation.EXPIRE_PAYOUT,
                };
        }
    }
    /**
     * -------------------------------------------------------------
     * Creates a provider payout.
     * -------------------------------------------------------------
     */
    async createPayout(data) {
        return this.createPayoutWithCreatedEvent(data);
    }
    /** Secure creation path for new withdrawal-originated Phase 6E payouts. */
    async createWithdrawalPayout(data) {
        this.validateWithdrawalPayoutCreation(data);
        return this.createPayoutWithCreatedEvent(data);
    }
    async createPayoutWithCreatedEvent(data) {
        const session = await mongoose_1.default.startSession();
        let created = null;
        try {
            await session.withTransaction(async () => {
                const payout = await internalPayout_repository_1.default.create({
                    ...data,
                    status: internalProvider_1.ProviderPayoutStatus.CREATED,
                    isTerminal: false,
                }, session);
                await this.recordPayoutEvent(payout, internalProvider_1.ProviderEventType.PAYOUT_CREATED, internalProvider_1.ProviderOperation.CREATE_PAYOUT, session);
                created = payout;
            });
        }
        finally {
            await session.endSession();
        }
        if (!created) {
            throw new ProviderSimulatorError_1.ProviderSimulatorError("Provider payout creation did not complete.", "PROVIDER_PAYOUT_CREATE_FAILED", 500);
        }
        return created;
    }
    validateWithdrawalPayoutCreation(data) {
        const destination = data.providerDestination;
        if (!data.payoutId ||
            !data.providerPayoutId ||
            !data.idempotencyKey ||
            !destination ||
            destination.version !== 1 ||
            destination.sourceSnapshotVersion !== 1 ||
            !destination.fingerprint ||
            !destination.encryptedPayload) {
            throw new ProviderSimulatorError_1.ProviderSimulatorError("Provider payout destination is required.", "PROVIDER_PAYOUT_DESTINATION_REQUIRED", 400);
        }
    }
    /**
     * -------------------------------------------------------------
     * Marks payout as scheduled.
     * -------------------------------------------------------------
     */
    async schedulePayout(payoutId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderPayoutStatus.SCHEDULED,
            scheduledAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const payout = await internalPayout_repository_1.default.updateById(payoutId, update);
        if (!payout) {
            return null;
        }
        await this.recordPayoutEvent(payout, internalProvider_1.ProviderEventType.PAYOUT_SCHEDULED, internalProvider_1.ProviderOperation.SCHEDULE_PAYOUT);
        return payout;
    }
    /**
     * -------------------------------------------------------------
     * Marks payout as processing.
     * -------------------------------------------------------------
     */
    async processPayout(payoutId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderPayoutStatus.PROCESSING,
            processingAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const payout = await internalPayout_repository_1.default.updateById(payoutId, update);
        if (!payout) {
            return null;
        }
        await this.recordPayoutEvent(payout, internalProvider_1.ProviderEventType.PAYOUT_PROCESSING, internalProvider_1.ProviderOperation.PROCESS_PAYOUT);
        return payout;
    }
    /**
     * -------------------------------------------------------------
     * Marks payout as initiated.
     * -------------------------------------------------------------
     */
    async initiatePayout(payoutId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderPayoutStatus.INITIATED,
            "audit.lastStatusChangedAt": now,
        };
        const payout = await internalPayout_repository_1.default.updateById(payoutId, update);
        if (!payout) {
            return null;
        }
        await this.recordPayoutEvent(payout, internalProvider_1.ProviderEventType.PAYOUT_INITIATED, internalProvider_1.ProviderOperation.INITIATE_PAYOUT);
        return payout;
    }
    /**
     * -------------------------------------------------------------
     * Marks payout as completed.
     * -------------------------------------------------------------
     */
    async completePayout(payoutId) {
        const existing = await internalPayout_repository_1.default.findById(payoutId);
        if (existing?.isTerminal) {
            return existing;
        }
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderPayoutStatus.PAID,
            isTerminal: true,
            paidAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const payout = await internalPayout_repository_1.default.updateById(payoutId, update);
        if (!payout) {
            return null;
        }
        await this.recordPayoutEvent(payout, internalProvider_1.ProviderEventType.PAYOUT_COMPLETED, internalProvider_1.ProviderOperation.COMPLETE_PAYOUT);
        return payout;
    }
    /**
     * -------------------------------------------------------------
     * Marks payout as partially paid.
     * -------------------------------------------------------------
     */
    async partiallyPay(payoutId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderPayoutStatus.PARTIALLY_PAID,
            "audit.lastStatusChangedAt": now,
        };
        const payout = await internalPayout_repository_1.default.updateById(payoutId, update);
        if (!payout) {
            return null;
        }
        await this.recordPayoutEvent(payout, internalProvider_1.ProviderEventType.PAYOUT_PARTIALLY_COMPLETED, internalProvider_1.ProviderOperation.PARTIAL_PAYOUT);
        return payout;
    }
    /**
     * -------------------------------------------------------------
     * Marks payout as failed.
     * -------------------------------------------------------------
     */
    async failPayout(payoutId, reason) {
        const existing = await internalPayout_repository_1.default.findById(payoutId);
        if (existing?.isTerminal) {
            return existing;
        }
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderPayoutStatus.FAILED,
            failureReason: reason,
            isTerminal: true,
            failedAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const payout = await internalPayout_repository_1.default.updateById(payoutId, update);
        if (!payout) {
            return null;
        }
        await this.recordPayoutEvent(payout, internalProvider_1.ProviderEventType.PAYOUT_FAILED, internalProvider_1.ProviderOperation.FAIL_PAYOUT);
        return payout;
    }
    /**
     * -------------------------------------------------------------
     * Cancels a provider payout.
     * -------------------------------------------------------------
     */
    async cancelPayout(payoutId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderPayoutStatus.CANCELLED,
            isTerminal: true,
            cancelledAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const payout = await internalPayout_repository_1.default.updateById(payoutId, update);
        if (!payout) {
            return null;
        }
        await this.recordPayoutEvent(payout, internalProvider_1.ProviderEventType.PAYOUT_CANCELLED, internalProvider_1.ProviderOperation.CANCEL_PAYOUT);
        return payout;
    }
    /**
     * -------------------------------------------------------------
     * Marks payout as expired.
     * -------------------------------------------------------------
     */
    async expirePayout(payoutId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderPayoutStatus.EXPIRED,
            isTerminal: true,
            expiredAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const payout = await internalPayout_repository_1.default.updateById(payoutId, update);
        if (!payout) {
            return null;
        }
        await this.recordPayoutEvent(payout, internalProvider_1.ProviderEventType.PAYOUT_EXPIRED, internalProvider_1.ProviderOperation.EXPIRE_PAYOUT);
        return payout;
    }
    /**
     * -------------------------------------------------------------
     * Marks payout as reversed.
     * -------------------------------------------------------------
     */
    async reversePayout(payoutId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderPayoutStatus.REVERSED,
            isTerminal: true,
            "audit.lastStatusChangedAt": now,
        };
        const payout = await internalPayout_repository_1.default.updateById(payoutId, update);
        if (!payout) {
            return null;
        }
        await this.recordPayoutEvent(payout, internalProvider_1.ProviderEventType.PAYOUT_REVERSED, internalProvider_1.ProviderOperation.REVERSE_PAYOUT);
        return payout;
    }
    /**
     * -------------------------------------------------------------
     * Finds a provider payout by Mongo id.
     * -------------------------------------------------------------
     */
    async findById(payoutId) {
        return internalPayout_repository_1.default.findById(payoutId);
    }
    /**
     * -------------------------------------------------------------
     * Finds a provider payout using the Financial Domain payout id.
     * -------------------------------------------------------------
     */
    async findByPayoutId(payoutId) {
        return internalPayout_repository_1.default.findByPayoutId(payoutId);
    }
    /**
     * -------------------------------------------------------------
     * Finds a provider payout using the provider payout id.
     * -------------------------------------------------------------
     */
    async findByProviderPayoutId(providerPayoutId) {
        return internalPayout_repository_1.default.findByProviderPayoutId(providerPayoutId);
    }
    /**
     * -------------------------------------------------------------
     * Finds a provider payout using the provider settlement id.
     * -------------------------------------------------------------
     */
    async findByProviderSettlementId(providerSettlementId) {
        return internalPayout_repository_1.default.findByProviderSettlementId(providerSettlementId);
    }
    /**
     * -------------------------------------------------------------
     * Finds a provider payout using the provider payment id.
     * -------------------------------------------------------------
     */
    async findByProviderPaymentId(providerPaymentId) {
        return internalPayout_repository_1.default.findByProviderPaymentId(providerPaymentId);
    }
    /**
     * -------------------------------------------------------------
     * Finds a provider payout using the idempotency key.
     * -------------------------------------------------------------
     */
    async findByIdempotencyKey(idempotencyKey) {
        return internalPayout_repository_1.default.findByIdempotencyKey(idempotencyKey);
    }
    async findByIdempotencyKeyForDestinationConsistency(idempotencyKey) {
        return internalPayout_repository_1.default.findByIdempotencyKeyForDestinationConsistency(idempotencyKey);
    }
}
exports.ProviderPayoutService = ProviderPayoutService;
exports.default = new ProviderPayoutService();
