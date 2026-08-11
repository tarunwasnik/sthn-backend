import crypto from "node:crypto";
import { Types } from "mongoose";

interface BookingEscrowAllocationIdentityInput {
  bookingId: Types.ObjectId;
  bookingReference: string;
  paymentId: Types.ObjectId;
  paymentReference: string;
  reservationId: Types.ObjectId;
  reservationReference: string;
  customerId: Types.ObjectId;
  creatorId: Types.ObjectId;
  bookingAmount: number;
  serviceAmount: number;
  platformFeeAmount: number;
  totalAmount: number;
  currency: string;
  commissionRateBps: number;
  commissionAmount: number;
  creatorAmount: number;
  captureTransactionId: string;
}

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export const deriveBookingEscrowAllocationIdentity = (
  input: BookingEscrowAllocationIdentityInput,
) => {
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
  const allocationReference =
    `BEA-${allocationFingerprint.slice(0, 20).toUpperCase()}`;
  const allocationLedgerTransaction =
    `escrow-allocation:${input.paymentReference}`;
  return {
    allocationFingerprint,
    allocationKey,
    allocationReference,
    allocationLedgerTransaction,
    escrowDebitPostingKey: `${allocationLedgerTransaction}:escrow-debit`,
    commissionCreditPostingKey: `${allocationLedgerTransaction}:commission-credit`,
    platformFeeCreditPostingKey:
      `${allocationLedgerTransaction}:platform-service-fee-credit`,
    creatorCreditPostingKey: `${allocationLedgerTransaction}:creator-credit`,
  };
};
