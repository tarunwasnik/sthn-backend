// backend/src/models/settlement.model.ts

import mongoose, { Document, Schema } from "mongoose";

import { PaymentProvider } from "../enums/financial/paymentProvider.enum";
import { SettlementStatus } from "../enums/financial/settlementStatus.enum";
import { FinancialReconciliationStatus } from "../enums/financial/financialReconciliationStatus.enum";
import { FinancialReconciliationReason } from "../enums/financial/financialReconciliationReason.enum";
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "../constants/financial/supportedCurrencies";

export interface ISettlement extends Document {
  /**
   * Internal immutable settlement reference.
   */
  settlementReference: string;

  /**
   * Associated booking.
   */
  bookingId: mongoose.Types.ObjectId;

  /**
   * Associated payment.
   */
  paymentId: mongoose.Types.ObjectId;

  /**
   * User that initiated the payment.
   */
  userId: mongoose.Types.ObjectId;

  /**
   * Creator receiving settlement.
   */
  creatorId: mongoose.Types.ObjectId;

  /**
   * Settlement amount in minor units.
   */
  amount: number;

  /**
   * ISO currency code.
   */
  currency: SupportedCurrency;

  /**
   * Settlement lifecycle status.
   */
  status: SettlementStatus;

  /**
   * Settlement provider.
   */
  provider: PaymentProvider;

  /**
   * Provider settlement reference.
   */
  providerSettlementId?: string;

  /**
   * Provider batch reference.
   */
  providerBatchId?: string;

  /**
   * Provider transaction reference.
   */
  providerTransactionId?: string;

  /**
   * Settlement retry metadata.
   */
  attemptNumber: number;

  /**
   * Indicates whether settlement can be retried.
   */
  retryable: boolean;

  /**
   * Failure message returned during settlement.
   */
  failureMessage?: string;

  /**
   * Idempotency support.
   */
  idempotencyKey: string;
  financialObligationKey?: string;

  /**
   * Settlement execution time.
   */
  settledAt?: Date;

  /**
   * Provider payload retained for auditing.
   */
  providerPayload?: Record<string, unknown>;

  /**
   * Internal extensible metadata.
   */
  attributes?: Record<string, unknown>;
  reconciliationStatus?: FinancialReconciliationStatus;
  reconciliationReason?: FinancialReconciliationReason;
  reconciliationNote?: string;
  serviceAmount?: number; customerFeeAmount?: number; grossEscrowAmount?: number;
  platformCommissionRateBps?: number; platformCommissionAmount?: number; creatorNetAmount?: number; platformRevenueAmount?: number;
  calculationVersion?: number; ledgerTransactionReference?: string;

  createdAt: Date;
  updatedAt: Date;
}

const SettlementSchema = new Schema<ISettlement>(
  {
    settlementReference: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      index: true,
      trim: true,
    },

    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },

    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
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
      enum: Object.values(SettlementStatus),
      default: SettlementStatus.CREATED,
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

    providerSettlementId: String,

    providerBatchId: String,

    providerTransactionId: String,

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

    settledAt: Date,

    providerPayload: {
      type: Schema.Types.Mixed,
    },

    attributes: {
      type: Schema.Types.Mixed,
    },
    financialObligationKey: { type: String, immutable: true, trim: true, index: true },
    reconciliationStatus: { type: String, enum: Object.values(FinancialReconciliationStatus), index: true },
    reconciliationReason: { type: String, enum: Object.values(FinancialReconciliationReason) },
    reconciliationNote: { type: String, trim: true, maxlength: 500 },
    serviceAmount: { type: Number, immutable: true, min: 0 }, customerFeeAmount: { type: Number, immutable: true, min: 0 }, grossEscrowAmount: { type: Number, immutable: true, min: 0 },
    platformCommissionRateBps: { type: Number, immutable: true, min: 0, max: 10000 }, platformCommissionAmount: { type: Number, immutable: true, min: 0 }, creatorNetAmount: { type: Number, immutable: true, min: 0 }, platformRevenueAmount: { type: Number, immutable: true, min: 0 }, calculationVersion: { type: Number, immutable: true, min: 1 }, ledgerTransactionReference: { type: String, immutable: true, trim: true },
  },
  {
    timestamps: true,
  },
);

/* -------------------------------------------------------------------------- */
/* Indexes */
/* -------------------------------------------------------------------------- */

SettlementSchema.index({ paymentId: 1, status: 1 });

SettlementSchema.index({ bookingId: 1, status: 1 });

SettlementSchema.index({ creatorId: 1, status: 1 });

SettlementSchema.index({ userId: 1, status: 1 });

SettlementSchema.index({ status: 1, createdAt: -1 });

SettlementSchema.index({ provider: 1, status: 1 });

SettlementSchema.index({ providerSettlementId: 1 });

SettlementSchema.index({ providerBatchId: 1 });

SettlementSchema.index({ settledAt: -1 });
// Legacy records may be incomplete; a partial index protects only established obligations.
SettlementSchema.index(
  { financialObligationKey: 1 },
  { unique: true, partialFilterExpression: { financialObligationKey: { $type: "string" } } },
);

export const Settlement = mongoose.model<ISettlement>(
  "Settlement",
  SettlementSchema,
);
