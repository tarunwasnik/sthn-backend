import mongoose, { Document, Schema, Types } from "mongoose";

import { WalletConversionOperationalClassification } from
  "../enums/financial/walletConversionOperationalClassification.enum";
import { WalletConversionOperationalSeverity } from
  "../enums/financial/walletConversionOperationalSeverity.enum";

export interface WalletConversionReconciliationDocument extends Document {
  reconciliationReference: string;
  reconciliationKey: string;
  conversionRequestId: Types.ObjectId;
  conversionReference: string;
  classification: WalletConversionOperationalClassification;
  severity: WalletConversionOperationalSeverity;
  issues: string[];
  retryPerformed: boolean;
  repairPerformed: boolean;
  inspectedBy: Types.ObjectId;
  inspectedAt: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<WalletConversionReconciliationDocument>({
  reconciliationReference: { type: String, required: true, immutable: true,
    trim: true },
  reconciliationKey: { type: String, required: true, immutable: true,
    trim: true, select: false },
  conversionRequestId: { type: Schema.Types.ObjectId,
    ref: "WalletConversionRequest", required: true, immutable: true,
    select: false },
  conversionReference: { type: String, required: true, immutable: true,
    trim: true },
  classification: { type: String, required: true,
    enum: Object.values(WalletConversionOperationalClassification) },
  severity: { type: String, required: true,
    enum: Object.values(WalletConversionOperationalSeverity) },
  issues: { type: [{ type: String, trim: true, maxlength: 96 }], default: [] },
  retryPerformed: { type: Boolean, required: true, default: false },
  repairPerformed: { type: Boolean, required: true, default: false },
  inspectedBy: { type: Schema.Types.ObjectId, ref: "User", required: true,
    immutable: true, select: false },
  inspectedAt: { type: Date, required: true },
  version: { type: Number, required: true, default: 1, min: 1 },
}, { timestamps: true, versionKey: false });

schema.index({ reconciliationReference: 1 }, { unique: true });
schema.index({ reconciliationKey: 1 }, { unique: true });
schema.index({ conversionRequestId: 1 }, { unique: true });
schema.index({ conversionReference: 1 }, { unique: true });
schema.index({ classification: 1, createdAt: -1 });

export const WalletConversionReconciliation =
  mongoose.model<WalletConversionReconciliationDocument>(
    "WalletConversionReconciliation", schema);
