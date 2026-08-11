// backend/src/models/creatorBalance.model.ts

import mongoose, { Document, Schema } from "mongoose";
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "../constants/financial/supportedCurrencies";

export interface ICreatorBalance extends Document {
  /**
   * Creator owning this balance.
   * One balance document exists per creator.
   */
  creatorId: mongoose.Types.ObjectId;

  /**
   * Currency of this balance.
   */
  currency: SupportedCurrency;

  /**
   * Pending earnings awaiting settlement/payability.
   */
  pendingBalance: number;

  /**
   * Financially locked earnings.
   */
  lockedBalance: number;
  /** Exclusive reservation bucket for active withdrawal/payout obligations. */
  reservedBalance: number;

  /**
   * Available for payout.
   */
  availableBalance: number;

  /**
   * Currently included in payout processing.
   */
  payoutPendingBalance: number;

  /**
   * Lifetime gross earnings.
   */
  lifetimeGross: number;

  /**
   * Lifetime creator earnings after commission.
   */
  lifetimeNet: number;

  /**
   * Lifetime platform commission deducted.
   */
  lifetimeCommission: number;

  /**
   * Lifetime refunded amount.
   */
  lifetimeRefunded: number;

  /**
   * Lifetime amount already paid out.
   */
  lifetimePaidOut: number;

  /**
   * Last successful balance calculation.
   */
  lastCalculatedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const CreatorBalanceSchema = new Schema<ICreatorBalance>(
  {
    creatorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    currency: {
      type: String,
      enum: SUPPORTED_CURRENCIES,
      required: true,
      uppercase: true,
      immutable: true,
    },

    pendingBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    lockedBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    reservedBalance: { type: Number, default: 0, min: 0 },

    availableBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    payoutPendingBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    lifetimeGross: {
      type: Number,
      default: 0,
      min: 0,
    },

    lifetimeNet: {
      type: Number,
      default: 0,
      min: 0,
    },

    lifetimeCommission: {
      type: Number,
      default: 0,
      min: 0,
    },

    lifetimeRefunded: {
      type: Number,
      default: 0,
      min: 0,
    },

    lifetimePaidOut: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastCalculatedAt: Date,
  },
  {
    timestamps: true,
  },
);

/* -------------------------------------------------------------------------- */
/* Indexes */
/* -------------------------------------------------------------------------- */

CreatorBalanceSchema.index({ creatorId: 1 });

CreatorBalanceSchema.index({ availableBalance: -1 });

CreatorBalanceSchema.index({ pendingBalance: -1 });

CreatorBalanceSchema.index({ payoutPendingBalance: -1 });

export const CreatorBalance = mongoose.model<ICreatorBalance>(
  "CreatorBalance",
  CreatorBalanceSchema,
);
