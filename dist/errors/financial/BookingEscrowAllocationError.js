"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingEscrowAllocationError = void 0;
const statusFor = (code) => {
    if ([
        "BOOKING_ESCROW_ALLOCATION_BOOKING_NOT_FOUND",
        "BOOKING_ESCROW_ALLOCATION_PAYMENT_NOT_FOUND",
        "BOOKING_ESCROW_ALLOCATION_RESERVATION_NOT_FOUND",
    ].includes(code))
        return 404;
    if (code === "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR")
        return 500;
    return 409;
};
class BookingEscrowAllocationError extends Error {
    constructor(message, code, options = {}) {
        super(message);
        this.name = "BookingEscrowAllocationError";
        this.code = code;
        this.statusCode = statusFor(code);
        this.cause = options.cause;
    }
}
exports.BookingEscrowAllocationError = BookingEscrowAllocationError;
