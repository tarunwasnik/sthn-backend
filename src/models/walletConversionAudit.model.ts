import mongoose, { Document, Schema, Types } from "mongoose";

import { SUPPORTED_CURRENCIES, SupportedCurrency } from
  "../constants/financial/supportedCurrencies";
import { FINANCIAL_LIMITS } from "../constants/financial/financialLimits";
import { WalletConversionAuditAction } from
  "../enums/financial/walletConversionAuditAction.enum";
import { WalletConversionDecision } from
  "../enums/financial/walletConversionDecision.enum";
import { WalletConversionRejectionCode } from
  "../enums/financial/walletConversionRejectionCode.enum";
import { InternalWalletConversionProviderRequestStatus } from
  "../enums/financial/internalWalletConversionProviderRequestStatus.enum";
import { WalletConversionProviderOutcome } from
  "../enums/financial/walletConversionProviderOutcome.enum";
import { WalletConversionOperationalClassification } from
  "../enums/financial/walletConversionOperationalClassification.enum";
import { WalletConversionOperationalSeverity } from
  "../enums/financial/walletConversionOperationalSeverity.enum";

export interface WalletConversionAuditDocument extends Document {
  auditKey: string;
  action: WalletConversionAuditAction;
  conversionReference: string;
  sourceCurrency: SupportedCurrency;
  targetCurrency: SupportedCurrency;
  sourceAmount: number;
  targetAmount: number;
  fxSnapshotReference: string;
  fxEffectiveDate: Date;
  requestedAt: Date;
  decision?: WalletConversionDecision;
  rejectionCode?: WalletConversionRejectionCode;
  adminActorId?: Types.ObjectId;
  decidedAt?: Date;
  providerRequestReference?: string;
  providerExecutionReference?: string;
  providerStatus?: InternalWalletConversionProviderRequestStatus;
  providerOutcome?: WalletConversionProviderOutcome;
  processingAt?: Date;
  completedAt?: Date;
  failureCode?: string;
  accountingReference?: string;
  transactionReference?: string;
  sourceProjectionReference?: string;
  targetProjectionReference?: string;
  sourceWalletVersion?: number;
  targetWalletVersion?: number;
  failedAt?: Date;
  reconciliationReference?: string;
  classification?: WalletConversionOperationalClassification;
  severity?: WalletConversionOperationalSeverity;
  issues?: string[];
  retryPerformed?: boolean;
  repairPerformed?: boolean;
  createdAt: Date;
}

const schema = new Schema<WalletConversionAuditDocument>({
  auditKey: { type: String, required: true, unique: true, immutable: true,
    select: false },
  action: { type: String, required: true, immutable: true,
    enum: Object.values(WalletConversionAuditAction) },
  conversionReference: { type: String, required: true, immutable: true,
    trim: true },
  sourceCurrency: { type: String, required: true, immutable: true,
    enum: SUPPORTED_CURRENCIES },
  targetCurrency: { type: String, required: true, immutable: true,
    enum: SUPPORTED_CURRENCIES },
  sourceAmount: { type: Number, required: true, immutable: true, min: 1,
    max: FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
    validate: Number.isSafeInteger },
  targetAmount: { type: Number, required: true, immutable: true, min: 1,
    max: FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
    validate: Number.isSafeInteger },
  fxSnapshotReference: { type: String, required: true, immutable: true,
    trim: true },
  fxEffectiveDate: { type: Date, required: true, immutable: true },
  requestedAt: { type: Date, required: true, immutable: true },
  decision: { type: String, immutable: true,
    enum: Object.values(WalletConversionDecision) },
  rejectionCode: { type: String, immutable: true,
    enum: Object.values(WalletConversionRejectionCode) },
  adminActorId: { type: Schema.Types.ObjectId, ref: "User", immutable: true,
    select: false },
  decidedAt: { type: Date, immutable: true },
  providerRequestReference: { type: String, immutable: true, trim: true },
  providerExecutionReference: { type: String, immutable: true, trim: true },
  providerStatus: { type: String, immutable: true,
    enum: Object.values(InternalWalletConversionProviderRequestStatus) },
  providerOutcome: { type: String, immutable: true,
    enum: Object.values(WalletConversionProviderOutcome) },
  processingAt: { type: Date, immutable: true },
  completedAt: { type: Date, immutable: true },
  failureCode: { type: String, immutable: true, trim: true, maxlength: 64 },
  accountingReference: { type: String, immutable: true, trim: true },
  transactionReference: { type: String, immutable: true, trim: true },
  sourceProjectionReference: { type: String, immutable: true, trim: true },
  targetProjectionReference: { type: String, immutable: true, trim: true },
  sourceWalletVersion: { type: Number, immutable: true, min: 1,
    validate: Number.isSafeInteger },
  targetWalletVersion: { type: Number, immutable: true, min: 1,
    validate: Number.isSafeInteger },
  failedAt: { type: Date, immutable: true },
  reconciliationReference: { type: String, immutable: true, trim: true },
  classification: { type: String, immutable: true,
    enum: Object.values(WalletConversionOperationalClassification) },
  severity: { type: String, immutable: true,
    enum: Object.values(WalletConversionOperationalSeverity) },
  issues: { type: [{ type: String, trim: true, maxlength: 96 }],
    immutable: true },
  retryPerformed: { type: Boolean, immutable: true },
  repairPerformed: { type: Boolean, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

schema.index({ conversionReference: 1, createdAt: -1 },
  { name: "wallet_conversion_audit_reference" });
schema.index({ action: 1, decidedAt: -1 },
  { name: "wallet_conversion_audit_decided" });
schema.index({ action: 1, completedAt: -1 },
  { name: "wallet_conversion_audit_provider_completed" });

export const WalletConversionAudit =
  mongoose.model<WalletConversionAuditDocument>("WalletConversionAudit", schema);
