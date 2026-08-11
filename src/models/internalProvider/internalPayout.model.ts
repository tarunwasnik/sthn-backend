// backend/src/models/internalProvider/internalPayout.model.ts

import mongoose, { Document, Model, Schema, Types } from "mongoose";

import {
  ProviderFailureReason,
  ProviderPayoutStatus,
} from "../../constants/internalProvider";
import { PayoutDestinationType } from "../../enums/financial/payoutDestinationType.enum";

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
 * Internal Payout Model
 * ------------------------------------------------------------------
 *
 * Represents the provider-side lifecycle of a Financial Domain
 * Payout.
 *
 * Stores only provider execution information.
 *
 * Financial calculations remain inside the Financial Domain.
 * ------------------------------------------------------------------
 */

export interface InternalPayoutDocument extends Document {
  /**
   * Financial Domain payout.
   */
  payoutId: Types.ObjectId;

  /**
   * Parent provider payment.
   */
  internalPaymentId?: Types.ObjectId;

  /**
   * Parent provider settlement.
   */
  internalSettlementId?: Types.ObjectId;

  /**
   * Provider payment identifier.
   */
  providerPaymentId?: string;

  /**
   * Provider settlement identifier.
   */
  providerSettlementId?: string;

  /**
   * Provider payout identifier.
   */
  providerPayoutId: string;

  /**
   * External provider reference.
   */
  providerReference?: string;

  /** Stable provider-side transaction identifier assigned on completion. */
  providerTransactionId?: string;

  /**
   * Duplicate request protection.
   */
  idempotencyKey: string;

  /**
   * Current payout status.
   */
  status: ProviderPayoutStatus;

  /**
   * Failure reason.
   */
  failureReason?: ProviderFailureReason;

  /** Safe provider failure details supplied by the simulator. */
  failureCode?: string;

  failureMessage?: string;

  /** Safe, provider-owned simulator metadata. */
  simulated?: boolean;

  simulatedAction?: string;

  simulatedAt?: Date;

  simulatedByAdminId?: string;

  simulationNote?: string;

  /**
   * Indicates whether the payout
   * has reached a terminal state.
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

  /** Provider-owned secure representation of a withdrawal payout destination. */
  providerDestination?: {
    version: 1;
    sourceSnapshotVersion: 1;
    destinationReference: string;
    type: PayoutDestinationType;
    maskedIdentifier: string;
    accountNumberLast4?: string;
    ifscDisplay?: string;
    fingerprint: string;
    encryptedPayload: {
      version: 1;
      ciphertext: string;
      iv: string;
      authTag: string;
    };
  };

  /**
   * Lifecycle timestamps.
   */
  scheduledAt?: Date;

  processingAt?: Date;

  paidAt?: Date;

  failedAt?: Date;

  cancelledAt?: Date;

  expiredAt?: Date;

  createdAt: Date;

  updatedAt: Date;
}

export interface InternalPayoutModel extends Model<InternalPayoutDocument> {}

const EncryptedProviderDestinationPayloadSchema = new Schema(
  {
    version: { type: Number, required: true, enum: [1], immutable: true },
    ciphertext: { type: String, required: true, immutable: true },
    iv: { type: String, required: true, immutable: true },
    authTag: { type: String, required: true, immutable: true },
  },
  { _id: false },
);

const ProviderDestinationSchema = new Schema(
  {
    version: { type: Number, required: true, enum: [1], immutable: true },
    sourceSnapshotVersion: { type: Number, required: true, enum: [1], immutable: true },
    destinationReference: { type: String, required: true, trim: true, immutable: true },
    type: { type: String, required: true, enum: Object.values(PayoutDestinationType), immutable: true },
    maskedIdentifier: { type: String, required: true, trim: true, immutable: true },
    accountNumberLast4: { type: String, immutable: true },
    ifscDisplay: { type: String, immutable: true, uppercase: true },
    fingerprint: { type: String, required: true, immutable: true, select: false, match: /^[a-f0-9]{64}$/ },
    encryptedPayload: { type: EncryptedProviderDestinationPayloadSchema, required: true, immutable: true, select: false },
  },
  { _id: false },
);

const InternalPayoutSchema = new Schema<
  InternalPayoutDocument,
  InternalPayoutModel
