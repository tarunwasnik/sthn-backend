import crypto from "node:crypto";
import { Types } from "mongoose";

export interface BookingCreatorSettlementIdentityInput {
  allocationId: Types.ObjectId;
  allocationReference: string;
  bookingId: Types.ObjectId;
  bookingReference: string;
  paymentId: Types.ObjectId;
  paymentReference: string;
  reservationId: Types.ObjectId;
  reservationReference: string;
  customerUserId: Types.ObjectId;
  creatorId: Types.ObjectId;
  creatorUserId: Types.ObjectId;
  creatorWalletId: Types.ObjectId;
  bookingAmount: number;
  currency: string;
  commissionAmount: number;
  creatorAmount: number;
  captureTransactionId: string;
  allocationTransactionId: string;
}

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export const deriveBookingCreatorSettlementIdentity = (
  input: BookingCreatorSettlementIdentityInput,
) => {
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
  const settlementReference =
    `BCS-${settlementFingerprint.slice(0, 20).toUpperCase()}`;
  const settlementTransactionId =
    `creator-wallet-settlement:${input.allocationReference}`;
  const projectionOperationKey =
    `${settlementTransactionId}:wallet-projection`;
  const settlementProjectionOperationReference =
    `WPO-${hash(projectionOperationKey).slice(0, 16).toUpperCase()}`;
  return {
    settlementFingerprint,
    settlementKey,
    settlementReference,
    settlementTransactionId,
    creatorPayableDebitPostingKey:
      `${settlementTransactionId}:creator-payable-debit`,
    walletAvailableCreditPostingKey:
      `${settlementTransactionId}:wallet-available-credit`,
    projectionOperationKey,
    settlementProjectionOperationReference,
  };
};
