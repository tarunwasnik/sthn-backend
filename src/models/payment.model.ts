// backend/src/models/payment.model.ts

import mongoose, { Document, Schema } from "mongoose";

import { PaymentFailureReason } from "../enums/financial/paymentFailureReason.enum";
import { PaymentMethod } from "../enums/financial/paymentMethod.enum";
import { PaymentProvider } from "../enums/financial/paymentProvider.enum";
import { PaymentStatus } from "../enums/financial/paymentStatus.enum";
import { PaymentPricingPolicy } from "../enums/financial/paymentPricingPolicy.enum";
import { FinancialReconciliationStatus } from "../enums/financial/financialReconciliationStatus.enum";
import { FinancialReconciliationReason } from "../enums/financial/financialReconciliationReason.enum";
import { BookingWalletReleaseCause } from "../enums/financial/bookingWalletReleaseCause.enum";
import { BookingWalletCaptureCause } from "../enums/financial/bookingWalletCaptureCause.enum";
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "../constants/financial/supportedCurrencies";

export interface IPayment extends Document {
  /**
   * Internal immutable payment reference.
   */
  paymentReference: string;

  /**
   * Booking this payment belongs to.
   */
  bookingId: mongoose.Types.ObjectId;

  /**
   * Customer making the payment.
   */
  userId: mongoose.Types.ObjectId;

  /**
   * Creator receiving the booking payment.
   */
  creatorId: mongoose.Types.ObjectId;

  /**
   * Amount in minor units.
   */
  amount: number;

  serviceAmount?: number;
  customerFeeRateBps?: number;
  customerFeeAmount?: number;
  grossEscrowAmount?: number;
  pricingPolicy?: PaymentPricingPolicy;
  pricingVersion?: number;
  pricingCalculatedAt?: Date;
  escrowRecognizedAt?: Date;
  escrowLedgerTransactionReference?: string;
  reconciliationStatus?: FinancialReconciliationStatus;
  reconciliationReason?: FinancialReconciliationReason;
  reconciliationNote?: string;
  /** Explicit future-settlement guard; escrow proof is still ledger-derived. */
  automaticSettlementBlocked?: boolean;

  /**
   * ISO currency code.
   */
  currency: SupportedCurrency;

  /**
   * Payment provider.
   */
  provider: PaymentProvider;

  /**
   * Payment method.
   */
  method: PaymentMethod;

  /**
   * Financial payment state.
   */
  status: PaymentStatus;

  /** Monotonic Financial Domain transition counter. */
  lifecycleVersion: number;

  /**
   * Provider references.
   */
  providerPaymentId?: string;
  providerOrderId?: string;
  providerTransactionId?: string;
  authorizationId?: string;
  settlementId?: string;
  walletId?: mongoose.Types.ObjectId;
  reservationId?: mongoose.Types.ObjectId;
  reservationReference?: string;
  authorizedAmount?: number;
  authorizedAt?: Date;
  releaseReference?: string;
  releasedAmount?: number;
  releaseCause?: BookingWalletReleaseCause;
  releasedAt?: Date;
  captureReference?: string;
  capturedAmount?: number;
  captureCause?: BookingWalletCaptureCause;
  capturedAt?: Date;

  /**
   * Retry metadata.
   */
  attemptNumber: number;
  retryable: boolean;

