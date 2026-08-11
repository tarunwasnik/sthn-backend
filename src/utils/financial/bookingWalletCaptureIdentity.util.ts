import crypto from "node:crypto";
import { Types } from "mongoose";

import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { BookingWalletCaptureCause } from "../../enums/financial/bookingWalletCaptureCause.enum";

const digest = (namespace: string, parts: readonly string[]) =>
  crypto.createHash("sha256").update([namespace, ...parts].join("|")).digest("hex");

export interface BookingWalletCaptureIdentityInput {
  reservationKey: string;
  reservationReference: string;
  authorizationTransactionId: string;
  bookingId: Types.ObjectId;
  bookingReference: string;
  paymentId: Types.ObjectId;
  paymentReference: string;
  userId: Types.ObjectId;
  walletId: Types.ObjectId;
  creatorId: Types.ObjectId;
  serviceId: Types.ObjectId;
  amount: number;
  currency: SupportedCurrency;
  cause: BookingWalletCaptureCause;
}

export const deriveBookingWalletCaptureIdentity = (
  input: BookingWalletCaptureIdentityInput,
) => {
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
