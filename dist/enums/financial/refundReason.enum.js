"use strict";
// backend/src/enums/financial/refundReason.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefundReason = void 0;
/**
 * Canonical reasons for initiating a refund.
 *
 * These reasons are used throughout the Financial Domain for validation,
 * auditing, reporting, automation, and analytics. Provider-specific
 * reasons should be mapped to one of these values.
 */
var RefundReason;
(function (RefundReason) {
    /**
     * Booking was cancelled by the customer.
     */
    RefundReason["USER_CANCELLATION"] = "USER_CANCELLATION";
    /**
     * Booking was cancelled by the creator.
     */
    RefundReason["CREATOR_CANCELLATION"] = "CREATOR_CANCELLATION";
    /**
     * Booking request expired before acceptance.
     */
    RefundReason["BOOKING_EXPIRED"] = "BOOKING_EXPIRED";
    /**
     * Booking was rejected.
     */
    RefundReason["BOOKING_REJECTED"] = "BOOKING_REJECTED";
    /**
     * Refund approved after dispute resolution.
     */
    RefundReason["DISPUTE_RESOLUTION"] = "DISPUTE_RESOLUTION";
    /**
     * Manual administrative adjustment.
     */
    RefundReason["ADMIN_ADJUSTMENT"] = "ADMIN_ADJUSTMENT";
    /**
     * Duplicate payment detected.
     */
    RefundReason["DUPLICATE_PAYMENT"] = "DUPLICATE_PAYMENT";
    /**
     * Incorrect payment amount.
     */
    RefundReason["INCORRECT_AMOUNT"] = "INCORRECT_AMOUNT";
    /**
     * Fraud or security-related refund.
     */
    RefundReason["FRAUD_SUSPECTED"] = "FRAUD_SUSPECTED";
    /**
     * Payment processing error.
     */
    RefundReason["PAYMENT_ERROR"] = "PAYMENT_ERROR";
    /**
     * Service was unavailable or not delivered.
     */
    RefundReason["SERVICE_UNAVAILABLE"] = "SERVICE_UNAVAILABLE";
    /**
     * Other refund reason not covered by predefined values.
     */
    RefundReason["OTHER"] = "OTHER";
})(RefundReason || (exports.RefundReason = RefundReason = {}));
