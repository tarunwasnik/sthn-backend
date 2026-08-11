import { Document, model, Schema, Types } from "mongoose";
import { WalletTopUpOperationalAction } from "../enums/financial/walletTopUpOperationalAction.enum";

export interface WalletTopUpRetryAttemptDocument extends Document {
  operationKey: string;
  reconciliationReference: string;
  topUpReference: string;
  attemptNumber: number;
  action: WalletTopUpOperationalAction;
  actorType: "ADMIN" | "SYSTEM";
  actorId?: Types.ObjectId;
  startedAt: Date;
  completedAt?: Date;
  resultCode?: string;
  safeErrorCode?: string;
  nextRetryAt?: Date;
}

const schema = new Schema<WalletTopUpRetryAttemptDocument>({
  operationKey: { type: String, required: true, immutable: true, unique: true, select: false },
  reconciliationReference: { type: String, required: true, immutable: true, index: true },
  topUpReference: { type: String, required: true, immutable: true, index: true },
  attemptNumber: { type: Number, required: true, immutable: true, min: 1 },
  action: { type: String, required: true, immutable: true, enum: Object.values(WalletTopUpOperationalAction) },
  actorType: { type: String, required: true, immutable: true, enum: ["ADMIN", "SYSTEM"] },
  actorId: { type: Schema.Types.ObjectId, ref: "User", immutable: true, select: false },
  startedAt: { type: Date, required: true, immutable: true },
  completedAt: Date,
  resultCode: { type: String, trim: true },
  safeErrorCode: { type: String, trim: true },
  nextRetryAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

schema.index({ reconciliationReference: 1, attemptNumber: 1 }, { unique: true });
export const WalletTopUpRetryAttempt = model<WalletTopUpRetryAttemptDocument>("WalletTopUpRetryAttempt", schema);
