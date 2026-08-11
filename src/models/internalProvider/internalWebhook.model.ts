// backend/src/models/internalProvider/internalWebhook.model.ts

import mongoose, { Document, Model, Schema, Types } from "mongoose";

import {
  ProviderEntityType,
  ProviderFailureReason,
  ProviderWebhookStatus,
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
 * Internal Webhook Model
 * ------------------------------------------------------------------
 *
 * Represents a webhook delivery generated or received by the
 * Internal Provider.
 *
 * This model stores webhook execution information only.
 *
 * Financial state remains inside the Financial Domain.
 * ------------------------------------------------------------------
 */

export interface InternalWebhookDocument extends Document {
  /**
   * Related provider entity.
   */
  entityType: ProviderEntityType;

  /**
   * Internal provider entity identifier.
   */
  entityId: Types.ObjectId;

  /**
   * Provider entity identifier.
   *
   * Used for provider reconciliation.
   */
  providerEntityId?: string;

  /**
   * Provider payment identifier.
   *
   * Used for reconciliation.
   */
  providerPaymentId?: string;

  /**
   * Provider webhook identifier.
   */
  providerWebhookId: string;

  /**
   * Provider webhook event name.
   *
   * Example:
   * payment.authorized
   * payment.captured
   * refund.completed
   * payout.completed
   */
  eventName: string;

  /**
   * External provider reference.
   */
  providerReference?: string;

  /**
   * Duplicate protection.
   */
  idempotencyKey: string;

  /**
   * Current webhook processing status.
   */
  status: ProviderWebhookStatus;

  /**
   * Failure reason.
   */
  failureReason?: ProviderFailureReason;

  /**
   * Indicates whether the webhook
   * lifecycle has reached a terminal state.
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
   * Raw webhook payloads.
   */
  payloads: {
    request: unknown;
    response: unknown;
  };

  /**
   * Lifecycle timestamps.
   */
  receivedAt?: Date;

  validatedAt?: Date;

  verifiedAt?: Date;

  processingAt?: Date;

  processedAt?: Date;

  retriedAt?: Date;

  replayedAt?: Date;

  failedAt?: Date;

  rejectedAt?: Date;

  expiredAt?: Date;

  createdAt: Date;

  updatedAt: Date;
}

export interface InternalWebhookModel extends Model<InternalWebhookDocument> {}

const InternalWebhookSchema = new Schema<
  InternalWebhookDocument,
  InternalWebhookModel
>(
  {
    /**
     * ==============================================================
     * Entity Reference
     * ==============================================================
     */

    entityType: {
      type: String,
      enum: Object.values(ProviderEntityType),
      required: true,
      immutable: true,
      index: true,
    },

    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
      index: true,
    },

    providerEntityId: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      index: true,
    },

    /**
     * ==============================================================
     * Provider Identifiers
     * ==============================================================
     */

    providerPaymentId: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      index: true,
    },

    providerWebhookId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
    },

    eventName: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      index: true,
    },

    providerReference: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
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
     * Processing State
     * ==============================================================
     */

    status: {
      type: String,
      enum: Object.values(ProviderWebhookStatus),
      required: true,
      default: ProviderWebhookStatus.CREATED,
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
     * Webhook Processing Lifecycle
     * ==============================================================
     *
     * CREATED
     * ↓
     * RECEIVED
     * ↓
     * VALIDATING
     * ↓
     * VERIFIED
     * ↓
     * PROCESSING
     * ↓
     * PROCESSED
     *
     * Terminal paths:
     * - FAILED
     * - REJECTED
     * - EXPIRED
     *
     * Recovery paths:
     * - RETRYING
     * - REPLAYED
     */

    /**
     * Time when the webhook was received.
     */
    receivedAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when validation started.
     */
    validatedAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when validation completed successfully.
     */
    verifiedAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when webhook processing started.
     */
    processingAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when webhook processing completed.
     */
    processedAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when the webhook entered retry.
     */
    retriedAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when the webhook was replayed.
     */
    replayedAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when processing permanently failed.
     */
    failedAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when the webhook was rejected.
     */
    rejectedAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when the webhook expired.
     */
    expiredAt: {
      type: Date,
      default: null,
    },
  },
  {
    /**
     * Automatically maintain creation/update timestamps.
     */
    timestamps: true,

    /**
     * Disable Mongoose version key.
     */
    versionKey: false,

    /**
     * Preserve empty embedded provider objects.
     */
    minimize: false,

    /**
     * Include virtuals during serialization.
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
 * Generic entity lookup.
 */
InternalWebhookSchema.index({
  entityType: 1,
  entityId: 1,
});

/**
 * Provider entity lookup.
 */
InternalWebhookSchema.index({
  providerEntityId: 1,
});

/**
 * Provider payment reconciliation.
 */
InternalWebhookSchema.index({
  providerPaymentId: 1,
});

/**
 * Provider webhook lookup.
 */
InternalWebhookSchema.index({ providerWebhookId: 1 }, { unique: true });

/**
 * Event name queries.
 */
InternalWebhookSchema.index({
  eventName: 1,
});

/**
 * Duplicate webhook protection.
 */
InternalWebhookSchema.index({ idempotencyKey: 1 }, { unique: true });

/**
 * Active webhook deliveries.
 */
InternalWebhookSchema.index({
  status: 1,
  isTerminal: 1,
});

/**
 * Entity event history.
 */
InternalWebhookSchema.index({
  entityType: 1,
  entityId: 1,
  createdAt: -1,
});

/**
 * Administrative timeline.
 */
InternalWebhookSchema.index({
  createdAt: -1,
});

/**
 * ==============================================================
 * Model
 * ==============================================================
 */

const InternalWebhookModel = mongoose.model<
  InternalWebhookDocument,
  InternalWebhookModel
>("InternalWebhook", InternalWebhookSchema);

export default InternalWebhookModel;
