"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingTerminationError = void 0;
class BookingTerminationError extends Error {
    constructor(message, code = "BOOKING_TERMINATION_ERROR", statusCode = 400) {
        super(message);
        this.name = "BookingTerminationError";
        this.code = code;
        this.statusCode = statusCode;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.BookingTerminationError = BookingTerminationError;
