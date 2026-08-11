"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveBookingCreatorSettlementIdentity = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const hash = (value) => node_crypto_1.default.createHash("sha256").update(value).digest("hex");
const deriveBookingCreatorSettlementIdentity = (input) => {
    const settlementFingerprint = hash(JSON.stringify({
        version: 1,
        allocationId: input.allocationId.toString(),
        allocationReference: input.allocationReference,
        bookingId: input.bookingId.toString(),
        bookingReference: input.bookingReference,
        paymentId: input.paymentId.toString(),
        paymentReference: input.paymentReference,
        reservationId: input.reservationId.toString(),
        reservationReference: input.reservationReference,
        customerUserId: input.customerUserId.toString(),
        creatorId: input.creatorId.toString(),
        creatorUserId: input.creatorUserId.toString(),
        creatorWalletId: input.creatorWalletId.toString(),
        bookingAmount: input.bookingAmount,
        currency: input.currency,
        commissionAmount: input.commissionAmount,
        creatorAmount: input.creatorAmount,
        captureTransactionId: input.captureTransactionId,
        allocationTransactionId: input.allocationTransactionId,
    }));
    const settlementKey = `booking-creator-settlement:${settlementFingerprint}`;
    const settlementReference = `BCS-${settlementFingerprint.slice(0, 20).toUpperCase()}`;
    const settlementTransactionId = `creator-wallet-settlement:${input.allocationReference}`;
    const projectionOperationKey = `${settlementTransactionId}:wallet-projection`;
    const settlementProjectionOperationReference = `WPO-${hash(projectionOperationKey).slice(0, 16).toUpperCase()}`;
    return {
        settlementFingerprint,
        settlementKey,
        settlementReference,
        settlementTransactionId,
        creatorPayableDebitPostingKey: `${settlementTransactionId}:creator-payable-debit`,
        walletAvailableCreditPostingKey: `${settlementTransactionId}:wallet-available-credit`,
        projectionOperationKey,
        settlementProjectionOperationReference,
    };
};
exports.deriveBookingCreatorSettlementIdentity = deriveBookingCreatorSettlementIdentity;
