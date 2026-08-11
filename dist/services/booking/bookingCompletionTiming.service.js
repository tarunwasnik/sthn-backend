"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SETTLEMENT_HOLD_MS = void 0;
exports.createBookingCompletionTiming = createBookingCompletionTiming;
exports.SETTLEMENT_HOLD_MS = 72 * 60 * 60 * 1000;
/** One UTC timestamp policy shared by manual and scheduled completion. */
function createBookingCompletionTiming(completedAt = new Date()) {
    return {
        completedAt,
        settlementEligibleAt: new Date(completedAt.getTime() + exports.SETTLEMENT_HOLD_MS),
    };
}
