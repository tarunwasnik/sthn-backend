import crypto from "node:crypto";
import { Types } from "mongoose";

import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { BookingWalletReleaseCause } from "../../enums/financial/bookingWalletReleaseCause.enum";

const digest = (namespace: string, parts: readonly string[]) =>
  crypto.createHash("sha256").update([namespace, ...parts].join("|")).digest("hex");

export interface BookingWalletReleaseIdentityInput {
  reservationKey: string;
  reservationReference: string;
  authorizationTransactionId: string;
  bookingId: Types.ObjectId;
  bookingReference: string;
  bookingStatus: "REJECTED" | "EXPIRED" | "CANCELLED";
  paymentId: Types.ObjectId;
  paymentReference: string;
  userId: Types.ObjectId;
  walletId: Types.ObjectId;
  creatorId: Types.ObjectId;
  serviceId: Types.ObjectId;
  amount: number;
  currency: SupportedCurrency;
  cause: BookingWalletReleaseCause;
}

export const deriveBookingWalletReleaseIdentity = (
  input: BookingWalletReleaseIdentityInput,
) => {
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
