import mongoose, { Document, Schema } from "mongoose";

import { PayoutDestinationType } from "../enums/financial/payoutDestinationType.enum";
import { PayoutDestinationVerificationStatus } from "../enums/financial/payoutDestinationVerificationStatus.enum";
import type { EncryptedPayoutDestinationPayload } from "../services/security/payoutDestinationCrypto.service";

export interface IPayoutDestination extends Document {
  destinationReference: string;
  creatorId: mongoose.Types.ObjectId;
  type: PayoutDestinationType;
  verificationStatus: PayoutDestinationVerificationStatus;
  isActive: boolean;
  idempotencyKey: string;
  destinationFingerprint: string;
  requestFingerprint: string;
  encryptedPayload: EncryptedPayoutDestinationPayload;
  maskedIdentifier: string;
  accountNumberLast4?: string;
  ifscDisplay?: string;
  deactivatedAt?: Date;
  reactivatedAt?: Date;
  verifiedAt?: Date;
  verifiedBy?: mongoose.Types.ObjectId;
  rejectedAt?: Date;
  rejectedBy?: mongoose.Types.ObjectId;
  rejectionCode?: string;
  rejectionReason?: string;
  verificationNote?: string;
  withdrawalBindingRevision: number;
  createdAt: Date;
  updatedAt: Date;
}

const EncryptedPayloadSchema = new Schema<EncryptedPayoutDestinationPayload>(
  {
    version: { type: Number, required: true, enum: [1] },
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
  },
  { _id: false },
);

const PayoutDestinationSchema = new Schema<IPayoutDestination>(
  {
    destinationReference: {
      type: String, required: true, unique: true, immutable: true, index: true, trim: true,
    },
    creatorId: {
      type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true,
    },
    type: {
      type: String, enum: Object.values(PayoutDestinationType), required: true, immutable: true, index: true,
    },
    verificationStatus: {
      type: String,
      enum: Object.values(PayoutDestinationVerificationStatus),
      required: true,
      default: PayoutDestinationVerificationStatus.UNVERIFIED,
      index: true,
    },
    isActive: { type: Boolean, required: true, default: true, index: true },
    idempotencyKey: {
      type: String, required: true, immutable: true, trim: true, lowercase: true, select: false,
    },
    destinationFingerprint: {
      type: String, required: true, immutable: true, select: false,
    },
    requestFingerprint: {
      type: String, required: true, immutable: true, select: false,
    },
    encryptedPayload: { type: EncryptedPayloadSchema, required: true, immutable: true, select: false },
    maskedIdentifier: { type: String, required: true, immutable: true, trim: true },
    accountNumberLast4: {
      type: String,
      immutable: true,
    },
    ifscDisplay: {
      type: String,
      immutable: true,
      uppercase: true,
    },
    deactivatedAt: Date,
    reactivatedAt: Date,
    verifiedAt: Date,
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      select: false,
    },
    rejectedAt: Date,
    rejectedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      select: false,
    },
    rejectionCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 64,
      select: false,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    verificationNote: {
      type: String,
      trim: true,
      maxlength: 500,
      select: false,
    },
    withdrawalBindingRevision: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      select: false,
    },
  },
  { timestamps: true },
);

PayoutDestinationSchema.pre("validate", function () {
  if (this.type === PayoutDestinationType.BANK_ACCOUNT) {
    if (!/^\d{4}$/.test(this.accountNumberLast4 ?? "")) {
      throw new Error("Bank destinations require accountNumberLast4.");
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(this.ifscDisplay ?? "")) {
      throw new Error("Bank destinations require a valid IFSC display value.");
    }
  } else if (this.accountNumberLast4 !== undefined || this.ifscDisplay !== undefined) {
    throw new Error("UPI destinations cannot include bank display fields.");
  }
});

PayoutDestinationSchema.index({ creatorId: 1, idempotencyKey: 1 }, { unique: true });
PayoutDestinationSchema.index(
  { creatorId: 1, type: 1, destinationFingerprint: 1 },
  { unique: true },
);
PayoutDestinationSchema.index({ creatorId: 1, isActive: 1, createdAt: -1 });

export const PayoutDestination = mongoose.model<IPayoutDestination>(
  "PayoutDestination",
  PayoutDestinationSchema,
);