  /**
   * Failure information.
   */
  failureReason: PaymentFailureReason;
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

const PaymentSchema = new Schema<IPayment>(
  {
    paymentReference: {
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
      immutable: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
      index: true,
    },

    creatorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value),
        message: "Payment amount must be a safe integer minor-unit value.",
      },
    },

    currency: {
      type: String,
      enum: SUPPORTED_CURRENCIES,
      required: true,
      uppercase: true,
      immutable: true,
    },

    provider: {
      type: String,
      enum: Object.values(PaymentProvider),
      default: PaymentProvider.INTERNAL,
      required: true,
      index: true,
    },

    method: {
      type: String,
      enum: Object.values(PaymentMethod),
      default: PaymentMethod.INTERNAL,
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.CREATED,
      required: true,
      index: true,
    },

    providerPaymentId: String,
    providerOrderId: String,
    providerTransactionId: String,
    authorizationId: String,
    settlementId: String,
    walletId: { type: Schema.Types.ObjectId, ref: "Wallet", select: false },
    reservationId: { type: Schema.Types.ObjectId, ref: "BookingFundReservation", select: false },
    reservationReference: { type: String, trim: true },
    authorizedAmount: {
      type: Number,
      min: 1,
      validate: {
        validator: (value: number | undefined) =>
          value === undefined || Number.isSafeInteger(value),
        message: "Authorized amount must be a safe integer minor-unit value.",
      },
    },
    authorizedAt: { type: Date, index: true },
    releaseReference: { type: String, trim: true },
    releasedAmount: {
      type: Number,
      min: 1,
      validate: {
        validator: (value: number | undefined) =>
          value === undefined || Number.isSafeInteger(value),
        message: "Released amount must be a safe integer minor-unit value.",
      },
    },
    releaseCause: { type: String, enum: Object.values(BookingWalletReleaseCause) },
    releasedAt: { type: Date, index: true },
    captureReference: { type: String, trim: true },
    capturedAmount: {
      type: Number,
      min: 1,
      validate: {
        validator: (value: number | undefined) =>
          value === undefined || Number.isSafeInteger(value),
        message: "Captured amount must be a safe integer minor-unit value.",
      },
    },
    captureCause: { type: String, enum: Object.values(BookingWalletCaptureCause) },
    capturedAt: { type: Date, index: true },

    attemptNumber: {
      type: Number,
      default: 1,
      min: 1,
    },

    retryable: {
      type: Boolean,
      default: true,
    },

    failureReason: {
      type: String,
      enum: Object.values(PaymentFailureReason),
      default: PaymentFailureReason.NONE,
    },

    failureMessage: String,

    idempotencyKey: {
      type: String,
      required: true,
      index: true,
      immutable: true,
    },

    serviceAmount: { type: Number, immutable: true, min: 0, validate: { validator: (value: number | undefined) => value === undefined || Number.isSafeInteger(value), message: "Service amount must be a safe integer." } },
    customerFeeRateBps: { type: Number, immutable: true, min: 0, max: 10000, validate: { validator: (value: number | undefined) => value === undefined || Number.isSafeInteger(value), message: "Customer fee rate must be a safe integer." } },
    customerFeeAmount: { type: Number, immutable: true, min: 0, validate: { validator: (value: number | undefined) => value === undefined || Number.isSafeInteger(value), message: "Customer fee amount must be a safe integer." } },
    grossEscrowAmount: { type: Number, immutable: true, min: 0, validate: { validator: (value: number | undefined) => value === undefined || Number.isSafeInteger(value), message: "Gross escrow amount must be a safe integer." } },
    pricingPolicy: { type: String, enum: Object.values(PaymentPricingPolicy), immutable: true, index: true },
    pricingVersion: { type: Number, immutable: true, min: 0, validate: { validator: (value: number | undefined) => value === undefined || Number.isSafeInteger(value), message: "Pricing version must be a safe integer." } },
    pricingCalculatedAt: { type: Date, immutable: true },
    escrowRecognizedAt: { type: Date, index: true },
    escrowLedgerTransactionReference: { type: String, trim: true, sparse: true, index: true },
    reconciliationStatus: { type: String, enum: Object.values(FinancialReconciliationStatus), index: true },
    reconciliationReason: { type: String, enum: Object.values(FinancialReconciliationReason) },
    reconciliationNote: { type: String, trim: true, maxlength: 500 },
    automaticSettlementBlocked: { type: Boolean, default: false, index: true },

    lifecycleVersion: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
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
/* Indexes                                                                    */
/* -------------------------------------------------------------------------- */

PaymentSchema.index({ bookingId: 1, status: 1 });

PaymentSchema.index({ creatorId: 1, status: 1 });

PaymentSchema.index({ userId: 1, status: 1 });

PaymentSchema.index({ status: 1, createdAt: -1 });

PaymentSchema.index({ provider: 1, status: 1 });

PaymentSchema.index({ bookingId: 1 }, { unique: true });

PaymentSchema.index(
  { provider: 1, providerPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerPaymentId: { $type: "string" } },
  },
);

PaymentSchema.index({ providerOrderId: 1 });

PaymentSchema.index({ providerTransactionId: 1 });

PaymentSchema.index({ settlementId: 1 });
PaymentSchema.index({ reconciliationStatus: 1, status: 1 });
PaymentSchema.index({ automaticSettlementBlocked: 1, escrowRecognizedAt: 1, status: 1 });

export const Payment = mongoose.model<IPayment>("Payment", PaymentSchema);
