import { Document, model, Schema, Types } from "mongoose";
import { WalletTopUpOperationalAction } from "../enums/financial/walletTopUpOperationalAction.enum";

export interface WalletTopUpRepairOperationDocument extends Document {
  operationReference: string;
  operationKey: string;
  reconciliationReference: string;
  topUpReference: string;
  action: WalletTopUpOperationalAction;
  snapshotFingerprint: string;
  repairedFields: string[];
  actorId: Types.ObjectId;
  status: "STARTED" | "APPLIED" | "REJECTED";
  resultCode?: string;
  appliedAt?: Date;
}

const schema = new Schema<WalletTopUpRepairOperationDocument>({
  operationReference: { type: String, required: true, immutable: true, unique: true },
  operationKey: { type: String, required: true, immutable: true, unique: true, select: false },
  reconciliationReference: { type: String, required: true, immutable: true, index: true },
  topUpReference: { type: String, required: true, immutable: true, index: true },
  action: { type: String, required: true, immutable: true, enum: Object.values(WalletTopUpOperationalAction) },
  snapshotFingerprint: { type: String, required: true, immutable: true, select: false },
  repairedFields: { type: [String], default: [] },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true, select: false },
  status: { type: String, required: true, enum: ["STARTED", "APPLIED", "REJECTED"] },
  resultCode: { type: String, trim: true },
  appliedAt: Date,
}, { timestamps: true, versionKey: false });

schema.index({ reconciliationReference: 1, createdAt: -1 });
schema.index({ topUpReference: 1, createdAt: -1 });
export const WalletTopUpRepairOperation = model<WalletTopUpRepairOperationDocument>("WalletTopUpRepairOperation", schema);
