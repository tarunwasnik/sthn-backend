"use strict";
// backend/src/enums/financial/transactionType.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionType = void 0;
/**
 * Represents the canonical business transaction types within the
 * Financial Domain.
 *
 * A transaction records a business financial operation. Multiple
 * immutable ledger entries may be produced from a single transaction.
 * These values are shared across payments, refunds, settlements,
 * payouts, reconciliation, reporting, and auditing.
 */
var TransactionType;
(function (TransactionType) {
    /**
     * Customer payment for a booking.
     */
    TransactionType["PAYMENT"] = "PAYMENT";
    /**
     * Customer refund.
     */
    TransactionType["REFUND"] = "REFUND";
    /**
     * Settlement of captured payment.
     */
    TransactionType["SETTLEMENT"] = "SETTLEMENT";
    /**
     * Creator payout.
     */
    TransactionType["PAYOUT"] = "PAYOUT";
    /**
     * Platform commission allocation.
     */
    TransactionType["COMMISSION"] = "COMMISSION";
    /**
     * Creator earning allocation.
     */
    TransactionType["CREATOR_EARNING"] = "CREATOR_EARNING";
    /**
     * Manual financial adjustment.
     */
    TransactionType["ADJUSTMENT"] = "ADJUSTMENT";
    /**
     * Correction of a previous financial transaction.
     */
    TransactionType["CORRECTION"] = "CORRECTION";
    /**
     * Reversal of a previous financial transaction.
     */
    TransactionType["REVERSAL"] = "REVERSAL";
    /**
     * Internal balance transfer.
     */
    TransactionType["BALANCE_TRANSFER"] = "BALANCE_TRANSFER";
    /**
     * Financial reconciliation adjustment.
     */
    TransactionType["RECONCILIATION"] = "RECONCILIATION";
})(TransactionType || (exports.TransactionType = TransactionType = {}));
