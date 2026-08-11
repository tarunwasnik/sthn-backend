import { Document, model, Schema, Types } from "mongoose";

export interface CreatorWithdrawalRetryAttemptDocument extends Document {
  attemptReference: string;
  attemptKey: string;
  reconciliationId: Types.ObjectId;
  reconciliationReference: string;
  withdrawalRequestId: Types.ObjectId;
  withdrawalReference: string;
  attemptNumber: number;
  action: "RETRY_FINALIZATION";
  snapshotFingerprint: string;
  status: "STARTED" | "APPLIED" | "FAILED";
  safeErrorCode?: string;
  actorType: "SYSTEM" | "ADMIN";
  actorId?: Types.ObjectId;
  startedAt: Date;
  completedAt?: Date;
  nextRetryAt?: Date;
}

const schema = new Schema<CreatorWithdrawalRetryAttemptDocument>({
  attemptReference: { type: String, required: true, immutable: true, trim: true },
  attemptKey: { type: String, required: true, immutable: true, trim: true, select: false },
  reconciliationId: { type: Schema.Types.ObjectId, ref: "CreatorWithdrawalReconciliation", required: true, immutable: true },
  reconciliationReference: { type: String, required: true, immutable: true, trim: true },
  withdrawalRequestId: { type: Schema.Types.ObjectId, ref: "CreatorWithdrawalRequest", required: true, immutable: true, select: false },
  withdrawalReference: { type: String, required: true, immutable: true, trim: true },
  attemptNumber: { type: Number, required: true, immutable: true, min: 1 },
  action: { type: String, required: true, immutable: true, enum: ["RETRY_FINALIZATION"] },
  snapshotFingerprint: { type: String, required: true, immutable: true, select: false },
  status: { type: String, required: true, enum: ["STARTED", "APPLIED", "FAILED"] },
  safeErrorCode: { type: String, trim: true, maxlength: 100 },
  actorType: { type: String, required: true, immutable: true, enum: ["SYSTEM", "ADMIN"] },
  actorId: { type: Schema.Types.ObjectId, ref: "User", immutable: true, select: false },
  startedAt: { type: Date, required: true, immutable: true },
  completedAt: Date,
  nextRetryAt: Date,
}, { timestamps: true, versionKey: false });

schema.index({ attemptReference: 1 }, { unique: true });
schema.index({ attemptKey: 1 }, { unique: true });
schema.index({ reconciliationReference: 1, createdAt: -1 });
schema.index({ withdrawalReference: 1, createdAt: -1 });
schema.index({ createdAt: -1 });

export const CreatorWithdrawalRetryAttempt =
  model<CreatorWithdrawalRetryAttemptDocument>(
    "CreatorWithdrawalRetryAttempt", schema,
  );
