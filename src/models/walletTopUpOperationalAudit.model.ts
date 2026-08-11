import { Document, model, Schema, Types } from "mongoose";
import { WalletTopUpOperationalAction } from "../enums/financial/walletTopUpOperationalAction.enum";
import { WalletTopUpReconciliationClassification } from "../enums/financial/walletTopUpReconciliationClassification.enum";

export interface WalletTopUpOperationalAuditDocument extends Document {
  auditReference: string;
  topUpReference: string;
  reconciliationReference?: string;
  action: WalletTopUpOperationalAction;
  actorType: "ADMIN" | "SYSTEM";
  actorId?: Types.ObjectId;
  result: "SUCCEEDED" | "FAILED" | "REJECTED";
  classificationBefore?: WalletTopUpReconciliationClassification;
  classificationAfter?: WalletTopUpReconciliationClassification;
  reasonCode: string;
  metadata?: Record<string, string | number | boolean>;
  createdAt: Date;
}

const schema = new Schema<WalletTopUpOperationalAuditDocument>({
  auditReference: { type: String, required: true, immutable: true, unique: true },
  topUpReference: { type: String, required: true, immutable: true, index: true },
  reconciliationReference: { type: String, immutable: true, index: true },
  action: { type: String, required: true, immutable: true, enum: Object.values(WalletTopUpOperationalAction), index: true },
  actorType: { type: String, required: true, immutable: true, enum: ["ADMIN", "SYSTEM"] },
  actorId: { type: Schema.Types.ObjectId, ref: "User", immutable: true, select: false },
  result: { type: String, required: true, immutable: true, enum: ["SUCCEEDED", "FAILED", "REJECTED"] },
  classificationBefore: { type: String, enum: Object.values(WalletTopUpReconciliationClassification) },
  classificationAfter: { type: String, enum: Object.values(WalletTopUpReconciliationClassification) },
  reasonCode: { type: String, required: true, trim: true },
  metadata: { type: Schema.Types.Mixed },
  createdAt: { type: Date, required: true, immutable: true },
}, { versionKey: false });

schema.index({ reconciliationReference: 1, createdAt: -1 });
schema.index({ topUpReference: 1, createdAt: -1 });
export const WalletTopUpOperationalAudit = model<WalletTopUpOperationalAuditDocument>("WalletTopUpOperationalAudit", schema);
