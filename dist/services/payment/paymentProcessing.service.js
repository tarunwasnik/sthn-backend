"use strict";
// backend/src/services/payment/paymentProcessing.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentProcessingService = exports.PaymentProcessingService = void 0;
const payment_service_1 = require("../financial/payment.service");
const paymentProvider_service_1 = require("./provider/paymentProvider.service");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const paymentFailureReason_enum_1 = require("../../enums/financial/paymentFailureReason.enum");
const PaymentError_1 = require("../../errors/financial/PaymentError");
class PaymentProcessingService {
    constructor(payments = payment_service_1.paymentService, providers = paymentProvider_service_1.paymentProviderService) {
        this.payments = payments;
        this.providers = providers;
    }
    /* -------------------------------------------------------------------------- */
    /* Helpers                                                                    */
    /* -------------------------------------------------------------------------- */
    /**
     * Loads a payment or throws.
     */
    async getPayment(paymentId) {
        return this.payments.getPayment(paymentId);
    }
    /**
     * Ensures the payment is eligible for processing.
     */
    ensureProcessable(payment) {
        if (payment.status !== paymentStatus_enum_1.PaymentStatus.CREATED) {
            throw new PaymentError_1.PaymentError(`Payment cannot be processed from status "${payment.status}".`);
        }
    }
    /* -------------------------------------------------------------------------- */
    /* Processing                                                                 */
    /* -------------------------------------------------------------------------- */
    /**
     * Delegates execution to the configured payment provider.
     */
    async processWithProvider(payment) {
        const providerResult = await this.providers.process(payment);
        if (!providerResult.success) {
            const failedPayment = await this.failPayment(payment, paymentFailureReason_enum_1.PaymentFailureReason.PROVIDER_ERROR, providerResult.message);
            return {
                success: false,
                payment: failedPayment,
                message: providerResult.message ?? "Payment provider processing failed.",
            };
        }
        if (providerResult.providerPayload) {
            await this.payments.updateProviderPayload(payment._id.toString(), providerResult.providerPayload);
        }
        await this.payments.updateProviderReferences(payment._id.toString(), {
            authorizationId: providerResult.authorizationId,
            providerPaymentId: providerResult.providerPaymentId,
            providerOrderId: providerResult.providerOrderId,
            providerTransactionId: providerResult.providerTransactionId,
            settlementId: providerResult.settlementId,
        });
        const synchronizedPayment = await this.synchronizeProviderState(payment, providerResult);
        const processedPayment = await this.continuePaymentLifecycle(synchronizedPayment, providerResult);
        return {
            success: true,
            payment: processedPayment,
            message: providerResult.message ?? "Payment processed successfully.",
        };
    }
    /**
     * Processes a payment.
     *
     * Flow
     * ----
     * 1. Load payment
     * 2. Validate eligibility
     * 3. Mark INITIALIZING
     * 4. Execute provider
     * 5. Synchronize provider state
     * 6. Continue remaining lifecycle
     * 7. Return final payment
     */
    async processPayment(paymentId) {
        const payment = await this.getPayment(paymentId);
        this.ensureProcessable(payment);
        try {
            const initializing = await this.payments.markInitializing(payment._id.toString());
            return await this.processWithProvider(initializing);
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : "Unknown payment processing error.";
            const failedPayment = await this.payments.markFailed(payment._id.toString(), paymentFailureReason_enum_1.PaymentFailureReason.INTERNAL_ERROR, message);
            return {
                success: false,
                payment: failedPayment,
                message,
            };
        }
    }
    /**
     * Processes multiple payments sequentially.
     */
    async processPayments(paymentIds) {
        const results = [];
        for (const paymentId of paymentIds) {
            results.push(await this.processPayment(paymentId));
        }
        return results;
    }
    /**
     * Determines whether a payment can be processed.
     */
    async canProcess(paymentId) {
        const payment = await this.getPayment(paymentId);
        return payment.status === paymentStatus_enum_1.PaymentStatus.CREATED;
    }
    /**
     * Returns the current processing state.
     */
    async getProcessingState(paymentId) {
        const payment = await this.getPayment(paymentId);
        return payment.status;
    }
    /* -------------------------------------------------------------------------- */
    /* Lifecycle Helpers                                                          */
    /* -------------------------------------------------------------------------- */
    /**
     * Synchronizes the payment state with the provider-reported
     * lifecycle state before local orchestration continues.
     */
    async synchronizeProviderState(payment, providerResult) {
        const providerStatus = providerResult.status ?? paymentStatus_enum_1.PaymentStatus.AUTHORIZED;
        switch (providerStatus) {
            case paymentStatus_enum_1.PaymentStatus.PENDING:
                return this.payments.markPending(payment._id.toString());
            case paymentStatus_enum_1.PaymentStatus.AUTHORIZED:
                return this.payments.markAuthorized(payment._id.toString(), providerResult.authorizationId ?? `AUTH-${Date.now()}`);
            case paymentStatus_enum_1.PaymentStatus.CAPTURED:
                return this.payments.markCaptured(payment._id.toString(), providerResult.providerTransactionId ?? `TXN-${Date.now()}`);
            case paymentStatus_enum_1.PaymentStatus.SETTLED:
                return this.payments.markSettled(payment._id.toString(), providerResult.settlementId ?? `SET-${Date.now()}`);
            default:
                throw new PaymentError_1.PaymentError(`Unsupported provider status "${providerStatus}".`);
        }
    }
    /**
     * Marks the payment as authorized.
     *
     * Provider-generated authorization identifiers are reused
     * whenever available. Internal providers may generate a
     * fallback identifier.
     */
    async authorizePayment(payment, authorizationId) {
        return this.payments.markAuthorized(payment._id.toString(), authorizationId ?? `AUTH-${Date.now()}`);
    }
    /**
     * Marks the payment as captured.
     *
     * Provider-generated transaction identifiers are reused
     * whenever available.
     */
    async capturePayment(payment, providerTransactionId) {
        return this.payments.markCaptured(payment._id.toString(), providerTransactionId ?? `TXN-${Date.now()}`);
    }
    /**
     * Marks the payment as settled.
     *
     * This method only updates payment state.
     *
     * Ledger posting, wallet synchronization,
     * settlements and earnings distribution are
     * implemented in later Financial phases.
     */
    async settlePayment(payment, settlementId) {
        return this.payments.markSettled(payment._id.toString(), settlementId ?? `SET-${Date.now()}`);
    }
    /**
     * Continues the payment lifecycle from the
     * provider-reported state.
     */
    async continuePaymentLifecycle(payment, providerResult) {
        const providerStatus = providerResult.status ?? paymentStatus_enum_1.PaymentStatus.AUTHORIZED;
        switch (providerStatus) {
            case paymentStatus_enum_1.PaymentStatus.PENDING:
                return this.completeFromPending(payment, providerResult);
            case paymentStatus_enum_1.PaymentStatus.AUTHORIZED:
                return this.completeFromAuthorized(payment, providerResult);
            case paymentStatus_enum_1.PaymentStatus.CAPTURED:
                return this.completeFromCaptured(payment, providerResult);
            case paymentStatus_enum_1.PaymentStatus.SETTLED:
                return payment;
            default:
                throw new PaymentError_1.PaymentError(`Unsupported provider lifecycle state "${providerStatus}".`);
        }
    }
    /**
     * Continues processing from PENDING.
     *
     * Remaining flow:
     *
     * PENDING
     *      ↓
     * AUTHORIZED
     *      ↓
     * CAPTURED
     *      ↓
     * SETTLED
     */
    async completeFromPending(payment, providerResult) {
        const authorized = await this.authorizePayment(payment, providerResult.authorizationId);
        return this.completeFromAuthorized(authorized, providerResult);
    }
    /**
     * Continues processing from AUTHORIZED.
     *
     * Remaining flow:
     *
     * AUTHORIZED
     *      ↓
     * CAPTURED
     *      ↓
     * SETTLED
     */
    async completeFromAuthorized(payment, providerResult) {
        const captured = await this.capturePayment(payment, providerResult.providerTransactionId);
        return this.completeFromCaptured(captured, providerResult);
    }
    /**
     * Continues processing from CAPTURED.
     *
     * Remaining flow:
     *
     * CAPTURED
     *      ↓
     * SETTLED
     */
    async completeFromCaptured(payment, providerResult) {
        return this.settlePayment(payment, providerResult.settlementId);
    }
    /* -------------------------------------------------------------------------- */
    /* Failure / Cancellation / Retry                                             */
    /* -------------------------------------------------------------------------- */
    /**
     * Marks a payment as failed.
     */
    async failPayment(payment, reason, message) {
        return this.payments.markFailed(payment._id.toString(), reason, message);
    }
    /**
     * Cancels a payment.
     *
     * Only unsettled payments may be cancelled.
     */
    async cancelPayment(paymentId) {
        const payment = await this.getPayment(paymentId);
        switch (payment.status) {
            case paymentStatus_enum_1.PaymentStatus.CREATED:
            case paymentStatus_enum_1.PaymentStatus.INITIALIZING:
            case paymentStatus_enum_1.PaymentStatus.PENDING:
            case paymentStatus_enum_1.PaymentStatus.AUTHORIZED:
            case paymentStatus_enum_1.PaymentStatus.CAPTURED:
                break;
            default:
                throw new PaymentError_1.PaymentError(`Payment cannot be cancelled from status "${payment.status}".`);
        }
        const cancelled = await this.payments.markCancelled(payment._id.toString());
        return {
            success: true,
            payment: cancelled,
            message: "Payment cancelled successfully.",
        };
    }
    /**
     * Determines whether a payment may be retried.
     */
    async canRetry(paymentId) {
        const payment = await this.getPayment(paymentId);
        return payment.retryable && payment.status === paymentStatus_enum_1.PaymentStatus.FAILED;
    }
    /**
     * Re-processes a previously failed payment.
     */
    async retryPayment(paymentId) {
        const payment = await this.getPayment(paymentId);
        if (!payment.retryable) {
            throw new PaymentError_1.PaymentError("Payment retries are disabled.");
        }
        if (payment.status !== paymentStatus_enum_1.PaymentStatus.FAILED) {
            throw new PaymentError_1.PaymentError("Only failed payments can be retried.");
        }
        await this.payments.updateStatus(payment._id.toString(), paymentStatus_enum_1.PaymentStatus.CREATED);
        return this.processPayment(payment._id.toString());
    }
    /**
     * Permanently disables payment retries.
     */
    async disableRetries(paymentId) {
        return this.payments.setRetryable(paymentId, false);
    }
}
exports.PaymentProcessingService = PaymentProcessingService;
exports.paymentProcessingService = new PaymentProcessingService();
