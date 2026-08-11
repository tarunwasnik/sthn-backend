"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingCreatorSettlementOperationalError = void 0;
class BookingCreatorSettlementOperationalError extends Error {
    constructor(message, code, cause) {
        super(message);
        this.name = "BookingCreatorSettlementOperationalError";
        this.code = code;
        this.statusCode = code.endsWith("_NOT_FOUND") ? 404 : 409;
        this.cause = cause;
    }
}
exports.BookingCreatorSettlementOperationalError = BookingCreatorSettlementOperationalError;
