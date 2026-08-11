import { Document, model, Schema, Types } from "mongoose";

export interface BookingCreatorSettlementRetryAttemptDocument extends Document {
  operationReference: string;
  operationKey: string;
  reconciliationId: Types.ObjectId;
  reconciliationReference: string;
  settlementId: Types.ObjectId;
  settlementReference: string;
  actorType: "SYSTEM" | "ADMIN";
  actorId?: Types.ObjectId;
  status: "STARTED" | "APPLIED" | "REJECTED";
  reason: string;
  resultCode?: string;
  startedAt: Date;
  completedAt?: Date;
}

const schema = new Schema<BookingCreatorSettlementRetryAttemptDocument>({
  operationReference: { type: String, required: true, immutable: true, unique: true },
  operationKey: { type: String, required: true, immutable: true, unique: true, select: false },
  reconciliationId: { type: Schema.Types.ObjectId, ref: "BookingCreatorSettlementReconciliation", required: true, immutable: true },
  reconciliationReference: { type: String, required: true, immutable: true, index: true },
  settlementId: { type: Schema.Types.ObjectId, ref: "BookingCreatorSettlement", required: true, immutable: true },
  settlementReference: { type: String, required: true, immutable: true, index: true },
  actorType: { type: String, required: true, immutable: true, enum: ["SYSTEM", "ADMIN"] },
  actorId: { type: Schema.Types.ObjectId, ref: "User", immutable: true, select: false },
  status: { type: String, required: true, enum: ["STARTED", "APPLIED", "REJECTED"] },
  reason: { type: String, required: true, immutable: true, trim: true, maxlength: 240 },
  resultCode: { type: String, trim: true },
  startedAt: { type: Date, required: true, immutable: true },
  completedAt: Date,
}, { timestamps: true, versionKey: false });

schema.index({ reconciliationId: 1, createdAt: -1 });

export const BookingCreatorSettlementRetryAttempt =
  model<BookingCreatorSettlementRetryAttemptDocument>(
    "BookingCreatorSettlementRetryAttempt",
    schema,
  );
