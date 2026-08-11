import mongoose, { Document, Schema, Types } from "mongoose";

import { SUPPORTED_CURRENCIES, SupportedCurrency } from
  "../constants/financial/supportedCurrencies";
import { FxRateAuditAction } from
  "../enums/financial/fxRateAuditAction.enum";

export interface FxRateAuditDocument extends Document {
  auditKey: string;
  action: FxRateAuditAction;
  result: "SUCCEEDED" | "FAILED" | "REUSED";
  snapshotReference?: string;
  previousSnapshotReference?: string;
  provider: string;
  baseCurrency: SupportedCurrency;
  quoteCurrency: SupportedCurrency;
  effectiveDate?: Date;
  rate?: string;
  failureCode?: string;
  actorType: "ADMIN" | "SYSTEM";
  actorId?: Types.ObjectId;
  createdAt: Date;
}

const schema = new Schema<FxRateAuditDocument>({
  auditKey: { type: String, required: true, unique: true, immutable: true,
    select: false },
  action: { type: String, required: true, immutable: true,
    enum: Object.values(FxRateAuditAction) },
  result: { type: String, required: true, immutable: true,
    enum: ["SUCCEEDED", "FAILED", "REUSED"] },
  snapshotReference: { type: String, immutable: true, trim: true },
  previousSnapshotReference: { type: String, immutable: true, trim: true },
  provider: { type: String, required: true, immutable: true, trim: true,
    maxlength: 64 },
  baseCurrency: { type: String, required: true, immutable: true,
    enum: SUPPORTED_CURRENCIES },
  quoteCurrency: { type: String, required: true, immutable: true,
    enum: SUPPORTED_CURRENCIES },
  effectiveDate: { type: Date, immutable: true },
  rate: { type: String, immutable: true, trim: true, maxlength: 64 },
  failureCode: { type: String, immutable: true, trim: true, maxlength: 100 },
  actorType: { type: String, required: true, immutable: true,
    enum: ["ADMIN", "SYSTEM"] },
  actorId: { type: Schema.Types.ObjectId, ref: "User", immutable: true,
    select: false },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

schema.index({ provider: 1, baseCurrency: 1, quoteCurrency: 1, createdAt: -1 },
  { name: "fx_audit_pair_created" });

export const FxRateAudit = mongoose.model<FxRateAuditDocument>(
  "FxRateAudit", schema,
);
