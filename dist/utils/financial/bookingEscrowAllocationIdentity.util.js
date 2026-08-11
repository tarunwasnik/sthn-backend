"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveBookingEscrowAllocationIdentity = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const hash = (value) => node_crypto_1.default.createHash("sha256").update(value).digest("hex");
const deriveBookingEscrowAllocationIdentity = (input) => {
    const allocationFingerprint = hash(JSON.stringify({
        version: 2,
        bookingId: input.bookingId.toString(),
        bookingReference: input.bookingReference,
        paymentId: input.paymentId.toString(),
        paymentReference: input.paymentReference,
        reservationId: input.reservationId.toString(),
        reservationReference: input.reservationReference,
        customerId: input.customerId.toString(),
        creatorId: input.creatorId.toString(),
        bookingAmount: input.bookingAmount,
        serviceAmount: input.serviceAmount,
        platformFeeAmount: input.platformFeeAmount,
        totalAmount: input.totalAmount,
        currency: input.currency,
        commissionRateBps: input.commissionRateBps,
        commissionAmount: input.commissionAmount,
        creatorAmount: input.creatorAmount,
        captureTransactionId: input.captureTransactionId,
    }));
    const allocationKey = `booking-escrow-allocation:${allocationFingerprint}`;
    const allocationReference = `BEA-${allocationFingerprint.slice(0, 20).toUpperCase()}`;
    const allocationLedgerTransaction = `escrow-allocation:${input.paymentReference}`;
    return {
        allocationFingerprint,
        allocationKey,
        allocationReference,
        allocationLedgerTransaction,
        escrowDebitPostingKey: `${allocationLedgerTransaction}:escrow-debit`,
        commissionCreditPostingKey: `${allocationLedgerTransaction}:commission-credit`,
        platformFeeCreditPostingKey: `${allocationLedgerTransaction}:platform-service-fee-credit`,
        creatorCreditPostingKey: `${allocationLedgerTransaction}:creator-credit`,
    };
};
exports.deriveBookingEscrowAllocationIdentity = deriveBookingEscrowAllocationIdentity;
