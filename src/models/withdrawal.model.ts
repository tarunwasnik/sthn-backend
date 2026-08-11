import mongoose, { Document, Schema } from "mongoose";

import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "../constants/financial/supportedCurrencies";
import { WithdrawalStatus } from "../enums/financial/withdrawalStatus.enum";
import { PayoutDestinationType } from "../enums/financial/payoutDestinationType.enum";
import { PayoutDestinationVerificationStatus } from "../enums/financial/payoutDestinationVerificationStatus.enum";
import type { IWithdrawalDestinationSnapshot } from "../types/financial/withdrawalDestinationSnapshot.type";

export interface IWithdrawal extends Document {
  withdrawalReference: string;
  creatorId: mongoose.Types.ObjectId;
  amount: number;
  currency: SupportedCurrency;
  status: WithdrawalStatus;
  idempotencyKey: string;
  requestedAt: Date;
  reservedAt?: Date;
  payoutId?: mongoose.Types.ObjectId;
  payoutDestinationId?: mongoose.Types.ObjectId;
  destinationSnapshot?: IWithdrawalDestinationSnapshot;
  processingAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  isActiveObligation: boolean;
  cancelledAt?: Date;
  cancelledBy?: mongoose.Types.ObjectId;
  cancellationReason?: string;
  attributes?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const EncryptedWithdrawalDestinationSnapshotPayloadSchema = new Schema(
  {
    version: { type: Number, required: true, enum: [1], immutable: true },
    ciphertext: { type: String, required: true, immutable: true },
    iv: { type: String, required: true, immutable: true },
    authTag: { type: String, required: true, immutable: true },
  },
  { _id: false },
);

const WithdrawalDestinationSnapshotSchema = new Schema(
  {
    version: { type: Number, required: true, enum: [1], immutable: true },
    destinationReference: { type: String, required: true, immutable: true, trim: true },
    type: { type: String, enum: Object.values(PayoutDestinationType), required: true, immutable: true },
    maskedIdentifier: { type: String, required: true, immutable: true, trim: true },
    accountNumberLast4: { type: String, immutable: true },
    ifscDisplay: { type: String, immutable: true, uppercase: true },
    verificationStatus: { type: String, enum: [PayoutDestinationVerificationStatus.VERIFIED], required: true, immutable: true },
    verifiedAt: { type: Date, required: true, immutable: true },
    snapshotCreatedAt: { type: Date, required: true, immutable: true },
    encryptedPayload: { type: EncryptedWithdrawalDestinationSnapshotPayloadSchema, required: true, immutable: true, select: false },
  },
  { _id: false },
);

const WithdrawalSchema = new Schema<IWithdrawal>(
  {
    withdrawalReference: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      index: true,
      trim: true,
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
      immutable: true,
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
      enum: Object.values(WithdrawalStatus),
      required: true,
      default: WithdrawalStatus.REQUESTED,
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    requestedAt: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true,
    },
    reservedAt: Date,
    payoutId: {
      type: Schema.Types.ObjectId,
      ref: "Payout",
      index: true,
    },
    payoutDestinationId: {
      type: Schema.Types.ObjectId,
      ref: "PayoutDestination",
      immutable: true,
      index: true,
    },
    destinationSnapshot: {
      type: WithdrawalDestinationSnapshotSchema,
      immutable: true,
    },
    processingAt: Date,
    completedAt: Date,
    failedAt: Date,
    failureReason: {
      type: String,
      trim: true,
    },
    isActiveObligation: { type: Boolean, required: true, default: true, index: true },
    cancelledAt: Date,
    cancelledBy: { type: Schema.Types.ObjectId, ref: "User" },
    cancellationReason: { type: String, trim: true, maxlength: 500 },
    attributes: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: true },
);

WithdrawalSchema.index({ creatorId: 1, status: 1 });
WithdrawalSchema.index({ creatorId: 1 }, { unique: true, partialFilterExpression: { isActiveObligation: true } });
WithdrawalSchema.index({ status: 1, createdAt: -1 });
WithdrawalSchema.index({ payoutId: 1 });

WithdrawalSchema.pre("validate", function () {
  const hasDestinationId = this.payoutDestinationId !== undefined && this.payoutDestinationId !== null;
  const snapshot = this.destinationSnapshot;
  if (hasDestinationId !== Boolean(snapshot)) {
    throw new Error("Withdrawal destination snapshot state is inconsistent.");
  }
  if (!snapshot) return;
  if (snapshot.version !== 1 || snapshot.verificationStatus !== PayoutDestinationVerificationStatus.VERIFIED) {
    throw new Error("Withdrawal destination snapshot state is invalid.");
  }
  if (snapshot.type === PayoutDestinationType.BANK_ACCOUNT) {
    if (!/^\d{4}$/.test(snapshot.accountNumberLast4 ?? "") || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(snapshot.ifscDisplay ?? "") || snapshot.maskedIdentifier !== `••••${snapshot.accountNumberLast4}`) {
      throw new Error("Withdrawal bank destination snapshot is invalid.");
    }
  } else if (snapshot.type === PayoutDestinationType.UPI) {
    if (snapshot.accountNumberLast4 !== undefined || snapshot.ifscDisplay !== undefined) {
      throw new Error("Withdrawal UPI destination snapshot is invalid.");
    }
  } else {
    throw new Error("Withdrawal destination snapshot type is invalid.");
  }
});

export const Withdrawal = mongoose.model<IWithdrawal>(
  "Withdrawal",
  WithdrawalSchema,
);
