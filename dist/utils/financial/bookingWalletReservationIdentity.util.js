"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveBookingRequestIdentity = exports.deriveBookingWalletReservationIdentity = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const digest = (namespace, parts) => node_crypto_1.default.createHash("sha256").update([namespace, ...parts].join("|")).digest("hex");
const deriveBookingWalletReservationIdentity = (input) => {
    const immutableParts = [
        input.bookingId.toString(),
        input.paymentId.toString(),
        input.paymentReference,
        input.userId.toString(),
        input.walletId.toString(),
        input.creatorId.toString(),
        input.serviceId.toString(),
        input.amount.toString(),
        input.currency,
        input.method,
    ];
    const requestFingerprint = digest("booking-wallet-reservation:v1", immutableParts);
    const short = requestFingerprint.slice(0, 24).toUpperCase();
    return {
        requestFingerprint,
        reservationKey: `booking-wallet-reservation:${requestFingerprint}`,
        reservationReference: `BFR-${short}`,
        ledgerTransactionId: `BFR-TXN-${short}`,
        availablePostingKey: `BFR-AVAILABLE-${requestFingerprint}`,
        reservedPostingKey: `BFR-RESERVED-${requestFingerprint}`,
        projectionOperationKey: `booking-wallet-reservation:projection:${requestFingerprint}`,
    };
};
exports.deriveBookingWalletReservationIdentity = deriveBookingWalletReservationIdentity;
const deriveBookingRequestIdentity = (input) => {
    const requestKey = digest("booking-request-key:v1", [
        input.userId,
        input.idempotencyKey.trim(),
    ]);
    const requestFingerprint = digest("booking-request-intent:v1", [
        input.userId,
        input.serviceId,
        [...input.slotIds].map(String).sort().join(","),
        input.method,
    ]);
    return {
        bookingRequestKey: `booking-request:${requestKey}`,
        bookingRequestFingerprint: requestFingerprint,
        bookingReference: `BKG-${requestKey.slice(0, 24).toUpperCase()}`,
    };
};
exports.deriveBookingRequestIdentity = deriveBookingRequestIdentity;
