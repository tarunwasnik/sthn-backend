import { Schema, model, Types, Document } from "mongoose";

import { FINANCIAL_LIMITS } from "../constants/financial/financialLimits";
import {
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
} from "../constants/financial/supportedCurrencies";

export interface WalletDocument extends Document {
  userId: Types.ObjectId;
  currency: SupportedCurrency;
  currentBalance: number;
  availableBalance: number;
  pendingBalance: number;
  withdrawableBalance: number;
  lockedBalance: number;
  reservedBalance: number;
  lifetimeEarnings: number;
  totalWithdrawn: number;
  totalRefunded: number;
  platformFees: number;
  projectionVersion: number;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const nonNegativeMinorUnit = {
  type: Number,
  required: true,
  default: 0,
  min: 0,
  max: FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
  validate: {
    validator: (value: number) => Number.isSafeInteger(value),
    message: "Wallet monetary values must be safe integer minor units.",
  },
};

const walletSchema = new Schema<WalletDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
      immutable: true,
      uppercase: true,
      trim: true,
      enum: SUPPORTED_CURRENCIES,
    },
    currentBalance: nonNegativeMinorUnit,
    availableBalance: nonNegativeMinorUnit,
    pendingBalance: nonNegativeMinorUnit,
    withdrawableBalance: nonNegativeMinorUnit,
    lockedBalance: nonNegativeMinorUnit,
    reservedBalance: nonNegativeMinorUnit,
    lifetimeEarnings: nonNegativeMinorUnit,
    totalWithdrawn: nonNegativeMinorUnit,
    totalRefunded: nonNegativeMinorUnit,
    platformFees: nonNegativeMinorUnit,
    projectionVersion: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value),
        message: "Wallet projection version must be a safe integer.",
      },
    },
    lastSyncedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

/** One currency-isolated projection bucket per user. */
walletSchema.index({ userId: 1, currency: 1 }, { unique: true });

export const Wallet = model<WalletDocument>("Wallet", walletSchema);
