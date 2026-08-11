"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveBookingWalletReleaseIdentity = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const digest = (namespace, parts) => node_crypto_1.default.createHash("sha256").update([namespace, ...parts].join("|")).digest("hex");
const deriveBookingWalletReleaseIdentity = (input) => {
    const parts = [
        input.reservationKey,
        input.reservationReference,
        input.authorizationTransactionId,
        input.bookingId.toString(),
        input.bookingReference,
        input.bookingStatus,
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
    const releaseFingerprint = digest("booking-wallet-release:v1", parts);
    const short = releaseFingerprint.slice(0, 24).toUpperCase();
    return {
        releaseFingerprint,
        releaseKey: `booking-wallet-release:${releaseFingerprint}`,
        releaseReference: `BFRR-${short}`,
        releaseTransactionId: `BFRR-TXN-${short}`,
        reservedPostingKey: `BFRR-RESERVED-${releaseFingerprint}`,
        availablePostingKey: `BFRR-AVAILABLE-${releaseFingerprint}`,
        projectionOperationKey: `booking-wallet-release:projection:${releaseFingerprint}`,
    };
};
exports.deriveBookingWalletReleaseIdentity = deriveBookingWalletReleaseIdentity;
