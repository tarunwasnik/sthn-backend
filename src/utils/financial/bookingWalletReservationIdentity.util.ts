import crypto from "node:crypto";
import { Types } from "mongoose";

import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";

const digest = (namespace: string, parts: readonly string[]): string =>
  crypto.createHash("sha256").update([namespace, ...parts].join("|")).digest("hex");

export interface BookingWalletReservationIdentityInput {
  bookingId: Types.ObjectId;
  paymentId: Types.ObjectId;
  paymentReference: string;
  userId: Types.ObjectId;
  walletId: Types.ObjectId;
  creatorId: Types.ObjectId;
  serviceId: Types.ObjectId;
  amount: number;
  currency: SupportedCurrency;
  method: PaymentMethod.WALLET;
}

export interface BookingWalletReservationIdentity {
  requestFingerprint: string;
  reservationKey: string;
  reservationReference: string;
  ledgerTransactionId: string;
  availablePostingKey: string;
  reservedPostingKey: string;
  projectionOperationKey: string;
}

export const deriveBookingWalletReservationIdentity = (
  input: BookingWalletReservationIdentityInput,
): BookingWalletReservationIdentity => {
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

export const deriveBookingRequestIdentity = (input: {
  userId: string;
  serviceId: string;
  slotIds: string[];
  method: PaymentMethod;
  idempotencyKey: string;
}) => {
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
