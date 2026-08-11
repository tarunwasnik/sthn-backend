"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingCreatorSettlementError = void 0;
const statusFor = (code) => {
    if ([
        "BOOKING_CREATOR_SETTLEMENT_BOOKING_NOT_FOUND",
        "BOOKING_CREATOR_SETTLEMENT_PAYMENT_NOT_FOUND",
        "BOOKING_CREATOR_SETTLEMENT_RESERVATION_NOT_FOUND",
        "BOOKING_CREATOR_SETTLEMENT_ALLOCATION_NOT_FOUND",
        "BOOKING_CREATOR_SETTLEMENT_CREATOR_NOT_FOUND",
        "BOOKING_CREATOR_SETTLEMENT_WALLET_NOT_FOUND",
    ].includes(code))
        return 404;
    if (code === "BOOKING_CREATOR_SETTLEMENT_INTEGRITY_ERROR")
        return 500;
    return 409;
};
class BookingCreatorSettlementError extends Error {
    constructor(message, code, options = {}) {
        super(message);
        this.name = "BookingCreatorSettlementError";
        this.code = code;
        this.statusCode = statusFor(code);
        this.cause = options.cause;
    }
}
exports.BookingCreatorSettlementError = BookingCreatorSettlementError;
