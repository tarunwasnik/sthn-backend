// backend/src/models/internalProvider/internalPayment.model.ts

import mongoose, { Document, Model, Schema, Types } from "mongoose";

import {
  ProviderFailureReason,
  ProviderStatus,
} from "../../constants/internalProvider";

import { ProviderMetadata } from "../../types/internalProvider/providerMetadata.types";
import { ProviderExecutionInfo } from "../../types/internalProvider/providerExecution.types";
import { ProviderAuditInfo } from "../../types/internalProvider/providerAudit.types";
import { ProviderPayloadInfo } from "../../types/internalProvider/providerPayload.types";
import { FINANCIAL_LIMITS } from "../../constants/financial/financialLimits";
import {
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
} from "../../constants/financial/supportedCurrencies";

import {
  ProviderAuditSchema,
  ProviderExecutionSchema,
  ProviderMetadataSchema,
  ProviderPayloadSchema,
} from "./schemas";

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Internal Payment Model
 * ------------------------------------------------------------------
 *
 * Represents the provider-side lifecycle of a Financial Domain Payment.
 *
 * IMPORTANT
 * ----------
 * This model is NOT the financial source of truth.
 *
 * Financial Domain owns:
 *  - Payment
 *  - Ledger
 *  - Settlement
 *  - Wallet
 *  - Creator Balance
 *
 * Internal Provider owns only provider-specific execution state.
 *
 * Therefore this model intentionally stores NO business or financial
 * information such as:
 *
 *  - bookingId
 *  - userId
 *  - creatorId
 *  - amount
 *  - currency
 *  - platformFee
 *  - creatorEarnings
 *
 * Those remain inside the Financial Domain.
 * ------------------------------------------------------------------
 */

export interface InternalPaymentDocument extends Document {
  /**
   * Reference to Financial Domain payment.
   */
  paymentId: Types.ObjectId;

  /** Immutable Financial request identity used for lifecycle verification. */
  amount: number;
  currency: SupportedCurrency;

  /**
   * Provider payment identifier.
   */
  providerPaymentId: string;

  /**
   * Provider transaction identifier.
   */
  providerTransactionId?: string;

  /**
   * Merchant/provider reference.
   */
  providerReference?: string;

  /**
   * Current provider status.
   */
  status: ProviderStatus;

  /**
   * Failure reason when applicable.
   */
  failureReason?: ProviderFailureReason;

  /**
   * Indicates whether the payment has reached
   * a terminal lifecycle state.
   */
  isTerminal: boolean;

  /**
   * Idempotency key used for duplicate protection.
   */
  idempotencyKey: string;

  /**
   * Deterministic fingerprint of the allowlisted payment-session request.
   * Used only to prove idempotent creation replays are equivalent.
   */
  requestFingerprint?: string;

  /**
   * Provider execution metadata.
   */
  providerMetadata: ProviderMetadata;

  /**
   * Runtime execution information.
   */
  execution: ProviderExecutionInfo;

  /**
   * Shared audit information.
   */
  audit: ProviderAuditInfo;

  /**
   * Raw provider payloads.
   */
  payloads: ProviderPayloadInfo;

  /**
   * Lifecycle timestamps.
   */
  authorizedAt?: Date;

  capturedAt?: Date;

  cancelledAt?: Date;

  failedAt?: Date;

  expiredAt?: Date;

  createdAt: Date;

  updatedAt: Date;
}

export interface InternalPaymentModel extends Model<InternalPaymentDocument> {}

const InternalPaymentSchema = new Schema<
  InternalPaymentDocument,
  InternalPaymentModel
