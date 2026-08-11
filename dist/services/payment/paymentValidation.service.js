"use strict";
// backend/src/services/payment/paymentValidation.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentValidationService = exports.PaymentValidationService = void 0;
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const paymentProvider_enum_1 = require("../../enums/financial/paymentProvider.enum");
const PaymentError_1 = require("../../errors/financial/PaymentError");
/**
 * ============================================================
 * STHN Marketplace
 * Financial Domain
 * Payment Validation Service
 * ============================================================
 *
 * Responsibility
 * --------------
 * Centralizes all payment validation rules.
 *
 * This service performs validation only.
 *
 * It NEVER:
 * - Updates payments
 * - Calls payment providers
 * - Creates ledger entries
 * - Updates wallets
 * - Changes booking state
 *
 * This service validates:
 * - Payment processing eligibility
 * - Provider support
 * - Retry eligibility
 * - Cancellation eligibility
 * - Status transitions
 * - Amount rules
 * - Currency rules
 *
 * Future phases will extend this service with:
 * - Booking validation
 * - Refund validation
 * - Settlement validation
 * - Chargeback validation
 * ============================================================
 */
class PaymentValidationService {
    /**
     * Ensures the payment may be processed.
     */
    validateProcessable(payment) {
        if (payment.status !== paymentStatus_enum_1.PaymentStatus.CREATED) {
            throw new PaymentError_1.PaymentError(`Payment cannot be processed from status "${payment.status}".`);
        }
    }
    /**
     * Ensures the payment provider is supported.
     */
    validateProvider(payment) {
        switch (payment.provider) {
            case paymentProvider_enum_1.PaymentProvider.INTERNAL:
                return;
            default:
                throw new PaymentError_1.PaymentError(`Unsupported payment provider "${payment.provider}".`);
        }
    }
    /**
     * Ensures payment amount is valid.
     */
    validateAmount(payment) {
        if (payment.amount <= 0) {
            throw new PaymentError_1.PaymentError("Payment amount must be greater than zero.");
        }
    }
    /**
     * Ensures the payment may be cancelled.
     */
    validateCancellation(payment) {
        switch (payment.status) {
            case paymentStatus_enum_1.PaymentStatus.CREATED:
            case paymentStatus_enum_1.PaymentStatus.AUTHORIZED:
            case paymentStatus_enum_1.PaymentStatus.CAPTURED:
                return;
            default:
                throw new PaymentError_1.PaymentError(`Payment cannot be cancelled from status "${payment.status}".`);
        }
    }
    /**
     * Ensures the payment may be retried.
     */
    validateRetry(payment) {
        if (!payment.retryable) {
            throw new PaymentError_1.PaymentError("Payment retries are disabled.");
        }
        if (payment.status !== paymentStatus_enum_1.PaymentStatus.FAILED) {
            throw new PaymentError_1.PaymentError("Only failed payments can be retried.");
        }
    }
    /**
     * Ensures a payment status transition is valid.
     */
    validateStatusTransition(current, next) {
        const transitions = {
            [paymentStatus_enum_1.PaymentStatus.CREATED]: [
                paymentStatus_enum_1.PaymentStatus.INITIALIZING,
                paymentStatus_enum_1.PaymentStatus.CANCELLED,
                paymentStatus_enum_1.PaymentStatus.FAILED,
                paymentStatus_enum_1.PaymentStatus.EXPIRED,
            ],
            [paymentStatus_enum_1.PaymentStatus.INITIALIZING]: [
                paymentStatus_enum_1.PaymentStatus.PENDING,
                paymentStatus_enum_1.PaymentStatus.CANCELLED,
                paymentStatus_enum_1.PaymentStatus.FAILED,
            ],
            [paymentStatus_enum_1.PaymentStatus.PENDING]: [
                paymentStatus_enum_1.PaymentStatus.AUTHORIZED,
                paymentStatus_enum_1.PaymentStatus.CANCELLED,
                paymentStatus_enum_1.PaymentStatus.FAILED,
                paymentStatus_enum_1.PaymentStatus.EXPIRED,
            ],
            [paymentStatus_enum_1.PaymentStatus.AUTHORIZED]: [
                paymentStatus_enum_1.PaymentStatus.CAPTURED,
                paymentStatus_enum_1.PaymentStatus.CANCELLED,
                paymentStatus_enum_1.PaymentStatus.FAILED,
            ],
            [paymentStatus_enum_1.PaymentStatus.CAPTURED]: [paymentStatus_enum_1.PaymentStatus.SETTLED, paymentStatus_enum_1.PaymentStatus.FAILED],
            [paymentStatus_enum_1.PaymentStatus.SETTLED]: [
                paymentStatus_enum_1.PaymentStatus.PARTIALLY_REFUNDED,
                paymentStatus_enum_1.PaymentStatus.REFUNDED,
            ],
            [paymentStatus_enum_1.PaymentStatus.PARTIALLY_REFUNDED]: [paymentStatus_enum_1.PaymentStatus.REFUNDED],
            [paymentStatus_enum_1.PaymentStatus.REFUNDED]: [],
            [paymentStatus_enum_1.PaymentStatus.FAILED]: [paymentStatus_enum_1.PaymentStatus.CREATED],
            [paymentStatus_enum_1.PaymentStatus.EXPIRED]: [],
            [paymentStatus_enum_1.PaymentStatus.CANCELLED]: [],
        };
        const allowed = transitions[current] ?? [];
        if (!allowed.includes(next)) {
            throw new PaymentError_1.PaymentError(`Invalid payment status transition from "${current}" to "${next}".`);
        }
    }
    /**
     * Ensures the payment currency is valid.
     */
    validateCurrency(payment) {
        if (!payment.currency || payment.currency.trim().length === 0) {
            throw new PaymentError_1.PaymentError("Payment currency is required.");
        }
    }
    /**
     * Runs the standard validation pipeline before payment
     * processing begins.
     */
    validate(payment) {
        this.validateAmount(payment);
        this.validateCurrency(payment);
        this.validateProvider(payment);
        this.validateProcessable(payment);
    }
}
exports.PaymentValidationService = PaymentValidationService;
exports.paymentValidationService = new PaymentValidationService();
