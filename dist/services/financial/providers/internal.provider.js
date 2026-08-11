"use strict";
// backend/src/services/financial/providers/internal.provider.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.internalPaymentProvider = exports.InternalPaymentProvider = void 0;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = require("mongoose");
const paymentProvider_enum_1 = require("../../../enums/financial/paymentProvider.enum");
const internalProvider_1 = require("../../../constants/internalProvider");
const providerPayment_service_1 = __importDefault(require("../../internalProvider/payments/providerPayment.service"));
const providerRefund_service_1 = __importDefault(require("../../internalProvider/refunds/providerRefund.service"));
const providerWebhook_service_1 = __importDefault(require("../../internalProvider/webhooks/providerWebhook.service"));
const ProviderSimulatorError_1 = require("../../../errors/internalProvider/ProviderSimulatorError");
class InternalPaymentProvider {
    constructor() {
        this.provider = paymentProvider_enum_1.PaymentProvider.INTERNAL;
    }
    /* -------------------------------------------------------------------------- */
    /* Helpers                                                                     */
    /* -------------------------------------------------------------------------- */
    generateId(prefix) {
        return `${prefix}_${crypto_1.default.randomBytes(8).toString("hex").toUpperCase()}`;
    }
    generatePaymentId() {
        return this.generateId("INT_PAY");
    }
    generateTransactionId() {
        return this.generateId("INT_TXN");
    }
    generateRefundId() {
        return this.generateId("INT_REFUND");
    }
    generateWebhookId() {
        return this.generateId("INT_WEBHOOK");
    }
    generateEventId() {
        return this.generateId("INT_EVENT");
    }
    buildProviderMetadata() {
        return {
            provider: paymentProvider_enum_1.PaymentProvider.INTERNAL,
            environment: process.env.NODE_ENV ?? "development",
            simulationMode: internalProvider_1.ProviderSimulationMode.NORMAL,
        };
    }
    buildExecutionInfo() {
        return {
            attemptNumber: 1,
            retryCount: 0,
            processingLatencyMs: 0,
            isTestMode: process.env.NODE_ENV !== "production",
        };
    }
    buildAuditInfo() {
        return {
            createdBy: "InternalPaymentProvider",
            updatedBy: "InternalPaymentProvider",
            lastStatusChangedAt: new Date(),
        };
    }
    buildPayloads(request, response = {}) {
        return {
            request,
            response,
        };
    }
    /**
     * Persist only non-sensitive, provider-relevant session identity. Financial
     * details remain owned by the Financial Domain Payment.
     */
    buildPaymentSessionPayloads(request) {
        return this.buildPayloads({
            paymentId: request.paymentId,
            paymentReference: request.paymentReference,
            bookingId: request.bookingId,
            userId: request.userId,
            creatorId: request.creatorId,
            amount: request.amount,
            provider: request.provider,
            method: request.method,
            idempotencyKey: request.idempotencyKey,
        });
    }
    getPaymentSessionFingerprint(request) {
        const identity = JSON.stringify({
            paymentId: request.paymentId,
            paymentReference: request.paymentReference,
            bookingId: request.bookingId,
            userId: request.userId,
            creatorId: request.creatorId,
            amount: { amount: request.amount.amount, currency: request.amount.currency },
            provider: request.provider,
            method: request.method,
        });
        return crypto_1.default.createHash("sha256").update(identity).digest("hex");
    }
    getRefundFingerprint(request, financialPaymentId) {
        return crypto_1.default.createHash("sha256").update(JSON.stringify({
            refundId: request.refundId,
            bookingId: request.bookingId,
            financialPaymentId,
            refundReference: request.refundReference,
            paymentReference: request.paymentReference,
            providerPaymentId: request.providerPaymentId,
            amount: request.amount,
            reason: request.reason ?? null,
            provider: paymentProvider_enum_1.PaymentProvider.INTERNAL,
        })).digest("hex");
    }
    assertEquivalentCreationReplay(existingFingerprint, requestFingerprint) {
        if (!existingFingerprint) {
            throw new ProviderSimulatorError_1.ProviderSimulatorError("Existing provider payment cannot prove creation replay equivalence.", "PROVIDER_PAYMENT_REPLAY_CONFLICT", 409);
        }
        const existing = Buffer.from(existingFingerprint, "hex");
        const incoming = Buffer.from(requestFingerprint, "hex");
        if (existing.length !== incoming.length ||
            !crypto_1.default.timingSafeEqual(existing, incoming)) {
            throw new ProviderSimulatorError_1.ProviderSimulatorError("Idempotency key is already associated with a different payment-session request.", "PROVIDER_PAYMENT_REPLAY_CONFLICT", 409);
        }
    }
    buildPaymentSessionResponse(providerPaymentId, providerOrderId, duplicateRequest = false) {
        return {
            providerPaymentId,
            providerOrderId: providerOrderId ?? "",
            checkoutUrl: `internal://payments/${providerPaymentId}`,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
            payload: duplicateRequest
                ? { provider: paymentProvider_enum_1.PaymentProvider.INTERNAL, duplicateRequest: true }
                : { provider: paymentProvider_enum_1.PaymentProvider.INTERNAL, status: internalProvider_1.ProviderStatus.CREATED },
        };
    }
    isDuplicateKeyError(error) {
        return typeof error === "object" && error !== null &&
            "code" in error && error.code === 11000;
    }
    /* -------------------------------------------------------------------------- */
    /* Payment Session                                                             */
    /* -------------------------------------------------------------------------- */
    async createPaymentSession(request) {
        const requestFingerprint = this.getPaymentSessionFingerprint(request);
        const existing = await providerPayment_service_1.default.findByIdempotencyKeyForReplay(request.idempotencyKey);
        if (existing) {
            this.assertEquivalentCreationReplay(existing.requestFingerprint, requestFingerprint);
            return this.buildPaymentSessionResponse(existing.providerPaymentId, existing.providerReference ?? undefined, true);
        }
        const providerPaymentId = this.generatePaymentId();
        const providerOrderId = this.generateId("INT_ORDER");
        try {
            await providerPayment_service_1.default.createPayment({
                paymentId: new mongoose_1.Types.ObjectId(request.paymentId),
                amount: request.amount.amount,
                currency: request.amount.currency,
                providerPaymentId,
                providerReference: providerOrderId,
                idempotencyKey: request.idempotencyKey,
                requestFingerprint,
                providerMetadata: this.buildProviderMetadata(),
                execution: this.buildExecutionInfo(),
                audit: this.buildAuditInfo(),
                payloads: this.buildPaymentSessionPayloads(request),
            });
        }
        catch (error) {
            if (!this.isDuplicateKeyError(error))
                throw error;
            const raced = await providerPayment_service_1.default.findByIdempotencyKeyForReplay(request.idempotencyKey);
            if (!raced)
                throw error;
            this.assertEquivalentCreationReplay(raced.requestFingerprint, requestFingerprint);
            return this.buildPaymentSessionResponse(raced.providerPaymentId, raced.providerReference ?? undefined, true);
        }
        return this.buildPaymentSessionResponse(providerPaymentId, providerOrderId);
    }
    /* -------------------------------------------------------------------------- */
    /* Verification                                                                */
    /* -------------------------------------------------------------------------- */
    async verifyPayment(request) {
        const payment = await providerPayment_service_1.default.findByProviderPaymentId(request.providerPaymentId);
        if (!payment) {
            return {
                verified: false,
                providerStatus: "NOT_FOUND",
            };
        }
        let updated = payment;
        if (updated.status === internalProvider_1.ProviderStatus.CREATED) {
            updated = await providerPayment_service_1.default.authorizePayment(updated._id, updated.providerTransactionId ?? this.generateTransactionId());
        }
        if (updated.status === internalProvider_1.ProviderStatus.AUTHORIZED ||
            updated.status === internalProvider_1.ProviderStatus.PARTIALLY_CAPTURED) {
            updated = await providerPayment_service_1.default.capturePayment(updated._id);
        }
        return {
            verified: updated.status === internalProvider_1.ProviderStatus.CAPTURED,
            providerTransactionId: updated.providerTransactionId,
            providerStatus: updated.status,
            payload: {
                providerPaymentId: updated.providerPaymentId,
                paymentId: updated.paymentId.toString(),
                verifiedAt: new Date(),
                provider: paymentProvider_enum_1.PaymentProvider.INTERNAL,
            },
        };
    }
    /* -------------------------------------------------------------------------- */
    /* Payment Status                                                              */
    /* -------------------------------------------------------------------------- */
    async getPaymentStatus(request) {
        const payment = await providerPayment_service_1.default.findByProviderPaymentId(request.providerPaymentId);
        if (!payment) {
            throw new Error("Provider payment not found.");
        }
        return {
            providerPaymentId: payment.providerPaymentId,
            providerTransactionId: payment.providerTransactionId,
            providerStatus: payment.status,
            payload: {
                paymentId: payment.paymentId.toString(),
                providerReference: payment.providerReference,
                createdAt: payment.createdAt,
                updatedAt: payment.updatedAt,
            },
        };
    }
    /* -------------------------------------------------------------------------- */
    /* Cancellation / authorization void                                          */
    /* -------------------------------------------------------------------------- */
    async cancelPayment(request) {
        const payment = await providerPayment_service_1.default.findByProviderPaymentId(request.providerPaymentId);
        if (!payment)
            throw new ProviderSimulatorError_1.ProviderSimulatorError("Provider payment not found.", "PROVIDER_PAYMENT_NOT_FOUND", 404);
        const cancelled = payment.status === internalProvider_1.ProviderStatus.CANCELLED
            ? payment
            : await providerPayment_service_1.default.cancelPayment(payment._id);
        return {
            providerPaymentId: cancelled.providerPaymentId,
            providerStatus: cancelled.status,
            payload: { paymentId: cancelled.paymentId.toString(), provider: paymentProvider_enum_1.PaymentProvider.INTERNAL, cancelledAt: cancelled.cancelledAt ?? new Date() },
        };
    }
    /* -------------------------------------------------------------------------- */
    /* Refund                                                                      */
    /* -------------------------------------------------------------------------- */
    async createRefund(request) {
        const payment = await providerPayment_service_1.default.findByProviderPaymentId(request.providerPaymentId);
        if (!payment) {
            throw new Error("Provider payment not found.");
        }
        if (!payment.providerTransactionId || payment.status !== internalProvider_1.ProviderStatus.CAPTURED) {
            throw new Error("Cannot refund a provider payment that is not captured.");
        }
        if (request.amount.amount !== payment.amount || request.amount.currency !== payment.currency) {
            throw new ProviderSimulatorError_1.ProviderSimulatorError("Provider refund must equal the captured payment amount.", "PROVIDER_REFUND_AMOUNT_MISMATCH", 409);
        }
        const requestFingerprint = this.getRefundFingerprint(request, payment.paymentId.toString());
        const existing = await providerRefund_service_1.default.findByIdempotencyKeyForReplay(request.idempotencyKey);
        if (existing) {
            this.assertEquivalentCreationReplay(existing.requestFingerprint, requestFingerprint);
            if (existing.providerPaymentId !== request.providerPaymentId || existing.amount !== request.amount.amount || existing.currency !== request.amount.currency) {
                throw new ProviderSimulatorError_1.ProviderSimulatorError("Provider refund idempotency key conflicts with the refund identity.", "PROVIDER_REFUND_REPLAY_CONFLICT", 409);
            }
            if (existing.status === "CREATED")
                await providerRefund_service_1.default.processRefund(existing._id);
            if (existing.status === "CREATED" || existing.status === "PROCESSING")
                await providerRefund_service_1.default.completeRefund(existing._id);
            const replayed = await providerRefund_service_1.default.findById(existing._id);
            if (!replayed || replayed.status !== "REFUNDED")
                throw new ProviderSimulatorError_1.ProviderSimulatorError("Provider refund is not complete.", "PROVIDER_REFUND_INCOMPLETE", 409);
            return { providerRefundId: replayed.providerRefundId, providerStatus: replayed.status, payload: { provider: paymentProvider_enum_1.PaymentProvider.INTERNAL, providerPaymentId: payment.providerPaymentId, providerTransactionId: payment.providerTransactionId, refundedAt: replayed.completedAt ?? new Date() } };
        }
        const providerRefundId = this.generateRefundId();
        let createdRefund;
        try {
            createdRefund = await providerRefund_service_1.default.createRefund({ refundId: new mongoose_1.Types.ObjectId(request.refundId), internalPaymentId: payment._id, providerPaymentId: payment.providerPaymentId, providerRefundId, idempotencyKey: request.idempotencyKey, requestFingerprint, amount: request.amount.amount, currency: request.amount.currency, providerMetadata: this.buildProviderMetadata(), execution: this.buildExecutionInfo(), audit: this.buildAuditInfo(), payloads: this.buildPayloads(request) });
        }
        catch (error) {
            if (!this.isDuplicateKeyError(error))
                throw error;
            const raced = await providerRefund_service_1.default.findByIdempotencyKeyForReplay(request.idempotencyKey);
            if (!raced)
                throw error;
            this.assertEquivalentCreationReplay(raced.requestFingerprint, requestFingerprint);
            if (raced.providerPaymentId !== request.providerPaymentId || raced.amount !== request.amount.amount || raced.currency !== request.amount.currency)
                throw new ProviderSimulatorError_1.ProviderSimulatorError("Provider refund replay conflicts with persisted identity.", "PROVIDER_REFUND_REPLAY_CONFLICT", 409);
            if (raced.status === "CREATED")
                await providerRefund_service_1.default.processRefund(raced._id);
            if (raced.status === "CREATED" || raced.status === "PROCESSING")
                await providerRefund_service_1.default.completeRefund(raced._id);
            return { providerRefundId: raced.providerRefundId, providerStatus: "REFUNDED", payload: { provider: paymentProvider_enum_1.PaymentProvider.INTERNAL, providerPaymentId: payment.providerPaymentId, providerTransactionId: payment.providerTransactionId, refundedAt: raced.completedAt ?? new Date() } };
        }
        await providerRefund_service_1.default.processRefund(createdRefund._id);
        await providerRefund_service_1.default.completeRefund(createdRefund._id);
        const refund = await providerRefund_service_1.default.findByProviderRefundId(providerRefundId);
        if (!refund) {
            throw new Error("Failed to create provider refund.");
        }
        return {
            providerRefundId,
            providerStatus: refund.status,
            payload: {
                provider: paymentProvider_enum_1.PaymentProvider.INTERNAL,
                providerPaymentId: payment.providerPaymentId,
                providerTransactionId: payment.providerTransactionId,
                refundedAt: new Date(),
            },
        };
    }
    /* -------------------------------------------------------------------------- */
    /* Webhooks                                                                    */
    /* -------------------------------------------------------------------------- */
    async verifyWebhook(request) {
        const providerWebhookId = this.generateWebhookId();
        const eventId = this.generateEventId();
        await providerWebhook_service_1.default.createWebhook({
            providerWebhookId,
            providerEntityId: eventId,
            eventName: request.body?.eventType ??
                "internal.webhook",
            idempotencyKey: providerWebhookId,
            providerMetadata: this.buildProviderMetadata(),
            execution: this.buildExecutionInfo(),
            audit: this.buildAuditInfo(),
            payloads: {
                request: request.body,
                response: {},
            },
        });
        await providerWebhook_service_1.default.receiveWebhook(providerWebhookId);
        await providerWebhook_service_1.default.validateWebhook(providerWebhookId);
        await providerWebhook_service_1.default.verifyWebhook(providerWebhookId);
        await providerWebhook_service_1.default.processWebhook(providerWebhookId);
        await providerWebhook_service_1.default.completeWebhook(providerWebhookId);
        const webhook = await providerWebhook_service_1.default.getWebhookByProviderWebhookId(providerWebhookId);
        if (!webhook) {
            return {
                verified: false,
                providerEventId: eventId,
                providerEventType: "NOT_FOUND",
                payload: {},
            };
        }
        return {
            verified: true,
            providerEventId: webhook.providerEntityId ?? eventId,
            providerEventType: webhook.eventName,
            payload: {
                provider: paymentProvider_enum_1.PaymentProvider.INTERNAL,
                processedAt: new Date(),
            },
        };
    }
}
exports.InternalPaymentProvider = InternalPaymentProvider;
exports.internalPaymentProvider = new InternalPaymentProvider();
exports.default = exports.internalPaymentProvider;
