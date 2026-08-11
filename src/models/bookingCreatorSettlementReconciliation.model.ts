import { Document, model, Schema, Types } from "mongoose";

import { BookingCreatorSettlementFailureClassification } from "../enums/financial/bookingCreatorSettlementFailureClassification.enum";
import {
  BookingCreatorSettlementReconciliationResult,
  BookingCreatorSettlementReconciliationStatus,
} from "../enums/financial/bookingCreatorSettlementReconciliation.enum";

export interface BookingCreatorSettlementReconciliationDocument extends Document {
  reconciliationReference: string;
  reconciliationKey: string;
  settlementId: Types.ObjectId;
  settlementReference: string;
  bookingReference: string;
  allocationReference: string;
  walletReference: string;
  creatorReference: string;
  status: BookingCreatorSettlementReconciliationStatus;
  result: BookingCreatorSettlementReconciliationResult;
  classification: BookingCreatorSettlementFailureClassification;
  issuesFound: string[];
  checkedAt: Date;
  snapshot: Record<string, unknown>;
  snapshotFingerprint: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<BookingCreatorSettlementReconciliationDocument>({
  reconciliationReference: { type: String, required: true, immutable: true, trim: true },
  reconciliationKey: { type: String, required: true, immutable: true, trim: true, select: false },
  settlementId: { type: Schema.Types.ObjectId, ref: "BookingCreatorSettlement", required: true, immutable: true, select: false },
  settlementReference: { type: String, required: true, immutable: true, trim: true },
  bookingReference: { type: String, required: true, immutable: true, trim: true },
  allocationReference: { type: String, required: true, immutable: true, trim: true },
  walletReference: { type: String, required: true, immutable: true, trim: true },
  creatorReference: { type: String, required: true, immutable: true, trim: true },
  status: { type: String, required: true, enum: Object.values(BookingCreatorSettlementReconciliationStatus), index: true },
  result: { type: String, required: true, enum: Object.values(BookingCreatorSettlementReconciliationResult) },
  classification: { type: String, required: true, enum: Object.values(BookingCreatorSettlementFailureClassification), index: true },
  issuesFound: { type: [String], default: [] },
  checkedAt: { type: Date, required: true, index: true },
  snapshot: { type: Schema.Types.Mixed, required: true, select: false },
  snapshotFingerprint: { type: String, required: true, select: false },
  version: { type: Number, required: true, default: 0, min: 0 },
}, { timestamps: true, versionKey: false });

schema.index({ reconciliationReference: 1 }, { unique: true });
schema.index({ reconciliationKey: 1 }, { unique: true });
schema.index({ settlementId: 1 }, { unique: true });
schema.index({ settlementReference: 1 }, { unique: true });
schema.index({ status: 1, checkedAt: -1 });

export const BookingCreatorSettlementReconciliation =
  model<BookingCreatorSettlementReconciliationDocument>(
    "BookingCreatorSettlementReconciliation",
    schema,
  );
