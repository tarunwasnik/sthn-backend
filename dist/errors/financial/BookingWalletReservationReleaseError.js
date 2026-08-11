"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingWalletReservationReleaseError = exports.BOOKING_WALLET_RELEASE_ERROR_CODES = void 0;
exports.BOOKING_WALLET_RELEASE_ERROR_CODES = [
    "BOOKING_WALLET_RELEASE_BOOKING_NOT_FOUND",
    "BOOKING_WALLET_RELEASE_PAYMENT_NOT_FOUND",
    "BOOKING_WALLET_RELEASE_RESERVATION_NOT_FOUND",
    "BOOKING_WALLET_RELEASE_INVALID_RESERVATION_STATUS",
    "BOOKING_WALLET_RELEASE_INVALID_BOOKING_STATUS",
    "BOOKING_WALLET_RELEASE_INVALID_PAYMENT_STATUS",
    "BOOKING_WALLET_RELEASE_CAUSE_CONFLICT",
    "BOOKING_WALLET_RELEASE_PAYMENT_METHOD_CONFLICT",
    "BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT",
    "BOOKING_WALLET_RELEASE_AMOUNT_CONFLICT",
    "BOOKING_WALLET_RELEASE_CURRENCY_CONFLICT",
    "BOOKING_WALLET_RELEASE_LEDGER_CONFLICT",
    "BOOKING_WALLET_RELEASE_PROJECTION_CONFLICT",
    "BOOKING_WALLET_RELEASE_INSUFFICIENT_RESERVED_BALANCE",
    "BOOKING_WALLET_RELEASE_TRANSACTION_CONFLICT",
    "BOOKING_WALLET_RELEASE_COMPLETION_CONFLICT",
    "BOOKING_WALLET_RELEASE_ALREADY_CAPTURED",
    "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR",
];
class BookingWalletReservationReleaseError extends Error {
    constructor(message, code, options) {
        super(message);
        this.code = code;
        this.name = "BookingWalletReservationReleaseError";
        this.statusCode = [
            "BOOKING_WALLET_RELEASE_BOOKING_NOT_FOUND",
            "BOOKING_WALLET_RELEASE_PAYMENT_NOT_FOUND",
            "BOOKING_WALLET_RELEASE_RESERVATION_NOT_FOUND",
        ].includes(code)
            ? 404
            : code === "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR"
                ? 500
                : 409;
        if (options?.cause !== undefined) {
            this.cause = options.cause;
        }
    }
}
exports.BookingWalletReservationReleaseError = BookingWalletReservationReleaseError;