>(
  {
    /**
     * ==============================================================
     * References
     * ==============================================================
     */

    payoutId: {
      type: Schema.Types.ObjectId,
      ref: "Payout",
      required: true,
      immutable: true,
      index: true,
    },

    internalPaymentId: {
      type: Schema.Types.ObjectId,
      ref: "InternalPayment",
      immutable: true,
      index: true,
    },

    internalSettlementId: {
      type: Schema.Types.ObjectId,
      ref: "InternalSettlement",
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
      immutable: true,
      trim: true,
      index: true,
    },

    providerSettlementId: {
      type: String,
      immutable: true,
      trim: true,
      index: true,
    },

    providerPayoutId: {
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

    providerTransactionId: {
      type: String,
      default: null,
      trim: true,
      index: true,
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
      enum: Object.values(ProviderPayoutStatus),
      required: true,
      default: ProviderPayoutStatus.CREATED,
      index: true,
    },

    failureReason: {
      type: String,
      enum: Object.values(ProviderFailureReason),
      default: null,
    },

    failureCode: {
      type: String,
      default: null,
      trim: true,
      maxlength: 64,
    },

    failureMessage: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    simulated: {
      type: Boolean,
      default: false,
    },

    simulatedAction: {
      type: String,
      default: null,
      trim: true,
    },

    simulatedAt: {
      type: Date,
      default: null,
    },

    simulatedByAdminId: {
      type: String,
      default: null,
      trim: true,
    },

    simulationNote: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
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

    providerDestination: {
      type: ProviderDestinationSchema,
      immutable: true,
    },

    /**
     * ==============================================================
     * Lifecycle Timestamps
     * ==============================================================
     */

    /**
     * Time when the payout was scheduled.
     */
    scheduledAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when payout processing began.
     */
    processingAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when the payout completed successfully.
     */
    paidAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when the payout failed.
     */
    failedAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when the payout was cancelled.
     */
    cancelledAt: {
      type: Date,
      default: null,
    },

    /**
     * Time when the payout expired.
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

InternalPayoutSchema.pre("validate", function () {
  const destination = this.providerDestination;
  if (!destination) return;
  if (destination.version !== 1 || destination.sourceSnapshotVersion !== 1) {
    throw new Error("Internal payout destination is invalid.");
  }
  if (destination.type === PayoutDestinationType.BANK_ACCOUNT) {
    if (
      !/^\d{4}$/.test(destination.accountNumberLast4 ?? "") ||
      !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(destination.ifscDisplay ?? "") ||
      destination.maskedIdentifier !== `••••${destination.accountNumberLast4}`
    ) {
      throw new Error("Internal payout bank destination is invalid.");
    }
  } else if (destination.type === PayoutDestinationType.UPI) {
    if (destination.accountNumberLast4 !== undefined || destination.ifscDisplay !== undefined) {
      throw new Error("Internal payout UPI destination is invalid.");
    }
  } else {
    throw new Error("Internal payout destination type is invalid.");
  }
});
/**
 * ==============================================================
 * Indexes
 * ==============================================================
 */

/**
 * One provider payout per Financial Domain payout.
 */
InternalPayoutSchema.index({ payoutId: 1 }, { unique: true });

/**
 * Parent provider payment lookup.
 */
InternalPayoutSchema.index({
  internalPaymentId: 1,
});

/**
 * Parent provider settlement lookup.
 */
InternalPayoutSchema.index({
  internalSettlementId: 1,
});

/**
 * Provider payment reconciliation.
 */
InternalPayoutSchema.index({
  providerPaymentId: 1,
});

/**
 * Provider settlement reconciliation.
 */
InternalPayoutSchema.index({
  providerSettlementId: 1,
});

/**
 * Provider payout lookup.
 */
InternalPayoutSchema.index({ providerPayoutId: 1 }, { unique: true });

/**
 * Duplicate request protection.
 */
InternalPayoutSchema.index({ idempotencyKey: 1 }, { unique: true });

/**
 * Active payout queries.
 */
InternalPayoutSchema.index({
  status: 1,
  isTerminal: 1,
});

/**
 * Reconciliation queries.
 */
InternalPayoutSchema.index({
  providerPaymentId: 1,
  providerSettlementId: 1,
  status: 1,
});

/**
 * Administrative timeline queries.
 */
InternalPayoutSchema.index({
  createdAt: -1,
});

/**
 * ==============================================================
 * Model
 * ==============================================================
 */

const InternalPayoutModel = mongoose.model<
  InternalPayoutDocument,
  InternalPayoutModel
>("InternalPayout", InternalPayoutSchema);

export default InternalPayoutModel;
