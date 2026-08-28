"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingSettlementReleaseError = void 0;
class BookingSettlementReleaseError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = "BookingSettlementReleaseError";
        this.statusCode = code === "BOOKING_SETTLEMENT_RELEASE_BOOKING_NOT_FOUND" ? 404 : 409;
    }
}
exports.BookingSettlementReleaseError = BookingSettlementReleaseError;
