// backend/src/models/internalProvider/internalProviderEvent.model.ts

import mongoose, { Document, Model, Schema, Types } from "mongoose";

import {
  ProviderEntityType,
  ProviderEventType,
  ProviderOperation,
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
 * Internal Provider Event Model
 * ------------------------------------------------------------------
 *
 * Immutable event history for every provider operation.
 *
 * Every significant provider action creates a new event.
 *
 * This collection functions as an append-only provider audit stream.
 * ------------------------------------------------------------------
 */

export interface InternalProviderEventDocument extends Document {
  /**
   * Provider entity category.
   */
  entityType: ProviderEntityType;

  /**
   * Related Internal Provider entity.
   */
  entityId: Types.ObjectId;

  /**
   * Event type.
   */
  eventType: ProviderEventType;

  /**
   * Operation executed.
   */
  operation: ProviderOperation;

  /**
   * Deterministic identity for an idempotent provider transition event.
   */
  transitionKey?: string;

  /**
   * Provider payment identifier.
   *
   * Used for reconciliation.
   */
  providerPaymentId?: string;

  /**
   * Provider entity identifier.
   *
   * Example:
   * providerRefundId
   * providerSettlementId
   * providerPayoutId
   * providerWebhookId
   */
  providerEntityId: string;

  /**
   * Optional provider reference.
   */
  providerReference?: string;

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
   * Event timestamp.
   */
  occurredAt: Date;

  createdAt: Date;
}

export interface InternalProviderEventModel extends Model<InternalProviderEventDocument> {}

const InternalProviderEventSchema = new Schema<
  InternalProviderEventDocument,
  InternalProviderEventModel
>(
  {
    /**
     * ==============================================================
     * Entity
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

    /**
     * ==============================================================
     * Event Information
     * ==============================================================
     */

    eventType: {
      type: String,
      enum: Object.values(ProviderEventType),
      required: true,
      immutable: true,
      index: true,
    },

    operation: {
      type: String,
      enum: Object.values(ProviderOperation),
      required: true,
      immutable: true,
      index: true,
    },

    transitionKey: {
      type: String,
      immutable: true,
      trim: true,
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

    providerEntityId: {
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
     * Event Timestamp
     * ==============================================================
     */

    /**
     * Time when the provider event occurred.
     *
     * This represents the business event time rather than the
     * document creation time and is immutable once recorded.
     */
    occurredAt: {
      type: Date,
      required: true,
      immutable: true,
      default: Date.now,
      index: true,
    },
  },
  {
    /**
     * Automatically maintain creation timestamp.
     *
     * Provider events are append-only and therefore
     * do not maintain an updatedAt timestamp.
     */
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },

    /**
     * Disable Mongoose versioning.
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
 * Timeline for a provider entity.
 */
InternalProviderEventSchema.index({
  entityType: 1,
  entityId: 1,
  occurredAt: 1,
});

/**
 * A committed provider transition may have one matching immutable event.
 * The partial filter leaves historical missing/null values unindexed.
 */
InternalProviderEventSchema.index(
  { transitionKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      transitionKey: { $type: "string" },
    },
  },
);

/**
 * Event type queries.
 */
InternalProviderEventSchema.index({
  eventType: 1,
  occurredAt: -1,
});

/**
 * Operation queries.
 */
InternalProviderEventSchema.index({
  operation: 1,
  occurredAt: -1,
});

/**
 * Provider payment reconciliation.
 */
InternalProviderEventSchema.index({
  providerPaymentId: 1,
  occurredAt: -1,
});

/**
 * Provider entity timeline.
 */
InternalProviderEventSchema.index({
  providerEntityId: 1,
  occurredAt: -1,
});

/**
 * Complete provider audit trail.
 */
InternalProviderEventSchema.index({
  entityType: 1,
  entityId: 1,
  eventType: 1,
  occurredAt: -1,
});

/**
 * Administrative timeline.
 */
InternalProviderEventSchema.index({
  occurredAt: -1,
});

/**
 * ==============================================================
 * Model
 * ==============================================================
 */

const InternalProviderEventModel = mongoose.model<
  InternalProviderEventDocument,
  InternalProviderEventModel
>("InternalProviderEvent", InternalProviderEventSchema);

export default InternalProviderEventModel;
