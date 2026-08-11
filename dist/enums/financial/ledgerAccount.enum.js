"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerAccount = void 0;
/**
 * Financial ownership buckets.  Entries are immutable; an account balance is
 * derived from credits less debits for the same currency.
 */
var LedgerAccount;
(function (LedgerAccount) {
    LedgerAccount["WALLET_TOP_UP"] = "WALLET_TOP_UP";
    LedgerAccount["WALLET_AVAILABLE"] = "WALLET_AVAILABLE";
    LedgerAccount["WALLET_RESERVED"] = "WALLET_RESERVED";
    LedgerAccount["WITHDRAWAL_RESERVED"] = "WITHDRAWAL_RESERVED";
    LedgerAccount["CASH"] = "CASH";
    LedgerAccount["CUSTOMER_CAPTURE"] = "CUSTOMER_CAPTURE";
    LedgerAccount["PLATFORM_ESCROW"] = "PLATFORM_ESCROW";
    LedgerAccount["PLATFORM_COMMISSION_PAYABLE"] = "PLATFORM_COMMISSION_PAYABLE";
    LedgerAccount["PLATFORM_SERVICE_FEE_REVENUE"] = "PLATFORM_SERVICE_FEE_REVENUE";
    LedgerAccount["CREATOR_PAYABLE"] = "CREATOR_PAYABLE";
    LedgerAccount["CUSTOMER_REFUND"] = "CUSTOMER_REFUND";
    LedgerAccount["CREATOR_AVAILABLE"] = "CREATOR_AVAILABLE";
    LedgerAccount["CREATOR_PAYOUT_RESERVED"] = "CREATOR_PAYOUT_RESERVED";
    LedgerAccount["PAYOUT_CLEARING"] = "PAYOUT_CLEARING";
    LedgerAccount["PLATFORM_CUSTOMER_FEE_REVENUE"] = "PLATFORM_CUSTOMER_FEE_REVENUE";
    LedgerAccount["PLATFORM_CREATOR_COMMISSION_REVENUE"] = "PLATFORM_CREATOR_COMMISSION_REVENUE";
})(LedgerAccount || (exports.LedgerAccount = LedgerAccount = {}));