>(
  {
    /**
     * ==============================================================
     * References
     * ==============================================================
     */

    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
      immutable: true,
    },

    /**
     * ==============================================================
     * Provider Identifiers
     * ==============================================================
     */

    providerPaymentId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },

    providerTransactionId: {
      type: String,
      trim: true,
    },

    providerReference: {
      type: String,
      default: null,
      trim: true,
      immutable: true,
    },

    idempotencyKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },

    amount: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      max: FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value),
        message: "Internal provider payment amount must be a safe integer minor-unit value.",
      },
    },

    currency: {
      type: String,
      required: true,
      immutable: true,
      uppercase: true,
      trim: true,
      enum: SUPPORTED_CURRENCIES,
    },

    requestFingerprint: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      select: false,
    },

    /**
     * ==============================================================
     * Provider State
     * ==============================================================
     */

    status: {
      type: String,
      enum: Object.values(ProviderStatus),
      required: true,
      default: ProviderStatus.CREATED,
      index: true,
    },

    failureReason: {
      type: String,
      enum: Object.values(ProviderFailureReason),
      default: null,
    },

    isTerminal: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    /**
     * ==============================================================
     * Provider Metadata
     * ==============================================================
     */

    providerMetadata: {
      type: ProviderMetadataSchema,
      required: true,
      default: () => ({}),
    },

    /**
     * ==============================================================
     * Execution Information
     * ==============================================================
     */

    execution: {
      type: ProviderExecutionSchema,
      required: true,
      default: () => ({}),
    },

    /**
     * ==============================================================
     * Audit Information
     * ==============================================================
     */

    audit: {
      type: ProviderAuditSchema,
      required: true,
      default: () => ({}),
    },

    /**
     * ==============================================================
     * Provider Payloads
     * ==============================================================
     *
     * Stores the raw provider request/response payloads.
     * These payloads are intentionally flexible because every
     * provider exposes different APIs and response formats.
     */

    payloads: {
      type: ProviderPayloadSchema,
      required: true,
      default: () => ({}),
    },

    /**
     * ==============================================================
     * Lifecycle Timestamps
     * ==============================================================
     */

    /**
     * Time when the provider authorized the payment.
     */
    authorizedAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when the provider successfully captured the payment.
     */
    capturedAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when the payment was cancelled.
     */
    cancelledAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when the payment failed.
     */
    failedAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when the payment expired.
     */
    expiredAt: {
      type: Date,
      default: null,
    },
  },
  {
    /**
     * Automatically maintain createdAt and updatedAt.
     */
    timestamps: true,

    /**
     * Disable Mongoose versioning.
     */
    versionKey: false,

    /**
     * Minimize disabled so empty embedded provider objects
     * remain visible for debugging and auditing.
     */
    minimize: false,

    /**
     * Include virtual fields when serializing.
     */
    toJSON: {
      virtuals: true,
    },

    toObject: {
      virtuals: true,
    },
  },
);

/**
 * ==============================================================
 * Indexes
 * ==============================================================
 */

/**
 * One provider record per Financial Domain payment.
 */
InternalPaymentSchema.index({ paymentId: 1 }, { unique: true });

/**
 * Provider payment lookup.
 */
InternalPaymentSchema.index({ providerPaymentId: 1 }, { unique: true });

/**
 * Provider transaction lookup.
 */
InternalPaymentSchema.index(
  { providerTransactionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      providerTransactionId: { $type: "string" },
    },
  },
);

/**
 * Duplicate request protection.
 */
InternalPaymentSchema.index({ idempotencyKey: 1 }, { unique: true });

/**
 * Active payment queries.
 */
InternalPaymentSchema.index({
  status: 1,
  isTerminal: 1,
});

/**
 * Provider reconciliation queries.
 */
InternalPaymentSchema.index({
  paymentId: 1,
  status: 1,
});

/**
 * Administrative timeline queries.
 */
InternalPaymentSchema.index({
  createdAt: -1,
});

/**
 * ==============================================================
 * Model
 * ==============================================================
 */

const InternalPaymentModel = mongoose.model<
  InternalPaymentDocument,
  InternalPaymentModel
>("InternalPayment", InternalPaymentSchema);

export default InternalPaymentModel;
