"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveBookingWalletCaptureIdentity = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const digest = (namespace, parts) => node_crypto_1.default.createHash("sha256").update([namespace, ...parts].join("|")).digest("hex");
const deriveBookingWalletCaptureIdentity = (input) => {
    const parts = [
        input.reservationKey,
        input.reservationReference,
        input.authorizationTransactionId,
        input.bookingId.toString(),
        input.bookingReference,
        "COMPLETED",
        input.paymentId.toString(),
        input.paymentReference,
        input.userId.toString(),
        input.walletId.toString(),
        input.creatorId.toString(),
        input.serviceId.toString(),
        input.amount.toString(),
        input.currency,
        input.cause,
    ];
    const captureFingerprint = digest("booking-wallet-capture:v1", parts);
    const short = captureFingerprint.slice(0, 24).toUpperCase();
    const captureTransactionId = `escrow-capture:${input.paymentReference}`;
    return {
        captureFingerprint,
        captureKey: `booking-wallet-capture:${captureFingerprint}`,
        captureReference: `BFRC-${short}`,
        captureTransactionId,
        reservedPostingKey: `${captureTransactionId}:customer-debit`,
        clearingPostingKey: `${captureTransactionId}:escrow-credit`,
        projectionOperationKey: `booking-wallet-capture:projection:${captureFingerprint}`,
    };
};
exports.deriveBookingWalletCaptureIdentity = deriveBookingWalletCaptureIdentity;
