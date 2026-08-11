"use strict";
// backend/src/enums/financial/paymentFailureReason.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentFailureReason = void 0;
/**
 * Canonical reasons describing why a payment could not be completed.
 *
 * These values are provider-independent. Any provider-specific failure
 * codes should be mapped to one of these reasons by the payment provider
 * implementation before entering the Financial Domain.
 */
var PaymentFailureReason;
(function (PaymentFailureReason) {
    /**
     * No failure has occurred.
     */
    PaymentFailureReason["NONE"] = "NONE";
    /**
     * Authorization was declined.
     */
    PaymentFailureReason["AUTHORIZATION_DECLINED"] = "AUTHORIZATION_DECLINED";
    /**
     * Capture operation failed.
     */
    PaymentFailureReason["CAPTURE_FAILED"] = "CAPTURE_FAILED";
    /**
     * Settlement failed.
     */
    PaymentFailureReason["SETTLEMENT_FAILED"] = "SETTLEMENT_FAILED";
    /**
     * Payment expired before completion.
     */
    PaymentFailureReason["PAYMENT_EXPIRED"] = "PAYMENT_EXPIRED";
    /**
     * Payment was cancelled.
     */
    PaymentFailureReason["PAYMENT_CANCELLED"] = "PAYMENT_CANCELLED";
    /**
     * Duplicate payment or idempotency conflict.
     */
    PaymentFailureReason["DUPLICATE_PAYMENT"] = "DUPLICATE_PAYMENT";
    /**
     * Invalid payment request.
     */
    PaymentFailureReason["VALIDATION_FAILED"] = "VALIDATION_FAILED";
    /**
     * Currency mismatch.
     */
    PaymentFailureReason["CURRENCY_MISMATCH"] = "CURRENCY_MISMATCH";
    /**
     * Amount mismatch.
     */
    PaymentFailureReason["AMOUNT_MISMATCH"] = "AMOUNT_MISMATCH";
    /**
     * Booking is not eligible for payment.
     */
    PaymentFailureReason["BOOKING_NOT_PAYABLE"] = "BOOKING_NOT_PAYABLE";
    /**
     * Provider communication failed.
     */
    PaymentFailureReason["PROVIDER_UNAVAILABLE"] = "PROVIDER_UNAVAILABLE";
    /**
     * Provider returned an unexpected response.
     */
    PaymentFailureReason["PROVIDER_ERROR"] = "PROVIDER_ERROR";
    /**
     * Request timed out.
     */
    PaymentFailureReason["TIMEOUT"] = "TIMEOUT";
    /**
     * Internal financial processing error.
     */
    PaymentFailureReason["INTERNAL_ERROR"] = "INTERNAL_ERROR";
    /**
     * Failure reason could not be determined.
     */
    PaymentFailureReason["UNKNOWN"] = "UNKNOWN";
})(PaymentFailureReason || (exports.PaymentFailureReason = PaymentFailureReason = {}));
