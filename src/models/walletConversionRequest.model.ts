import mongoose, { Document, Schema, Types } from "mongoose";

import { FINANCIAL_LIMITS } from "../constants/financial/financialLimits";
import { SUPPORTED_CURRENCIES, SupportedCurrency } from
  "../constants/financial/supportedCurrencies";
import { FX_RATE_MAX_DECIMAL_SCALE } from
  "../constants/financial/fxRate.constants";
import { WalletConversionRequestStatus } from
  "../enums/financial/walletConversionRequestStatus.enum";
import { WalletConversionRejectionCode } from
  "../enums/financial/walletConversionRejectionCode.enum";
import { InternalWalletConversionProviderRequestStatus } from
  "../enums/financial/internalWalletConversionProviderRequestStatus.enum";
import { WalletConversionProviderOutcome } from
  "../enums/financial/walletConversionProviderOutcome.enum";

export interface WalletConversionRequestDocument extends Document {
  conversionReference: string;
  conversionKey: string;
  userId: Types.ObjectId;
  sourceWalletId: Types.ObjectId;
  targetWalletId?: Types.ObjectId;
  sourceCurrency: SupportedCurrency;
  targetCurrency: SupportedCurrency;
  sourceAmount: number;
  targetAmount: number;
  fxSnapshotId: Types.ObjectId;
  fxSnapshotReference: string;
  fxProvider: string;
  fxEffectiveDate: Date;
  rateValue: string;
  rateScale: number;
  inverseRateValue: string;
  inverseRateScale: number;
  sourceMinorUnits: number;
  targetMinorUnits: number;
  idempotencyKey: string;
  requestFingerprint: string;
  status: WalletConversionRequestStatus;
  requestedAt: Date;
  decidedAt?: Date;
  decidedBy?: Types.ObjectId;
  rejectionCode?: WalletConversionRejectionCode;
  rejectionReason?: string;
  providerRequestReference?: string;
  providerExecutionReference?: string;
  providerStatus?: InternalWalletConversionProviderRequestStatus;
  providerOutcome?: WalletConversionProviderOutcome;
  providerProcessingAt?: Date;
  providerCompletedAt?: Date;
  providerFailureCode?: string;
  providerMetadata?: { provider: string; responseCode: string };
  accountingReference?: string;
  accountingKey?: string;
  accountingFingerprint?: string;
  accountingTransactionReference?: string;
  accountingTargetWalletId?: Types.ObjectId;
  sourceProjectionReference?: string;
  targetProjectionReference?: string;
  sourceWalletVersion?: number;
  targetWalletVersion?: number;
  completedAt?: Date;
  failedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<WalletConversionRequestDocument>({
  conversionReference: { type: String, required: true, unique: true,
    immutable: true, trim: true },
  conversionKey: { type: String, required: true, unique: true,
    immutable: true, select: false },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true,
    immutable: true, select: false },
  sourceWalletId: { type: Schema.Types.ObjectId, ref: "Wallet", required: true,
    immutable: true, select: false },
  targetWalletId: { type: Schema.Types.ObjectId, ref: "Wallet", immutable: true,
    select: false },
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
  fxSnapshotId: { type: Schema.Types.ObjectId, ref: "ExchangeRateSnapshot",
    required: true, immutable: true, select: false },
  fxSnapshotReference: { type: String, required: true, immutable: true,
    trim: true },
  fxProvider: { type: String, required: true, immutable: true, trim: true,
    maxlength: 64 },
  fxEffectiveDate: { type: Date, required: true, immutable: true },
  rateValue: { type: String, required: true, immutable: true, select: false,
    validate: /^\d+$/ },
  rateScale: { type: Number, required: true, immutable: true, select: false,
    min: 0, max: FX_RATE_MAX_DECIMAL_SCALE, validate: Number.isSafeInteger },
  inverseRateValue: { type: String, required: true, immutable: true,
    select: false, validate: /^\d+$/ },
  inverseRateScale: { type: Number, required: true, immutable: true,
    select: false, min: 0, max: FX_RATE_MAX_DECIMAL_SCALE,
    validate: Number.isSafeInteger },
  sourceMinorUnits: { type: Number, required: true, immutable: true,
    select: false, min: 0, max: 6, validate: Number.isSafeInteger },
  targetMinorUnits: { type: Number, required: true, immutable: true,
    select: false, min: 0, max: 6, validate: Number.isSafeInteger },
  idempotencyKey: { type: String, required: true, immutable: true,
    trim: true, lowercase: true, select: false },
  requestFingerprint: { type: String, required: true, immutable: true,
    select: false },
  status: { type: String, required: true,
    enum: Object.values(WalletConversionRequestStatus),
    default: WalletConversionRequestStatus.PENDING },
  requestedAt: { type: Date, required: true, immutable: true },
  decidedAt: { type: Date },
  decidedBy: { type: Schema.Types.ObjectId, ref: "User", select: false },
  rejectionCode: { type: String,
    enum: Object.values(WalletConversionRejectionCode) },
  rejectionReason: { type: String, trim: true, maxlength: 500 },
  providerRequestReference: { type: String, trim: true },
  providerExecutionReference: { type: String, trim: true },
  providerStatus: { type: String,
    enum: Object.values(InternalWalletConversionProviderRequestStatus) },
  providerOutcome: { type: String,
    enum: Object.values(WalletConversionProviderOutcome) },
  providerProcessingAt: Date,
  providerCompletedAt: Date,
  providerFailureCode: { type: String, trim: true, maxlength: 64 },
  providerMetadata: { type: new Schema({
    provider: { type: String, required: true, trim: true, maxlength: 64 },
    responseCode: { type: String, required: true, trim: true, maxlength: 64 },
  }, { _id: false }), select: false },
  accountingReference: { type: String, trim: true },
  accountingKey: { type: String, trim: true, select: false },
  accountingFingerprint: { type: String, select: false,
    match: /^[a-f0-9]{64}$/ },
  accountingTransactionReference: { type: String, trim: true, select: false },
  accountingTargetWalletId: { type: Schema.Types.ObjectId, ref: "Wallet",
    select: false },
  sourceProjectionReference: { type: String, trim: true, select: false },
  targetProjectionReference: { type: String, trim: true, select: false },
  sourceWalletVersion: { type: Number, min: 1, select: false,
    validate: Number.isSafeInteger },
  targetWalletVersion: { type: Number, min: 1, select: false,
    validate: Number.isSafeInteger },
  completedAt: Date,
  failedAt: Date,
}, { timestamps: true, versionKey: false });

