import mongoose, { Document, Schema, Types } from "mongoose";

import { SUPPORTED_CURRENCIES, SupportedCurrency } from
  "../constants/financial/supportedCurrencies";
import { FX_RATE_MAX_DECIMAL_SCALE } from
  "../constants/financial/fxRate.constants";
import { ExchangeRateSnapshotStatus } from
  "../enums/financial/exchangeRateSnapshotStatus.enum";

export interface ExchangeRateSnapshotDocument extends Document {
  snapshotReference: string;
  snapshotKey: string;
  provider: string;
  providerReference?: string;
  baseCurrency: SupportedCurrency;
  quoteCurrency: SupportedCurrency;
  rateValue: string;
  rateScale: number;
  inverseRateValue: string;
  inverseRateScale: number;
  effectiveDate: Date;
  providerPublishedAt?: Date;
  fetchedAt: Date;
  validFrom: Date;
  expiresAt: Date;
  status: ExchangeRateSnapshotStatus;
  supersededAt?: Date;
  supersededByReference?: string;
  responseFingerprint: string;
  snapshotFingerprint: string;
  createdByType: "ADMIN" | "SYSTEM";
  createdBy?: Types.ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ExchangeRateSnapshotDocument>({
  snapshotReference: { type: String, required: true, unique: true,
    immutable: true, trim: true },
  snapshotKey: { type: String, required: true, unique: true,
    immutable: true, select: false },
  provider: { type: String, required: true, immutable: true, trim: true,
    maxlength: 64 },
  providerReference: { type: String, immutable: true, trim: true,
    maxlength: 160 },
  baseCurrency: { type: String, required: true, immutable: true,
    enum: SUPPORTED_CURRENCIES },
  quoteCurrency: { type: String, required: true, immutable: true,
    enum: SUPPORTED_CURRENCIES },
  rateValue: { type: String, required: true, immutable: true,
    validate: /^\d+$/ },
  rateScale: { type: Number, required: true, immutable: true, min: 0,
    max: FX_RATE_MAX_DECIMAL_SCALE, validate: Number.isSafeInteger },
  inverseRateValue: { type: String, required: true, immutable: true,
    validate: /^\d+$/ },
  inverseRateScale: { type: Number, required: true, immutable: true, min: 0,
    max: FX_RATE_MAX_DECIMAL_SCALE, validate: Number.isSafeInteger },
  effectiveDate: { type: Date, required: true, immutable: true },
  providerPublishedAt: { type: Date, immutable: true },
  fetchedAt: { type: Date, required: true, immutable: true },
  validFrom: { type: Date, required: true, immutable: true },
  expiresAt: { type: Date, required: true, immutable: true },
  status: { type: String, required: true,
    enum: Object.values(ExchangeRateSnapshotStatus) },
  supersededAt: Date,
  supersededByReference: { type: String, trim: true },
  responseFingerprint: { type: String, required: true, immutable: true,
    select: false },
  snapshotFingerprint: { type: String, required: true, immutable: true,
    select: false },
  createdByType: { type: String, required: true, immutable: true,
    enum: ["ADMIN", "SYSTEM"] },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", immutable: true,
    select: false },
  version: { type: Number, required: true, default: 1, immutable: true,
    validate: Number.isSafeInteger },
}, { timestamps: true, versionKey: false });

schema.index(
  { provider: 1, baseCurrency: 1, quoteCurrency: 1, status: 1 },
  { unique: true, partialFilterExpression: {
    status: ExchangeRateSnapshotStatus.ACTIVE,
  }, name: "unique_active_fx_pair_provider" },
);
schema.index({ provider: 1, baseCurrency: 1, quoteCurrency: 1,
  effectiveDate: -1 }, { name: "fx_pair_effective_date" });
schema.index({ status: 1, expiresAt: 1 }, { name: "fx_status_expiry" });
schema.index({ createdAt: -1 }, { name: "fx_created_at" });

export const ExchangeRateSnapshot = mongoose.model<ExchangeRateSnapshotDocument>(
  "ExchangeRateSnapshot", schema,
);
