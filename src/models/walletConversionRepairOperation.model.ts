import mongoose, { Document, Schema, Types } from "mongoose";

import { WalletConversionRepairAction } from
  "../enums/financial/walletConversionRepairAction.enum";

export interface WalletConversionRepairOperationDocument extends Document {
  repairReference: string;
  repairKey: string;
  reconciliationReference: string;
  conversionReference: string;
  action: WalletConversionRepairAction;
  restoredFields: string[];
  performedBy: Types.ObjectId;
  status: "APPLIED";
  performedAt: Date;
}

const schema = new Schema<WalletConversionRepairOperationDocument>({
  repairReference: { type: String, required: true, immutable: true,
    trim: true },
  repairKey: { type: String, required: true, immutable: true, trim: true,
    select: false },
  reconciliationReference: { type: String, required: true, immutable: true,
    trim: true },
  conversionReference: { type: String, required: true, immutable: true,
    trim: true },
  action: { type: String, required: true, immutable: true,
    enum: Object.values(WalletConversionRepairAction) },
  restoredFields: { type: [{ type: String, trim: true, maxlength: 64 }],
    default: [] },
  performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true,
    immutable: true, select: false },
  status: { type: String, required: true, immutable: true, enum: ["APPLIED"] },
  performedAt: { type: Date, required: true, immutable: true },
}, { timestamps: true, versionKey: false });

schema.index({ repairReference: 1 }, { unique: true });
schema.index({ repairKey: 1 }, { unique: true });
schema.index({ conversionReference: 1, action: 1 }, { unique: true });

export const WalletConversionRepairOperation =
  mongoose.model<WalletConversionRepairOperationDocument>(
    "WalletConversionRepairOperation", schema);
