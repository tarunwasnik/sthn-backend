"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderPaymentService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const internalPayment_repository_1 = __importDefault(require("../../../repositories/internalProvider/internalPayment.repository"));
const internalProvider_1 = require("../../../constants/internalProvider");
const providerClock_service_1 = __importDefault(require("../base/providerClock.service"));
const providerEvent_service_1 = __importDefault(require("../events/providerEvent.service"));
const ProviderSimulatorError_1 = require("../../../errors/internalProvider/ProviderSimulatorError");
/**
 * Owns Internal Provider payment execution state. Financial Payment state is
 * deliberately advanced by the Financial Domain lifecycle, never here.
 */
class ProviderPaymentService {
    transitionKey(payment, operation) {
        return `internal-payment:${payment.providerPaymentId}:${operation}`;
    }
    assertOptionalTransactionIdReplay(current, incomingTransactionId) {
        const existingTransactionId = current.providerTransactionId ?? undefined;
        if (existingTransactionId !== incomingTransactionId) {
            throw new ProviderSimulatorError_1.ProviderSimulatorError("Provider payment authorization replay has a different transaction identifier.", "PROVIDER_PAYMENT_REPLAY_CONFLICT", 409);
        }
    }
    assertFailureReasonReplay(current, incomingReason) {
        if (current.failureReason !== incomingReason) {
            throw new ProviderSimulatorError_1.ProviderSimulatorError("Provider payment failure replay has a different failure reason.", "PROVIDER_PAYMENT_REPLAY_CONFLICT", 409);
        }
    }
    async recordPaymentEvent(payment, eventType, operation, session) {
        await providerEvent_service_1.default.recordEvent({
            entityType: internalProvider_1.ProviderEntityType.PAYMENT,
            entityId: payment._id,
            eventType,
            operation,
            transitionKey: this.transitionKey(payment, operation),
            providerEntityId: payment.providerPaymentId,
            providerPaymentId: payment.providerPaymentId,
            providerReference: payment.providerReference ?? undefined,
            providerMetadata: payment.providerMetadata,
            execution: payment.execution,
            audit: payment.audit,
            payloads: payment.payloads,
        }, session);
    }
    /** Creates the provider record and its CREATED event atomically. */
    async createPayment(data) {
        const session = await mongoose_1.default.startSession();
        let created = null;
        try {
            await session.withTransaction(async () => {
                const payment = await internalPayment_repository_1.default.create({
                    ...data,
                    status: internalProvider_1.ProviderStatus.CREATED,
                    isTerminal: false,
                }, session);
                await this.recordPaymentEvent(payment, internalProvider_1.ProviderEventType.PAYMENT_CREATED, internalProvider_1.ProviderOperation.CREATE_PAYMENT, session);
                created = payment;
            });
        }
        finally {
            await session.endSession();
        }
        if (!created) {
            throw new ProviderSimulatorError_1.ProviderSimulatorError("Provider payment creation did not complete.", "PROVIDER_PAYMENT_CREATE_FAILED", 500);
        }
        return created;
    }
    /**
     * Commits one legal provider transition with its immutable event. Replays of
     * the same target state are successful no-ops and emit no second event.
     */
    async executeTransition(paymentId, transition) {
        const session = await mongoose_1.default.startSession();
        let result = null;
        try {
            await session.withTransaction(async () => {
                const current = await internalPayment_repository_1.default.findById(paymentId, session);
                if (!current) {
                    throw new ProviderSimulatorError_1.ProviderSimulatorError("Internal Provider payment not found.", "PROVIDER_PAYMENT_NOT_FOUND", 404);
                }
                if (current.status === transition.targetStatus) {
                    transition.assertReplay?.(current);
                    result = current;
                    return;
                }
                if (current.isTerminal) {
                    throw new ProviderSimulatorError_1.ProviderSimulatorError(`Cannot apply ${transition.operation} to terminal provider payment ${current.status}.`, "PROVIDER_PAYMENT_TERMINAL_CONFLICT", 409);
                }
                const payment = await internalPayment_repository_1.default.updateOne({
                    _id: current._id,
                    status: { $in: transition.allowedStatuses },
                    isTerminal: false,
                }, transition.update, session);
                if (!payment) {
                    throw new ProviderSimulatorError_1.ProviderSimulatorError("Provider payment state changed concurrently. Retry the provider operation.", "PROVIDER_PAYMENT_TRANSITION_CONFLICT", 409);
                }
                await this.recordPaymentEvent(payment, transition.eventType, transition.operation, session);
                result = payment;
            });
        }
        finally {
            await session.endSession();
        }
        if (!result) {
            throw new ProviderSimulatorError_1.ProviderSimulatorError("Provider payment transition did not complete.", "PROVIDER_PAYMENT_TRANSITION_FAILED", 500);
        }
        return result;
    }
    async authorizePayment(paymentId, providerTransactionId) {
        const now = providerClock_service_1.default.now();
        return this.executeTransition(paymentId, {
            targetStatus: internalProvider_1.ProviderStatus.AUTHORIZED,
            allowedStatuses: [internalProvider_1.ProviderStatus.CREATED],
            eventType: internalProvider_1.ProviderEventType.PAYMENT_AUTHORIZED,
            operation: internalProvider_1.ProviderOperation.AUTHORIZE_PAYMENT,
            update: {
                status: internalProvider_1.ProviderStatus.AUTHORIZED,
                ...(providerTransactionId ? { providerTransactionId } : {}),
                authorizedAt: now,
                "audit.lastStatusChangedAt": now,
            },
            assertReplay: (current) => this.assertOptionalTransactionIdReplay(current, providerTransactionId),
        });
    }
    async capturePayment(paymentId) {
        const now = providerClock_service_1.default.now();
        return this.executeTransition(paymentId, {
            targetStatus: internalProvider_1.ProviderStatus.CAPTURED,
            allowedStatuses: [internalProvider_1.ProviderStatus.AUTHORIZED, internalProvider_1.ProviderStatus.PARTIALLY_CAPTURED],
            eventType: internalProvider_1.ProviderEventType.PAYMENT_CAPTURED,
            operation: internalProvider_1.ProviderOperation.CAPTURE_PAYMENT,
            update: {
                status: internalProvider_1.ProviderStatus.CAPTURED,
                isTerminal: true,
                capturedAt: now,
                "audit.lastStatusChangedAt": now,
            },
        });
    }
    async partiallyCapturePayment(paymentId) {
        const now = providerClock_service_1.default.now();
        return this.executeTransition(paymentId, {
            targetStatus: internalProvider_1.ProviderStatus.PARTIALLY_CAPTURED,
            allowedStatuses: [internalProvider_1.ProviderStatus.AUTHORIZED],
            eventType: internalProvider_1.ProviderEventType.PAYMENT_PARTIALLY_CAPTURED,
            operation: internalProvider_1.ProviderOperation.PARTIAL_CAPTURE_PAYMENT,
            update: {
                status: internalProvider_1.ProviderStatus.PARTIALLY_CAPTURED,
                "audit.lastStatusChangedAt": now,
            },
        });
    }
    async cancelPayment(paymentId) {
        const now = providerClock_service_1.default.now();
        return this.executeTransition(paymentId, {
            targetStatus: internalProvider_1.ProviderStatus.CANCELLED,
            allowedStatuses: [internalProvider_1.ProviderStatus.CREATED, internalProvider_1.ProviderStatus.AUTHORIZED, internalProvider_1.ProviderStatus.PARTIALLY_CAPTURED],
            eventType: internalProvider_1.ProviderEventType.PAYMENT_CANCELLED,
            operation: internalProvider_1.ProviderOperation.CANCEL_PAYMENT,
            update: {
                status: internalProvider_1.ProviderStatus.CANCELLED,
                isTerminal: true,
                cancelledAt: now,
                "audit.lastStatusChangedAt": now,
            },
        });
    }
    async failPayment(paymentId, reason) {
        const now = providerClock_service_1.default.now();
        return this.executeTransition(paymentId, {
            targetStatus: internalProvider_1.ProviderStatus.FAILED,
            allowedStatuses: [internalProvider_1.ProviderStatus.CREATED, internalProvider_1.ProviderStatus.AUTHORIZED, internalProvider_1.ProviderStatus.PARTIALLY_CAPTURED],
            eventType: internalProvider_1.ProviderEventType.PAYMENT_FAILED,
            operation: internalProvider_1.ProviderOperation.FAIL_PAYMENT,
            update: {
                status: internalProvider_1.ProviderStatus.FAILED,
                failureReason: reason,
                isTerminal: true,
                failedAt: now,
                "audit.lastStatusChangedAt": now,
            },
            assertReplay: (current) => this.assertFailureReasonReplay(current, reason),
        });
    }
    async expirePayment(paymentId) {
        const now = providerClock_service_1.default.now();
        return this.executeTransition(paymentId, {
            targetStatus: internalProvider_1.ProviderStatus.EXPIRED,
            allowedStatuses: [internalProvider_1.ProviderStatus.CREATED, internalProvider_1.ProviderStatus.AUTHORIZED, internalProvider_1.ProviderStatus.PARTIALLY_CAPTURED],
            eventType: internalProvider_1.ProviderEventType.PAYMENT_EXPIRED,
            operation: internalProvider_1.ProviderOperation.EXPIRE_PAYMENT,
            update: {
                status: internalProvider_1.ProviderStatus.EXPIRED,
                isTerminal: true,
                expiredAt: now,
                "audit.lastStatusChangedAt": now,
            },
        });
    }
    async findById(paymentId) {
        return internalPayment_repository_1.default.findById(paymentId);
    }
    async findByPaymentId(paymentId) {
        return internalPayment_repository_1.default.findByPaymentId(paymentId);
    }
    async findByProviderPaymentId(providerPaymentId) {
        return internalPayment_repository_1.default.findByProviderPaymentId(providerPaymentId);
    }
    async findByProviderTransactionId(providerTransactionId) {
        return internalPayment_repository_1.default.findByProviderTransactionId(providerTransactionId);
    }
    async findByIdempotencyKey(idempotencyKey) {
        return internalPayment_repository_1.default.findByIdempotencyKey(idempotencyKey);
    }
    async findByIdempotencyKeyForReplay(idempotencyKey) {
        return internalPayment_repository_1.default.findByIdempotencyKeyForReplay(idempotencyKey);
    }
}
exports.ProviderPaymentService = ProviderPaymentService;
exports.default = new ProviderPaymentService();
