"use strict";
// backend/src/enums/financial/ledgerSource.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerSource = void 0;
/**
 * Identifies the originating source responsible for creating
 * an immutable ledger entry.
 *
 * While LedgerEntryType describes the business nature of the
 * financial movement, LedgerSource identifies the subsystem
 * or workflow that produced the entry.
 */
var LedgerSource;
(function (LedgerSource) {
    LedgerSource["INTERNAL_TOP_UP_FUNDING"] = "INTERNAL_TOP_UP_FUNDING";
    LedgerSource["BOOKING_WALLET_AUTHORIZATION"] = "BOOKING_WALLET_AUTHORIZATION";
    LedgerSource["BOOKING_WALLET_RESERVATION_RELEASE"] = "BOOKING_WALLET_RESERVATION_RELEASE";
    LedgerSource["BOOKING_WALLET_CAPTURE"] = "BOOKING_WALLET_CAPTURE";
    LedgerSource["BOOKING_ESCROW_ALLOCATION"] = "BOOKING_ESCROW_ALLOCATION";
    LedgerSource["BOOKING_CREATOR_WALLET_SETTLEMENT"] = "BOOKING_CREATOR_WALLET_SETTLEMENT";
    LedgerSource["CREATOR_WITHDRAWAL_RESERVATION"] = "CREATOR_WITHDRAWAL_RESERVATION";
    LedgerSource["WITHDRAWAL_PROVIDER_FINALIZATION"] = "WITHDRAWAL_PROVIDER_FINALIZATION";
    LedgerSource["WALLET_CONVERSION"] = "WALLET_CONVERSION";
    /**
     * Payment lifecycle.
     */
    LedgerSource["PAYMENT"] = "PAYMENT";
    /**
     * Refund lifecycle.
     */
    LedgerSource["REFUND"] = "REFUND";
    /**
     * Settlement lifecycle.
     */
    LedgerSource["SETTLEMENT"] = "SETTLEMENT";
    /**
     * Creator payout lifecycle.
     */
    LedgerSource["PAYOUT"] = "PAYOUT";
    /**
     * Booking financial state transition.
     */
    LedgerSource["BOOKING"] = "BOOKING";
    /**
     * Creator balance recalculation.
     */
    LedgerSource["CREATOR_BALANCE"] = "CREATOR_BALANCE";
    /**
     * Financial reconciliation process.
     */
    LedgerSource["RECONCILIATION"] = "RECONCILIATION";
    /**
     * Scheduled financial automation.
     */
    LedgerSource["SCHEDULER"] = "SCHEDULER";
    /**
     * Manual administrative financial operation.
     */
    LedgerSource["ADMIN"] = "ADMIN";
    /**
     * Internal system-generated operation.
     */
    LedgerSource["SYSTEM"] = "SYSTEM";
})(LedgerSource || (exports.LedgerSource = LedgerSource = {}));
