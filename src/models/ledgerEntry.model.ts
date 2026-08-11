// backend/src/models/ledgerEntry.model.ts

import mongoose, { Document, Schema } from "mongoose";

import { LedgerEntryType } from "../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../enums/financial/moneyDirection.enum";
import { LedgerAccount } from "../enums/financial/ledgerAccount.enum";

export interface ILedgerEntry extends Document {
  /**
   * Internal immutable ledger reference.
   */
  ledgerReference: string;

  /**
   * Groups multiple ledger entries that belong
   * to the same financial transaction.
   */
  transactionId: string;

  /**
   * Optional idempotency key used to prevent
   * duplicate financial operations.
   */
  idempotencyKey?: string;

  /**
   * Ledger entry type.
   */
  type: LedgerEntryType;

  /**
   * Source that generated this ledger entry.
   */
  source: LedgerSource;

  /**
   * Related booking.
   */
  bookingId?: mongoose.Types.ObjectId;

  /**
   * Related payment.
   */
  paymentId?: mongoose.Types.ObjectId;

  /**
   * Related refund.
   */
  refundId?: mongoose.Types.ObjectId;

  /**
   * Related payout.
   */
  payoutId?: mongoose.Types.ObjectId;

  /**
   * Related settlement.
   */
  settlementId?: mongoose.Types.ObjectId;

  /**
   * Related user.
   */
  userId?: mongoose.Types.ObjectId;
  walletId?: mongoose.Types.ObjectId;

  /**
   * Credit or debit.
   */
  direction: MoneyDirection;
  account?: LedgerAccount;
  postingKey?: string;

  /**
   * Amount in minor units.
   */
  amount: number;

  /**
   * ISO currency code.
   */
  currency: string;

  /**
   * Human-readable description.
   */
  description?: string;

  /**
   * Immutable metadata for auditing.
   */
  metadata?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

const LedgerEntrySchema = new Schema<ILedgerEntry>(
  {
    ledgerReference: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      index: true,
      trim: true,
    },

    transactionId: {
      type: String,
      required: true,
      immutable: true,
      index: true,
      trim: true,
    },

    idempotencyKey: {
      type: String,
      immutable: true,
      sparse: true,
      index: true,
      trim: true,
    },

    type: {
      type: String,
      enum: Object.values(LedgerEntryType),
      required: true,
      index: true,
    },

    source: {
      type: String,
      enum: Object.values(LedgerSource),
      required: true,
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

    refundId: {
      type: Schema.Types.ObjectId,
      ref: "Refund",
      index: true,
    },

    payoutId: {
      type: Schema.Types.ObjectId,
      ref: "Payout",
      index: true,
    },

    settlementId: {
      type: Schema.Types.ObjectId,
      ref: "Settlement",
      index: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    walletId: {
      type: Schema.Types.ObjectId,
      ref: "Wallet",
      index: true,
      immutable: true,
    },

    direction: {
      type: String,
      enum: Object.values(MoneyDirection),
      required: true,
      index: true,
    },
    account: { type: String, enum: Object.values(LedgerAccount), immutable: true, index: true },
    postingKey: { type: String, immutable: true, trim: true, select: false },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      required: true,
      uppercase: true,
      immutable: true,
    },

    description: {
      type: String,
      trim: true,
    },

    metadata: {
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

LedgerEntrySchema.index({ bookingId: 1, createdAt: -1 });

LedgerEntrySchema.index({ paymentId: 1 });

LedgerEntrySchema.index({ refundId: 1 });

LedgerEntrySchema.index({ payoutId: 1 });

LedgerEntrySchema.index({ settlementId: 1 });

LedgerEntrySchema.index({ userId: 1, createdAt: -1 });

LedgerEntrySchema.index({ type: 1, createdAt: -1 });

LedgerEntrySchema.index({ source: 1, createdAt: -1 });

LedgerEntrySchema.index({ transactionId: 1 });

LedgerEntrySchema.index(
  { idempotencyKey: 1 },
  {
    sparse: true,
  },
);
LedgerEntrySchema.index(
  { postingKey: 1 },
  { unique: true, partialFilterExpression: { postingKey: { $type: "string" } } },
);

export const LedgerEntry = mongoose.model<ILedgerEntry>(
  "LedgerEntry",
  LedgerEntrySchema,
);
