// backend/src/models/internalProvider/internalSettlement.model.ts

import mongoose, { Document, Model, Schema, Types } from "mongoose";

import {
  ProviderFailureReason,
  ProviderSettlementStatus,
} from "../../constants/internalProvider";

import {
  ProviderAuditInfo,
  ProviderExecutionInfo,
  ProviderMetadata,
} from "../../types/internalProvider";

import {
  ProviderAuditSchema,
  ProviderExecutionSchema,
  ProviderMetadataSchema,
  ProviderPayloadSchema,
} from "./schemas";

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Internal Settlement Model
 * ------------------------------------------------------------------
 *
 * Represents the provider-side lifecycle of a Financial Domain
 * Settlement.
 *
 * This model stores only provider-owned execution information.
 *
 * Financial data remains inside the Financial Domain.
 * ------------------------------------------------------------------
 */

export interface InternalSettlementDocument extends Document {
  /**
   * Financial Domain settlement.
   */
  settlementId: Types.ObjectId;

  /**
   * Parent provider payment.
   */
  internalPaymentId: Types.ObjectId;

  /**
   * Parent provider payment identifier.
   *
   * Stored for reconciliation and reporting.
   */
  providerPaymentId: string;

  /**
   * Provider settlement identifier.
   */
  providerSettlementId: string;

  /**
   * External provider reference.
   */
  providerReference?: string;

  /**
   * Duplicate request protection.
   */
  idempotencyKey: string;

  /**
   * Current settlement status.
   */
  status: ProviderSettlementStatus;

  /**
   * Failure reason.
   */
  failureReason?: ProviderFailureReason;

  /**
   * Indicates whether the settlement has
   * reached a terminal state.
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
  scheduledAt?: Date;

  processingAt?: Date;

  settledAt?: Date;

  failedAt?: Date;

  cancelledAt?: Date;

  expiredAt?: Date;

  createdAt: Date;

  updatedAt: Date;
}

export interface InternalSettlementModel extends Model<InternalSettlementDocument> {}

const InternalSettlementSchema = new Schema<
  InternalSettlementDocument,
  InternalSettlementModel
>(
  {
    /**
     * ==============================================================
     * References
     * ==============================================================
     */

    settlementId: {
      type: Schema.Types.ObjectId,
      ref: "Settlement",
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

    providerSettlementId: {
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

    /**
     * ==============================================================
     * Provider State
     * ==============================================================
     */

    status: {
      type: String,
      enum: Object.values(ProviderSettlementStatus),
      required: true,
      default: ProviderSettlementStatus.CREATED,
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
     * Time when settlement was scheduled.
     */
    scheduledAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when settlement processing began.
     */
    processingAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when settlement completed successfully.
     */
    settledAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when settlement failed.
     */
    failedAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when settlement was cancelled.
     */
    cancelledAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when settlement expired.
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
 * One provider settlement per Financial Domain settlement.
 */
InternalSettlementSchema.index({ settlementId: 1 }, { unique: true });

/**
 * Parent provider payment lookup.
 */
InternalSettlementSchema.index({
  internalPaymentId: 1,
});

/**
 * Provider payment reconciliation lookup.
 */
InternalSettlementSchema.index({
  providerPaymentId: 1,
});

/**
 * Provider settlement lookup.
 */
InternalSettlementSchema.index({ providerSettlementId: 1 }, { unique: true });

/**
 * Duplicate request protection.
 */
InternalSettlementSchema.index({ idempotencyKey: 1 }, { unique: true });

/**
 * Active settlement queries.
 */
InternalSettlementSchema.index({
  status: 1,
  isTerminal: 1,
});

/**
 * Provider reconciliation queries.
 */
InternalSettlementSchema.index({
  providerPaymentId: 1,
  status: 1,
});

/**
 * Administrative timeline queries.
 */
InternalSettlementSchema.index({
  createdAt: -1,
});

/**
 * ==============================================================
 * Model
 * ==============================================================
 */

const InternalSettlementModel = mongoose.model<
  InternalSettlementDocument,
  InternalSettlementModel
>("InternalSettlement", InternalSettlementSchema);

export default InternalSettlementModel;
