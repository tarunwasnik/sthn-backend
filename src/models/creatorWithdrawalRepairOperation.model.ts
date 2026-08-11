import { Document, model, Schema, Types } from "mongoose";
import { CreatorWithdrawalOperationalAction } from
  "../enums/financial/creatorWithdrawalOperationalAction.enum";

export interface CreatorWithdrawalRepairOperationDocument extends Document {
  repairReference: string;
  repairKey: string;
  reconciliationId: Types.ObjectId;
  reconciliationReference: string;
  withdrawalRequestId: Types.ObjectId;
  withdrawalReference: string;
  action: CreatorWithdrawalOperationalAction;
  snapshotFingerprint: string;
  repairedFields: string[];
  status: "STARTED" | "APPLIED" | "FAILED";
  resultCode?: string;
  performedBy: Types.ObjectId;
  performedAt?: Date;
  version: number;
}

const schema = new Schema<CreatorWithdrawalRepairOperationDocument>({
  repairReference: { type: String, required: true, immutable: true, trim: true },
  repairKey: { type: String, required: true, immutable: true, trim: true, select: false },
  reconciliationId: { type: Schema.Types.ObjectId, ref: "CreatorWithdrawalReconciliation", required: true, immutable: true },
  reconciliationReference: { type: String, required: true, immutable: true, trim: true },
  withdrawalRequestId: { type: Schema.Types.ObjectId, ref: "CreatorWithdrawalRequest", required: true, immutable: true, select: false },
  withdrawalReference: { type: String, required: true, immutable: true, trim: true },
  action: { type: String, required: true, immutable: true, enum: [
    CreatorWithdrawalOperationalAction.RESTORE_FINALIZATION_LINKS,
    CreatorWithdrawalOperationalAction.RESTORE_TERMINAL_AUDIT,
  ] },
  snapshotFingerprint: { type: String, required: true, immutable: true, select: false },
  repairedFields: { type: [String], default: [] },
  status: { type: String, required: true, enum: ["STARTED", "APPLIED", "FAILED"] },
  resultCode: { type: String, trim: true, maxlength: 100 },
  performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true, select: false },
  performedAt: Date,
  version: { type: Number, required: true, default: 0, min: 0 },
}, { timestamps: true, versionKey: false });

schema.index({ repairReference: 1 }, { unique: true });
schema.index({ repairKey: 1 }, { unique: true });
schema.index({ reconciliationReference: 1, createdAt: -1 });
schema.index({ withdrawalReference: 1, createdAt: -1 });
schema.index({ createdAt: -1 });

export const CreatorWithdrawalRepairOperation =
  model<CreatorWithdrawalRepairOperationDocument>(
    "CreatorWithdrawalRepairOperation", schema,
  );
