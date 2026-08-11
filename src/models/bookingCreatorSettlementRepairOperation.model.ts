import { Document, model, Schema, Types } from "mongoose";

import { BookingCreatorSettlementRepairAction } from "../enums/financial/bookingCreatorSettlementReconciliation.enum";

export interface BookingCreatorSettlementRepairOperationDocument extends Document {
  operationReference: string;
  operationKey: string;
  reconciliationId: Types.ObjectId;
  reconciliationReference: string;
  settlementId: Types.ObjectId;
  settlementReference: string;
  action: BookingCreatorSettlementRepairAction;
  snapshotFingerprint: string;
  repairedFields: string[];
  actorId: Types.ObjectId;
  status: "STARTED" | "APPLIED" | "REJECTED";
  reason: string;
  resultCode?: string;
  appliedAt?: Date;
}

const schema = new Schema<BookingCreatorSettlementRepairOperationDocument>({
  operationReference: { type: String, required: true, immutable: true, unique: true },
  operationKey: { type: String, required: true, immutable: true, unique: true, select: false },
  reconciliationId: { type: Schema.Types.ObjectId, ref: "BookingCreatorSettlementReconciliation", required: true, immutable: true },
  reconciliationReference: { type: String, required: true, immutable: true, index: true },
  settlementId: { type: Schema.Types.ObjectId, ref: "BookingCreatorSettlement", required: true, immutable: true },
  settlementReference: { type: String, required: true, immutable: true, index: true },
  action: { type: String, required: true, immutable: true, enum: Object.values(BookingCreatorSettlementRepairAction) },
  snapshotFingerprint: { type: String, required: true, immutable: true, select: false },
  repairedFields: { type: [String], default: [] },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true, select: false },
  status: { type: String, required: true, enum: ["STARTED", "APPLIED", "REJECTED"] },
  reason: { type: String, required: true, immutable: true, trim: true, maxlength: 240 },
  resultCode: { type: String, trim: true },
  appliedAt: Date,
}, { timestamps: true, versionKey: false });

schema.index({ reconciliationId: 1, action: 1 }, { unique: true });

export const BookingCreatorSettlementRepairOperation =
  model<BookingCreatorSettlementRepairOperationDocument>(
    "BookingCreatorSettlementRepairOperation",
    schema,
  );
