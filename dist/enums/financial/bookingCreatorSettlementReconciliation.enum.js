"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingCreatorSettlementRepairAction = exports.BookingCreatorSettlementReconciliationResult = exports.BookingCreatorSettlementReconciliationStatus = void 0;
var BookingCreatorSettlementReconciliationStatus;
(function (BookingCreatorSettlementReconciliationStatus) {
    BookingCreatorSettlementReconciliationStatus["OPEN"] = "OPEN";
    BookingCreatorSettlementReconciliationStatus["RESOLVED"] = "RESOLVED";
})(BookingCreatorSettlementReconciliationStatus || (exports.BookingCreatorSettlementReconciliationStatus = BookingCreatorSettlementReconciliationStatus = {}));
var BookingCreatorSettlementReconciliationResult;
(function (BookingCreatorSettlementReconciliationResult) {
    BookingCreatorSettlementReconciliationResult["VALID"] = "VALID";
    BookingCreatorSettlementReconciliationResult["ISSUES_FOUND"] = "ISSUES_FOUND";
})(BookingCreatorSettlementReconciliationResult || (exports.BookingCreatorSettlementReconciliationResult = BookingCreatorSettlementReconciliationResult = {}));
var BookingCreatorSettlementRepairAction;
(function (BookingCreatorSettlementRepairAction) {
    BookingCreatorSettlementRepairAction["RESTORE_MISSING_AUDIT"] = "RESTORE_MISSING_AUDIT";
    BookingCreatorSettlementRepairAction["RESTORE_REPLAY_METADATA"] = "RESTORE_REPLAY_METADATA";
})(BookingCreatorSettlementRepairAction || (exports.BookingCreatorSettlementRepairAction = BookingCreatorSettlementRepairAction = {}));
