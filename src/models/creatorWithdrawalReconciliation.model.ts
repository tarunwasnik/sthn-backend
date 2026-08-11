import { Document, model, Schema, Types } from "mongoose";

import { CreatorWithdrawalOperationalAction } from
  "../enums/financial/creatorWithdrawalOperationalAction.enum";
import { CreatorWithdrawalOperationalClassification } from
  "../enums/financial/creatorWithdrawalOperationalClassification.enum";
import { CreatorWithdrawalOperationalSeverity } from
  "../enums/financial/creatorWithdrawalOperationalSeverity.enum";
import { CreatorWithdrawalReconciliationStatus } from
  "../enums/financial/creatorWithdrawalReconciliationStatus.enum";

export interface CreatorWithdrawalReconciliationDocument extends Document {
  reconciliationReference: string;
  reconciliationKey: string;
  withdrawalRequestId: Types.ObjectId;
  withdrawalReference: string;
  providerRequestId?: Types.ObjectId;
  providerRequestReference?: string;
  creatorId: Types.ObjectId;
  creatorUserId: Types.ObjectId;
  walletId: Types.ObjectId;
  destinationReference: string;
  classification: CreatorWithdrawalOperationalClassification;
  status: CreatorWithdrawalReconciliationStatus;
  severity: CreatorWithdrawalOperationalSeverity;
  issueCodes: string[];
  recommendedAction?: CreatorWithdrawalOperationalAction;
  allowedActions: CreatorWithdrawalOperationalAction[];
  snapshot: Record<string, unknown>;
  snapshotFingerprint: string;
  retryCount: number;
  maxRetryCount: number;
  nextRetryAt?: Date;
  lastRetryAt?: Date;
  lastRetryCode?: string;
  acknowledgedAt?: Date;
  acknowledgedBy?: Types.ObjectId;
  resolvedAt?: Date;
  resolvedBy?: Types.ObjectId;
  resolutionCode?: string;
  resolutionNote?: string;
  detectedAt: Date;
  lastInspectedAt: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<CreatorWithdrawalReconciliationDocument>({
  reconciliationReference: { type: String, required: true, immutable: true, trim: true },
  reconciliationKey: { type: String, required: true, immutable: true, trim: true, select: false },
  withdrawalRequestId: { type: Schema.Types.ObjectId, ref: "CreatorWithdrawalRequest", required: true, immutable: true, select: false },
  withdrawalReference: { type: String, required: true, immutable: true, trim: true },
  providerRequestId: { type: Schema.Types.ObjectId, ref: "InternalWithdrawalProviderRequest", immutable: true, select: false },
  providerRequestReference: { type: String, trim: true },
  creatorId: { type: Schema.Types.ObjectId, ref: "CreatorProfile", required: true, immutable: true, select: false },
  creatorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true, select: false },
  walletId: { type: Schema.Types.ObjectId, ref: "Wallet", required: true, immutable: true, select: false },
  destinationReference: { type: String, required: true, immutable: true, trim: true },
  classification: { type: String, required: true, enum: Object.values(CreatorWithdrawalOperationalClassification) },
  status: { type: String, required: true, enum: Object.values(CreatorWithdrawalReconciliationStatus) },
  severity: { type: String, required: true, enum: Object.values(CreatorWithdrawalOperationalSeverity) },
  issueCodes: { type: [String], default: [] },
  recommendedAction: { type: String, enum: Object.values(CreatorWithdrawalOperationalAction) },
  allowedActions: { type: [String], enum: Object.values(CreatorWithdrawalOperationalAction), default: [] },
  snapshot: { type: Schema.Types.Mixed, required: true, select: false },
  snapshotFingerprint: { type: String, required: true, select: false, match: /^[a-f0-9]{64}$/ },
  retryCount: { type: Number, required: true, default: 0, min: 0 },
  maxRetryCount: { type: Number, required: true, min: 1 },
  nextRetryAt: Date,
  lastRetryAt: Date,
  lastRetryCode: { type: String, trim: true, maxlength: 100 },
  acknowledgedAt: Date,
  acknowledgedBy: { type: Schema.Types.ObjectId, ref: "User", select: false },
  resolvedAt: Date,
  resolvedBy: { type: Schema.Types.ObjectId, ref: "User", select: false },
  resolutionCode: { type: String, trim: true, maxlength: 100 },
  resolutionNote: { type: String, trim: true, maxlength: 500 },
  detectedAt: { type: Date, required: true, immutable: true },
  lastInspectedAt: { type: Date, required: true },
  version: { type: Number, required: true, default: 1, min: 1 },
}, { timestamps: true, versionKey: false });

schema.index({ reconciliationReference: 1 }, { unique: true });
schema.index({ reconciliationKey: 1 }, { unique: true });
schema.index({ withdrawalRequestId: 1 }, { unique: true });
schema.index({ withdrawalReference: 1 }, { unique: true });
schema.index({ providerRequestReference: 1 });
schema.index({ status: 1, classification: 1, createdAt: -1 });
schema.index({ status: 1, nextRetryAt: 1 });
schema.index({ severity: 1, createdAt: -1 });
schema.index({ createdAt: -1 });

export const CreatorWithdrawalReconciliation =
  model<CreatorWithdrawalReconciliationDocument>(
    "CreatorWithdrawalReconciliation", schema,
  );
