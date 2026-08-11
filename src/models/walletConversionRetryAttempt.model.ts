import mongoose, { Document, Schema, Types } from "mongoose";

export interface WalletConversionRetryAttemptDocument extends Document {
  attemptReference: string;
  attemptKey: string;
  reconciliationReference: string;
  conversionReference: string;
  performedBy: Types.ObjectId;
  status: "APPLIED";
  performedAt: Date;
}

const schema = new Schema<WalletConversionRetryAttemptDocument>({
  attemptReference: { type: String, required: true, immutable: true,
    trim: true },
  attemptKey: { type: String, required: true, immutable: true, trim: true,
    select: false },
  reconciliationReference: { type: String, required: true, immutable: true,
    trim: true },
  conversionReference: { type: String, required: true, immutable: true,
    trim: true },
  performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true,
    immutable: true, select: false },
  status: { type: String, required: true, immutable: true, enum: ["APPLIED"] },
  performedAt: { type: Date, required: true, immutable: true },
}, { timestamps: true, versionKey: false });

schema.index({ attemptReference: 1 }, { unique: true });
schema.index({ attemptKey: 1 }, { unique: true });
schema.index({ conversionReference: 1 }, { unique: true });

export const WalletConversionRetryAttempt =
  mongoose.model<WalletConversionRetryAttemptDocument>(
    "WalletConversionRetryAttempt", schema);