schema.index({ userId: 1, idempotencyKey: 1 },
  { unique: true, name: "wallet_conversion_user_idempotency" });
schema.index({ userId: 1, requestedAt: -1 },
  { name: "wallet_conversion_user_requested" });
schema.index({ status: 1, requestedAt: 1 },
  { name: "wallet_conversion_status_requested" });
schema.index({ status: 1, decidedAt: -1 },
  { name: "wallet_conversion_status_decided" });
schema.index({ sourceWalletId: 1, status: 1 },
  { name: "wallet_conversion_source_status" });
schema.index({ sourceCurrency: 1, targetCurrency: 1, requestedAt: -1 },
  { name: "wallet_conversion_pair_requested" });
schema.index({ fxSnapshotReference: 1 },
  { name: "wallet_conversion_snapshot_reference" });
schema.index({ providerRequestReference: 1 }, { unique: true,
  partialFilterExpression: { providerRequestReference: { $type: "string" } },
  name: "wallet_conversion_provider_request" });
schema.index({ accountingReference: 1 }, { unique: true,
  partialFilterExpression: { accountingReference: { $type: "string" } },
  name: "wallet_conversion_accounting_reference" });
schema.index({ accountingTransactionReference: 1 }, { unique: true,
  partialFilterExpression: {
    accountingTransactionReference: { $type: "string" },
  }, name: "wallet_conversion_accounting_transaction" });

export const WalletConversionRequest =
  mongoose.model<WalletConversionRequestDocument>(
    "WalletConversionRequest", schema,
  );
