"use strict";
// backend/src/enums/financial/ledgerEntryType.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerEntryType = void 0;
/**
 * Defines the immutable category of a ledger entry.
 *
 * Every financial movement recorded within the Financial Domain
 * is persisted as an immutable ledger entry. The entry type
 * identifies the business purpose of that movement.
 *
 * Ledger entries are write-once and must never be modified
 * or deleted after creation.
 */
var LedgerEntryType;
(function (LedgerEntryType) {
    LedgerEntryType["WALLET_TOP_UP"] = "WALLET_TOP_UP";
    LedgerEntryType["BOOKING_FUNDS_RESERVED"] = "BOOKING_FUNDS_RESERVED";
    LedgerEntryType["BOOKING_FUNDS_RELEASED"] = "BOOKING_FUNDS_RELEASED";
    LedgerEntryType["BOOKING_FUNDS_CAPTURED"] = "BOOKING_FUNDS_CAPTURED";
    LedgerEntryType["BOOKING_ESCROW_ALLOCATED"] = "BOOKING_ESCROW_ALLOCATED";
    LedgerEntryType["BOOKING_CREATOR_SETTLED"] = "BOOKING_CREATOR_SETTLED";
    LedgerEntryType["CREATOR_WITHDRAWAL_RESERVED"] = "CREATOR_WITHDRAWAL_RESERVED";
    LedgerEntryType["CREATOR_WITHDRAWAL_COMPLETED"] = "CREATOR_WITHDRAWAL_COMPLETED";
    LedgerEntryType["CREATOR_WITHDRAWAL_FAILED_RELEASED"] = "CREATOR_WITHDRAWAL_FAILED_RELEASED";
    LedgerEntryType["WALLET_CONVERSION_COMPLETED"] = "WALLET_CONVERSION_COMPLETED";
    /**
     * Initial customer payment.
     */
    LedgerEntryType["PAYMENT"] = "PAYMENT";
    /**
     * Refund issued to the customer.
     */
    LedgerEntryType["REFUND"] = "REFUND";
    /**
     * Platform commission earned.
     */
    LedgerEntryType["COMMISSION"] = "COMMISSION";
    /**
     * Creator earnings generated from a booking.
     */
    LedgerEntryType["CREATOR_EARNING"] = "CREATOR_EARNING";
    /**
     * Settlement of captured funds.
     */
    LedgerEntryType["SETTLEMENT"] = "SETTLEMENT";
    /**
     * Creator payout.
     */
    LedgerEntryType["PAYOUT"] = "PAYOUT";
    /**
     * Manual financial adjustment.
     */
    LedgerEntryType["ADJUSTMENT"] = "ADJUSTMENT";
    /**
     * Correction to a previous financial entry.
     */
    LedgerEntryType["CORRECTION"] = "CORRECTION";
    /**
     * Reversal of a previous financial transaction.
     */
    LedgerEntryType["REVERSAL"] = "REVERSAL";
    /**
     * Administrative write-off.
     */
    LedgerEntryType["WRITE_OFF"] = "WRITE_OFF";
    /**
     * Administrative credit.
     */
    LedgerEntryType["CREDIT"] = "CREDIT";
    /**
     * Administrative debit.
     */
    LedgerEntryType["DEBIT"] = "DEBIT";
})(LedgerEntryType || (exports.LedgerEntryType = LedgerEntryType = {}));
