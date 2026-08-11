"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingCreatorSettlementFailureClassification = void 0;
var BookingCreatorSettlementFailureClassification;
(function (BookingCreatorSettlementFailureClassification) {
    BookingCreatorSettlementFailureClassification["HEALTHY"] = "HEALTHY";
    BookingCreatorSettlementFailureClassification["REPLAY_REQUIRED"] = "REPLAY_REQUIRED";
    BookingCreatorSettlementFailureClassification["PENDING"] = "PENDING";
    BookingCreatorSettlementFailureClassification["CORRUPTED_LEDGER"] = "CORRUPTED_LEDGER";
    BookingCreatorSettlementFailureClassification["CORRUPTED_PROJECTION"] = "CORRUPTED_PROJECTION";
    BookingCreatorSettlementFailureClassification["CORRUPTED_SETTLEMENT"] = "CORRUPTED_SETTLEMENT";
    BookingCreatorSettlementFailureClassification["MISSING_AUDIT"] = "MISSING_AUDIT";
    BookingCreatorSettlementFailureClassification["INTEGRITY_FAILURE"] = "INTEGRITY_FAILURE";
    BookingCreatorSettlementFailureClassification["UNKNOWN"] = "UNKNOWN";
})(BookingCreatorSettlementFailureClassification || (exports.BookingCreatorSettlementFailureClassification = BookingCreatorSettlementFailureClassification = {}));
