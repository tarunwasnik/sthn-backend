// backend/src/models/refund.model.ts

import mongoose, { Document, Schema } from "mongoose";

import { PaymentProvider } from "../enums/financial/paymentProvider.enum";
import { RefundReason } from "../enums/financial/refundReason.enum";
import { RefundStatus } from "../enums/financial/refundStatus.enum";
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "../constants/financial/supportedCurrencies";

export interface IRefund extends Document {
  /**
   * Internal immutable refund reference.
   */
  refundReference: string;

  /**
   * Payment associated with this refund.
   */
  paymentId: mongoose.Types.ObjectId;

  /**
   * Booking associated with this refund.
   */
  bookingId: mongoose.Types.ObjectId;

  /**
   * User receiving the refund.
   */
  userId: mongoose.Types.ObjectId;

  /**
   * Creator associated with the booking.
   */
  creatorId: mongoose.Types.ObjectId;

  /**
   * Refund amount in minor units.
   */
  amount: number;

  /**
   * ISO currency code.
   */
  currency: SupportedCurrency;

  /**
   * Refund lifecycle status.
   */
  status: RefundStatus;

  /**
   * Business reason for refund.
   */
  reason: RefundReason;

  /**
   * Provider processing the refund.
   */
  provider: PaymentProvider;

  /**
   * Provider references.
   */
  providerRefundId?: string;
  providerPaymentId?: string;
  settlementId?: string;

  /**
   * Retry metadata.
   */
  attemptNumber: number;
  retryable: boolean;

  /**
   * Failure information.
   */
  failureMessage?: string;

  /**
   * Idempotency support.
   */
  idempotencyKey: string;

  /**
   * Provider payload retained for auditing.
   */
  providerPayload?: Record<string, unknown>;

  /**
   * Extensible internal metadata.
   */
  attributes?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

const RefundSchema = new Schema<IRefund>(
  {
    refundReference: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      index: true,
      trim: true,
    },

    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
      index: true,
    },

    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    creatorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 1,
    },

    currency: {
      type: String,
      enum: SUPPORTED_CURRENCIES,
      required: true,
      uppercase: true,
      immutable: true,
    },

    status: {
      type: String,
      enum: Object.values(RefundStatus),
      default: RefundStatus.CREATED,
      required: true,
      index: true,
    },

    reason: {
      type: String,
      enum: Object.values(RefundReason),
      default: RefundReason.OTHER,
      required: true,
      index: true,
    },

    provider: {
      type: String,
      enum: Object.values(PaymentProvider),
      default: PaymentProvider.INTERNAL,
      required: true,
      index: true,
    },

    providerRefundId: String,

    providerPaymentId: String,

    settlementId: String,

    attemptNumber: {
      type: Number,
      default: 1,
      min: 1,
    },

    retryable: {
      type: Boolean,
      default: true,
    },

    failureMessage: String,

    idempotencyKey: {
      type: String,
      required: true,
      immutable: true,
      index: true,
    },

    providerPayload: {
      type: Schema.Types.Mixed,
    },

    attributes: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

/* -------------------------------------------------------------------------- */
/* Indexes */
/* -------------------------------------------------------------------------- */

RefundSchema.index({ paymentId: 1, status: 1 });

RefundSchema.index({ bookingId: 1, status: 1 });

RefundSchema.index({ userId: 1, status: 1 });

RefundSchema.index({ creatorId: 1, status: 1 });

RefundSchema.index({ status: 1, createdAt: -1 });

RefundSchema.index({ provider: 1, status: 1 });

RefundSchema.index({ providerRefundId: 1 });

RefundSchema.index({ settlementId: 1 });

export const Refund = mongoose.model<IRefund>("Refund", RefundSchema);
