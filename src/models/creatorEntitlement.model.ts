import { Document, Schema, Types, model } from "mongoose";
import { SUPPORTED_CURRENCIES, SupportedCurrency } from "../constants/financial/supportedCurrencies";

/** Immutable allocation evidence. Eligibility never implies a provider payout or wallet credit. */
export interface CreatorEntitlementDocument extends Document {
  decisionAuthority: string;
  decisionId: string;
  fingerprint: string;
  bookingId: Types.ObjectId;
  paymentId: Types.ObjectId;
  creatorId: Types.ObjectId;
  currency: SupportedCurrency;
  totalAmount: number;
  creatorAmount: number;
  platformAmount: number;
  customerRefundAmount: number;
  state: "HELD" | "ELIGIBLE";
  eligibleAt?: Date;
}
const money = { type: Number, required: true, immutable: true, min: 0, validate: Number.isSafeInteger };
const schema = new Schema<CreatorEntitlementDocument>({
  decisionAuthority: { type: String, required: true, immutable: true },
  decisionId: { type: String, required: true, immutable: true },
  fingerprint: { type: String, required: true, immutable: true, select: false },
  bookingId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  paymentId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  creatorId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  currency: { type: String, required: true, immutable: true, enum: SUPPORTED_CURRENCIES },
  totalAmount: money, creatorAmount: money, platformAmount: money, customerRefundAmount: money,
  state: { type: String, required: true, enum: ["HELD", "ELIGIBLE"], default: "HELD", index: true },
  eligibleAt: { type: Date },
}, { timestamps: true, versionKey: false });
schema.index({ decisionAuthority: 1, decisionId: 1 }, { unique: true });
schema.index({ bookingId: 1 }, { unique: true });
schema.index({ paymentId: 1 }, { unique: true });
schema.index({ state: 1, createdAt: 1 });
export const CreatorEntitlement = model<CreatorEntitlementDocument>("CreatorEntitlement", schema);
