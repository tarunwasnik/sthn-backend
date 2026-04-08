"use strict";
//backend/src/services/interactionGuards.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertCancellationAllowed = exports.assertRefundAllowed = exports.InteractionGuardError = void 0;
const booking_model_1 = require("../models/booking.model");
class InteractionGuardError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
exports.InteractionGuardError = InteractionGuardError;
/**
 * Throws if refund is not allowed
 */
const assertRefundAllowed = async (bookingId) => {
    const booking = await booking_model_1.Booking.findById(bookingId).select("hasInteracted");
    if (!booking)
        throw new Error("Booking not found");
    if (booking.hasInteracted) {
        throw new InteractionGuardError("REFUND_LOCKED", "Refunds are locked after interaction has started");
    }
};
exports.assertRefundAllowed = assertRefundAllowed;
/**
 * Throws if cancellation is not allowed
 */
const assertCancellationAllowed = async (bookingId) => {
    const booking = await booking_model_1.Booking.findById(bookingId).select("hasInteracted");
    if (!booking)
        throw new Error("Booking not found");
    if (booking.hasInteracted) {
        throw new InteractionGuardError("CANCELLATION_LOCKED", "Cancellations are locked after interaction has started");
    }
};
exports.assertCancellationAllowed = assertCancellationAllowed;
