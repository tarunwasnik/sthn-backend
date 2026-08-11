"use strict";
// backend/src/enums/financial/settlementStatus.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettlementStatus = void 0;
/**
 * Represents the lifecycle of a financial settlement.
 *
 * A settlement is the process of moving successfully captured funds
 * into the marketplace's settled financial state, making them eligible
 * for downstream financial operations such as payability and payouts.
 */
var SettlementStatus;
(function (SettlementStatus) {
    /**
     * Settlement record has been created.
     */
    SettlementStatus["CREATED"] = "CREATED";
    /**
     * Settlement is waiting to be processed.
     */
    SettlementStatus["PENDING"] = "PENDING";
    /**
     * Settlement processing has started.
     */
    SettlementStatus["PROCESSING"] = "PROCESSING";
    /**
     * Settlement completed successfully.
     */
    SettlementStatus["COMPLETED"] = "COMPLETED";
    /**
     * Settlement failed.
     */
    SettlementStatus["FAILED"] = "FAILED";
    /**
     * Settlement was cancelled before completion.
     */
    SettlementStatus["CANCELLED"] = "CANCELLED";
    /**
     * Settlement expired before processing.
     */
    SettlementStatus["EXPIRED"] = "EXPIRED";
})(SettlementStatus || (exports.SettlementStatus = SettlementStatus = {}));
