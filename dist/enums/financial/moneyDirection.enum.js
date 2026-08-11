"use strict";
// backend/src/enums/financial/moneyDirection.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.MoneyDirection = void 0;
/**
 * Represents the direction of a monetary movement within the
 * Financial Domain.
 *
 * These values are shared by the Ledger, Transactions, Creator
 * Balances, Settlements, Payouts, Reporting, and Audit modules.
 *
 * The direction is always interpreted relative to the account or
 * financial entity receiving the ledger entry.
 */
var MoneyDirection;
(function (MoneyDirection) {
    /**
     * Money increases the balance of the target account.
     */
    MoneyDirection["CREDIT"] = "CREDIT";
    /**
     * Money decreases the balance of the target account.
     */
    MoneyDirection["DEBIT"] = "DEBIT";
})(MoneyDirection || (exports.MoneyDirection = MoneyDirection = {}));
