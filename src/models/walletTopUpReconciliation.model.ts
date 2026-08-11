import { Document, model, Schema, Types } from "mongoose";
import { WalletTopUpReconciliationClassification } from "../enums/financial/walletTopUpReconciliationClassification.enum";
import { WalletTopUpReconciliationStatus } from "../enums/financial/walletTopUpReconciliationStatus.enum";
import { WalletTopUpReconciliationSeverity } from "../enums/financial/walletTopUpReconciliationSeverity.enum";
import { WalletTopUpOperationalAction } from "../enums/financial/walletTopUpOperationalAction.enum";

export interface WalletTopUpReconciliationDocument extends Document {
  reconciliationReference: string;
  reconciliationKey: string;
  topUpRequestId: Types.ObjectId;
  topUpReference: string;
  userId: Types.ObjectId;
  walletId: Types.ObjectId;
  providerFundingId?: Types.ObjectId;
  providerFundingReference?: string;
  classification: WalletTopUpReconciliationClassification;
  status: WalletTopUpReconciliationStatus;
  severity: WalletTopUpReconciliationSeverity;
  detectedIssues: string[];
  detectedAt: Date;
  lastInspectedAt: Date;
  recommendedAction?: WalletTopUpOperationalAction;
  allowedActions: WalletTopUpOperationalAction[];
  retryCount: number;
  maxRetryCount: number;
  nextRetryAt?: Date;
  lastRetryAt?: Date;
  lastRetryCode?: string;
  resolutionAction?: WalletTopUpOperationalAction;
  resolutionCode?: string;
  resolutionNote?: string;
  resolvedAt?: Date;
  resolvedBy?: Types.ObjectId;
  snapshot: Record<string, unknown>;
  fingerprint: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<WalletTopUpReconciliationDocument>({
  reconciliationReference: { type: String, required: true, immutable: true, unique: true, trim: true },
  reconciliationKey: { type: String, required: true, immutable: true, unique: true, select: false },
  topUpRequestId: { type: Schema.Types.ObjectId, ref: "WalletTopUpRequest", required: true, immutable: true, unique: true },
  topUpReference: { type: String, required: true, immutable: true, index: true, trim: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true, select: false },
  walletId: { type: Schema.Types.ObjectId, ref: "Wallet", required: true, immutable: true, select: false },
  providerFundingId: { type: Schema.Types.ObjectId, ref: "InternalTopUpFunding", select: false },
  providerFundingReference: { type: String, trim: true, index: true },
  classification: { type: String, required: true, enum: Object.values(WalletTopUpReconciliationClassification), index: true },
  status: { type: String, required: true, enum: Object.values(WalletTopUpReconciliationStatus), index: true },
  severity: { type: String, required: true, enum: Object.values(WalletTopUpReconciliationSeverity), index: true },
  detectedIssues: { type: [String], default: [] },
  detectedAt: { type: Date, required: true, immutable: true },
  lastInspectedAt: { type: Date, required: true },
  recommendedAction: { type: String, enum: Object.values(WalletTopUpOperationalAction) },
  allowedActions: { type: [String], enum: Object.values(WalletTopUpOperationalAction), default: [] },
  retryCount: { type: Number, required: true, default: 0, min: 0 },
  maxRetryCount: { type: Number, required: true, min: 1 },
  nextRetryAt: Date,
  lastRetryAt: Date,
  lastRetryCode: { type: String, trim: true },
  resolutionAction: { type: String, enum: Object.values(WalletTopUpOperationalAction) },
  resolutionCode: { type: String, trim: true },
  resolutionNote: { type: String, trim: true, maxlength: 500 },
  resolvedAt: Date,
  resolvedBy: { type: Schema.Types.ObjectId, ref: "User", select: false },
  snapshot: { type: Schema.Types.Mixed, required: true, select: false },
  fingerprint: { type: String, required: true, select: false },
  version: { type: Number, required: true, default: 1, min: 1 },
}, { timestamps: true, versionKey: false });

schema.index({ status: 1, classification: 1, createdAt: -1 });
schema.index({ status: 1, nextRetryAt: 1 });
schema.index({ createdAt: -1 });

export const WalletTopUpReconciliation = model<WalletTopUpReconciliationDocument>(
  "WalletTopUpReconciliation",
  schema,
);
