// backend/src/models/internalProvider/internalRefund.model.ts

import mongoose, { Document, Model, Schema, Types } from "mongoose";

import {
  ProviderFailureReason,
  ProviderRefundStatus,
} from "../../constants/internalProvider";

import {
  ProviderAuditInfo,
  ProviderExecutionInfo,
  ProviderMetadata,
} from "../../types/internalProvider";
import { SUPPORTED_CURRENCIES, SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { FINANCIAL_LIMITS } from "../../constants/financial/financialLimits";

import {
  ProviderAuditSchema,
  ProviderExecutionSchema,
  ProviderMetadataSchema,
  ProviderPayloadSchema,
} from "./schemas";

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Internal Refund Model
 * ------------------------------------------------------------------
 *
 * Represents the provider-side lifecycle of a Financial Domain Refund.
 *
 * The Financial Domain owns all refund business rules and financial
 * information. This model stores only provider execution state.
 * ------------------------------------------------------------------
 */

export interface InternalRefundDocument extends Document {
  /**
   * Financial Domain refund.
   */
  refundId: Types.ObjectId;

  /**
   * Parent Internal Provider payment.
   */
  internalPaymentId: Types.ObjectId;

  /**
   * Parent provider payment identifier.
   */
  providerPaymentId: string;

  /**
   * Provider refund identifier.
   */
  providerRefundId: string;

  /**
   * External provider reference.
   */
  providerReference?: string;

  /**
   * Duplicate request protection.
   */
  idempotencyKey: string;
  requestFingerprint?: string;
  amount: number;
  currency: SupportedCurrency;

  /**
   * Current provider refund status.
   */
  status: ProviderRefundStatus;

  /**
   * Failure reason.
   */
  failureReason?: ProviderFailureReason;

  /**
   * Indicates whether the refund has reached
   * a terminal lifecycle state.
   */
  isTerminal: boolean;

  /**
   * Provider metadata.
   */
  providerMetadata: ProviderMetadata;

  /**
   * Execution information.
   */
  execution: ProviderExecutionInfo;

  /**
   * Audit information.
   */
  audit: ProviderAuditInfo;

  /**
   * Raw provider payloads.
   */
  payloads: {
    request: unknown;
    response: unknown;
  };

  /**
   * Lifecycle timestamps.
   */
  processingStartedAt?: Date;

  completedAt?: Date;

  cancelledAt?: Date;

  failedAt?: Date;

  expiredAt?: Date;

  createdAt: Date;

  updatedAt: Date;
}

export interface InternalRefundModel extends Model<InternalRefundDocument> {}

const InternalRefundSchema = new Schema<
  InternalRefundDocument,
  InternalRefundModel
>(
  {
    /**
     * ==============================================================
     * References
     * ==============================================================
     */

    refundId: {
      type: Schema.Types.ObjectId,
      ref: "Refund",
      required: true,
      immutable: true,
      index: true,
    },

    internalPaymentId: {
      type: Schema.Types.ObjectId,
      ref: "InternalPayment",
      required: true,
      immutable: true,
      index: true,
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
      index: true,
    },

    providerRefundId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
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
      unique: true,
      immutable: true,
      trim: true,
    },
    requestFingerprint: { type: String, immutable: true, trim: true, select: false },
    amount: { type: Number, required: true, immutable: true, min: 1, max: FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT, validate: { validator: (value: number) => Number.isSafeInteger(value), message: "Provider refund amount must be a safe integer." } },
    currency: { type: String, required: true, immutable: true, uppercase: true, trim: true, enum: SUPPORTED_CURRENCIES },

    /**
     * ==============================================================
     * Provider State
     * ==============================================================
     */

    status: {
      type: String,
      enum: Object.values(ProviderRefundStatus),
      default: ProviderRefundStatus.CREATED,
      required: true,
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
     * Time when refund processing started.
     */
    processingStartedAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when refund completed successfully.
     */
    completedAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when refund was cancelled.
     */
    cancelledAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when refund failed.
     */
    failedAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when refund expired.
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
     * Preserve empty embedded provider objects.
     */
    minimize: false,

    /**
     * Include virtuals when serializing.
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
 * One provider refund per Financial Domain refund.
 */
InternalRefundSchema.index({ refundId: 1 }, { unique: true });

/**
 * Parent provider payment lookup.
 */
InternalRefundSchema.index({
  internalPaymentId: 1,
});

/**
 * Provider payment lookup.
 */
InternalRefundSchema.index({
  providerPaymentId: 1,
});

/**
 * Provider refund lookup.
 */
InternalRefundSchema.index({ providerRefundId: 1 }, { unique: true });

/**
 * Duplicate request protection.
 */
InternalRefundSchema.index({ idempotencyKey: 1 }, { unique: true });

/**
 * Active refund queries.
 */
InternalRefundSchema.index({
  status: 1,
  isTerminal: 1,
});

/**
 * Reconciliation queries.
 */
InternalRefundSchema.index({
  providerPaymentId: 1,
  status: 1,
});

/**
 * Administrative timeline queries.
 */
InternalRefundSchema.index({
  createdAt: -1,
});

/**
 * ==============================================================
 * Model
 * ==============================================================
 */

const InternalRefundModel = mongoose.model<
  InternalRefundDocument,
  InternalRefundModel
>("InternalRefund", InternalRefundSchema);

export default InternalRefundModel;
