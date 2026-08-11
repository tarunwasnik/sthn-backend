import { Document, model, Schema, Types } from "mongoose";

import { FINANCIAL_LIMITS } from
  "../../constants/financial/financialLimits";
import { SUPPORTED_CURRENCIES, SupportedCurrency } from
  "../../constants/financial/supportedCurrencies";
import { InternalWalletConversionProviderRequestStatus } from
  "../../enums/financial/internalWalletConversionProviderRequestStatus.enum";
import { WalletConversionProviderOutcome } from
  "../../enums/financial/walletConversionProviderOutcome.enum";
import { ProviderExecutionInfo, ProviderMetadata } from
  "../../types/internalProvider";
import { ProviderExecutionSchema, ProviderMetadataSchema,
  ProviderPayloadSchema } from "./schemas";

export interface InternalWalletConversionProviderRequestDocument
  extends Document {
  providerRequestReference: string;
  providerRequestKey: string;
  conversionReference: string;
  userId: Types.ObjectId;
  sourceWalletId: Types.ObjectId;
  targetWalletId?: Types.ObjectId;
  sourceCurrency: SupportedCurrency;
  targetCurrency: SupportedCurrency;
  sourceAmount: number;
  targetAmount: number;
  fxSnapshotReference: string;
  fxProvider: string;
  fxEffectiveDate: Date;
  provider: string;
  providerExecutionReference: string;
  providerFingerprint: string;
  executionFingerprint: string;
  providerStatus: InternalWalletConversionProviderRequestStatus;
  providerOutcome?: WalletConversionProviderOutcome;
  providerMetadata?: ProviderMetadata;
  execution?: ProviderExecutionInfo;
  payloads?: { request: unknown; response: unknown };
  responseCode?: string;
  failureCode?: string;
  failureReason?: string;
  processingAt?: Date;
  completedAt?: Date;
  isTerminal: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<InternalWalletConversionProviderRequestDocument>({
  providerRequestReference: { type: String, required: true, immutable: true,
    trim: true },
  providerRequestKey: { type: String, required: true, immutable: true,
    trim: true, select: false },
  conversionReference: { type: String, required: true, immutable: true,
    trim: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true,
    immutable: true, select: false },
  sourceWalletId: { type: Schema.Types.ObjectId, ref: "Wallet", required: true,
    immutable: true, select: false },
  targetWalletId: { type: Schema.Types.ObjectId, ref: "Wallet",
    immutable: true, select: false },
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
  fxProvider: { type: String, required: true, immutable: true, trim: true,
    maxlength: 64 },
  fxEffectiveDate: { type: Date, required: true, immutable: true },
  provider: { type: String, required: true, immutable: true, trim: true,
    maxlength: 64 },
  providerExecutionReference: { type: String, required: true, immutable: true,
    trim: true },
  providerFingerprint: { type: String, required: true, immutable: true,
    select: false, match: /^[a-f0-9]{64}$/ },
  executionFingerprint: { type: String, required: true, immutable: true,
    select: false, match: /^[a-f0-9]{64}$/ },
  providerStatus: { type: String, required: true,
    enum: Object.values(InternalWalletConversionProviderRequestStatus),
    default: InternalWalletConversionProviderRequestStatus.INITIALIZED },
  providerOutcome: { type: String,
    enum: Object.values(WalletConversionProviderOutcome) },
  providerMetadata: { type: ProviderMetadataSchema, select: false },
  execution: { type: ProviderExecutionSchema, select: false },
  payloads: { type: ProviderPayloadSchema, select: false },
  responseCode: { type: String, trim: true, maxlength: 64 },
  failureCode: { type: String, trim: true, maxlength: 64 },
  failureReason: { type: String, trim: true, maxlength: 500, select: false },
  processingAt: Date,
  completedAt: Date,
  isTerminal: { type: Boolean, required: true, default: false },
  version: { type: Number, required: true, default: 0, min: 0,
    validate: Number.isSafeInteger },
}, { timestamps: true, versionKey: false });

schema.index({ providerRequestReference: 1 }, { unique: true,
  name: "wallet_conversion_provider_reference" });
schema.index({ providerRequestKey: 1 }, { unique: true,
  name: "wallet_conversion_provider_key" });
schema.index({ conversionReference: 1 }, { unique: true,
  name: "wallet_conversion_provider_conversion" });
schema.index({ providerExecutionReference: 1 }, { unique: true,
  name: "wallet_conversion_provider_execution" });
schema.index({ providerStatus: 1, createdAt: 1 },
  { name: "wallet_conversion_provider_status_created" });

export const InternalWalletConversionProviderRequest = model<
  InternalWalletConversionProviderRequestDocument>(
    "InternalWalletConversionProviderRequest", schema,
  );
