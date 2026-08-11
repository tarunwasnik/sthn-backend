// backend/src/models/payout.model.ts

import mongoose, { Document, Schema } from "mongoose";

import { PaymentProvider } from "../enums/financial/paymentProvider.enum";
import { PayoutStatus } from "../enums/financial/payoutStatus.enum";
import { PayoutSourceType } from "../enums/financial/payoutSourceType.enum";
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "../constants/financial/supportedCurrencies";

export interface IPayout extends Document {
  /**
   * Internal immutable payout reference.
   */
  payoutReference: string;
  sourceType: PayoutSourceType;
  withdrawalId?: mongoose.Types.ObjectId;

  /**
   * Creator receiving the payout.
   */
  creatorId: mongoose.Types.ObjectId;

  /**
   * Settlement associated with this payout.
   */
  settlementId?: mongoose.Types.ObjectId;

  /**
   * Booking associated with this payout.
   */
  bookingId?: mongoose.Types.ObjectId;

  /**
   * Payment associated with this payout.
   */
  paymentId?: mongoose.Types.ObjectId;

  /**
   * Payout amount in minor units.
   */
  amount: number;

  /**
   * ISO currency code.
   */
  currency: SupportedCurrency;

  /**
   * Current payout lifecycle status.
   */
  status: PayoutStatus;

  /**
   * Payout provider.
   */
  provider: PaymentProvider;

  /**
   * Provider payout references.
   */
  providerPayoutId?: string;
  providerTransferId?: string;
  beneficiaryId?: string;

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
   * Execution timestamps.
   */
  initiatedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;

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

const PayoutSchema = new Schema<IPayout>(
  {
    payoutReference: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      index: true,
      trim: true,
    },
    sourceType: {
      type: String,
      enum: Object.values(PayoutSourceType),
      required: true,
      default: PayoutSourceType.SETTLEMENT,
      immutable: true,
      index: true,
    },
    withdrawalId: {
      type: Schema.Types.ObjectId,
      ref: "Withdrawal",
      index: true,
    },

    creatorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    settlementId: {
      type: Schema.Types.ObjectId,
      ref: "Settlement",
      index: true,
    },

    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      index: true,
    },

    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
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
      enum: Object.values(PayoutStatus),
      default: PayoutStatus.CREATED,
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

    providerPayoutId: String,

    providerTransferId: String,

    beneficiaryId: String,

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

    initiatedAt: Date,

    completedAt: Date,
    failedAt: Date,

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

PayoutSchema.pre("validate", function () {
  if (this.sourceType === PayoutSourceType.WITHDRAWAL) {
    if (!this.withdrawalId) {
      this.invalidate("withdrawalId", "Withdrawal payout requires withdrawalId.");
    }

    if (this.settlementId || this.bookingId || this.paymentId) {
      this.invalidate(
        "sourceType",
        "Withdrawal payout cannot reference settlement, booking, or payment.",
      );
    }

    return;
  }

  if (!this.settlementId || !this.bookingId || !this.paymentId) {
    this.invalidate(
      "sourceType",
      "Settlement payout requires settlement, booking, and payment references.",
    );
  }
});

/* -------------------------------------------------------------------------- */
/* Indexes */
/* -------------------------------------------------------------------------- */

PayoutSchema.index({ creatorId: 1, status: 1 });
PayoutSchema.index(
  { withdrawalId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceType: PayoutSourceType.WITHDRAWAL,
      withdrawalId: { $exists: true },
    },
  },
);

PayoutSchema.index({ settlementId: 1, status: 1 });

PayoutSchema.index({ bookingId: 1 });

PayoutSchema.index({ paymentId: 1 });

PayoutSchema.index({ status: 1, createdAt: -1 });

PayoutSchema.index({ provider: 1, status: 1 });

PayoutSchema.index({ providerPayoutId: 1 });

PayoutSchema.index({ providerTransferId: 1 });

PayoutSchema.index({ completedAt: -1 });

export const Payout = mongoose.model<IPayout>("Payout", PayoutSchema);
