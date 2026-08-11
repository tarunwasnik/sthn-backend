"use strict";
// backend/src/constants/financial/financialMessages.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.FINANCIAL_MESSAGES = void 0;
/**
 * Centralized financial messages.
 *
 * These messages are intended for:
 * - Service responses
 * - Validation
 * - Logging
 * - Exceptions
 * - Background jobs
 *
 * Keep messages generic and provider-independent.
 */
exports.FINANCIAL_MESSAGES = {
    /* =========================================================
       Validation
    ========================================================= */
    INVALID_AMOUNT: "Invalid transaction amount.",
    INVALID_CURRENCY: "Unsupported currency.",
    INVALID_PAYMENT_STATUS: "Invalid payment status.",
    INVALID_REFUND_STATUS: "Invalid refund status.",
    INVALID_SETTLEMENT_STATUS: "Invalid settlement status.",
    INVALID_PAYOUT_STATUS: "Invalid payout status.",
    AMOUNT_TOO_SMALL: "Transaction amount is below the minimum limit.",
    AMOUNT_TOO_LARGE: "Transaction amount exceeds the maximum limit.",
    /* =========================================================
       Payment
    ========================================================= */
    PAYMENT_CREATED: "Payment created successfully.",
    PAYMENT_INITIALIZED: "Payment initialized successfully.",
    PAYMENT_AUTHORIZED: "Payment authorized successfully.",
    PAYMENT_CAPTURED: "Payment captured successfully.",
    PAYMENT_SETTLED: "Payment settled successfully.",
    PAYMENT_FAILED: "Payment failed.",
    PAYMENT_CANCELLED: "Payment cancelled.",
    PAYMENT_EXPIRED: "Payment expired.",
    PAYMENT_ALREADY_COMPLETED: "Payment has already been completed.",
    PAYMENT_NOT_RETRYABLE: "Payment cannot be retried.",
    /* =========================================================
       Refund
    ========================================================= */
    REFUND_CREATED: "Refund created successfully.",
    REFUND_APPROVED: "Refund approved.",
    REFUND_REJECTED: "Refund rejected.",
    REFUND_PROCESSING: "Refund is being processed.",
    REFUND_COMPLETED: "Refund completed successfully.",
    REFUND_FAILED: "Refund failed.",
    REFUND_NOT_ALLOWED: "Refund is not allowed for this transaction.",
    /* =========================================================
       Settlement
    ========================================================= */
    SETTLEMENT_CREATED: "Settlement created successfully.",
    SETTLEMENT_COMPLETED: "Settlement completed successfully.",
    SETTLEMENT_FAILED: "Settlement failed.",
    /* =========================================================
       Payout
    ========================================================= */
    PAYOUT_CREATED: "Payout created successfully.",
    PAYOUT_QUEUED: "Payout queued successfully.",
    PAYOUT_PROCESSING: "Payout is being processed.",
    PAYOUT_COMPLETED: "Payout completed successfully.",
    PAYOUT_FAILED: "Payout failed.",
    PAYOUT_CANCELLED: "Payout cancelled.",
    /* =========================================================
       Booking Financial
    ========================================================= */
    BOOKING_NOT_PAYABLE: "Booking is not payable.",
    BOOKING_ALREADY_PAYABLE: "Booking is already payable.",
    BOOKING_FINANCIALLY_LOCKED: "Booking is financially locked.",
    BOOKING_FINANCIALLY_UNLOCKED: "Booking financial lock released.",
    /* =========================================================
       Ledger
    ========================================================= */
    LEDGER_ENTRY_CREATED: "Ledger entry created successfully.",
    /* =========================================================
       Creator Balance
    ========================================================= */
    CREATOR_BALANCE_UPDATED: "Creator balance updated successfully.",
    /* =========================================================
       Audit
    ========================================================= */
    FINANCIAL_AUDIT_CREATED: "Financial audit record created.",
    /* =========================================================
       General
    ========================================================= */
    OPERATION_SUCCESSFUL: "Financial operation completed successfully.",
    OPERATION_FAILED: "Financial operation failed.",
    DUPLICATE_REQUEST: "Duplicate financial request detected.",
    IDEMPOTENCY_CONFLICT: "Idempotency conflict detected.",
    INTERNAL_ERROR: "An internal financial error occurred.",
};
