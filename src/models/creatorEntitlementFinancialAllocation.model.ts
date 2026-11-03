import { Document, Schema, Types, model } from "mongoose";
import { SUPPORTED_CURRENCIES, SupportedCurrency } from "../constants/financial/supportedCurrencies";

/** Immutable, admin-authorized disposition of one provider-funded entitlement. */
export interface CreatorEntitlementFinancialAllocationDocument extends Document {
  authority: "DISPUTE_FINAL_DECISION_V1" | "APPEAL_FINAL_DECISION_V1";
  decisionId: string;
  fingerprint: string;
  entitlementId: Types.ObjectId;
  bookingId: Types.ObjectId;
  paymentId: Types.ObjectId;
  disputeId: Types.ObjectId;
  appealId?: Types.ObjectId;
  creatorId: Types.ObjectId;
  customerId: Types.ObjectId;
  currency: SupportedCurrency;
  totalAmount: number;
  approvedCreatorAmount: number;
  approvedCustomerRefundAmount: number;
  platformAmount: number;
  decidedBy: Types.ObjectId;
  finalizedAt: Date;
  reasonReference: string;
  version: number;
}

const money = { type: Number, required: true, immutable: true, min: 0, validate: Number.isSafeInteger };
const schema = new Schema<CreatorEntitlementFinancialAllocationDocument>({
  authority: { type: String, required: true, immutable: true, enum: ["DISPUTE_FINAL_DECISION_V1", "APPEAL_FINAL_DECISION_V1"] },
  decisionId: { type: String, required: true, immutable: true }, fingerprint: { type: String, required: true, immutable: true, select: false },
  entitlementId: { type: Schema.Types.ObjectId, required: true, immutable: true, ref: "CreatorEntitlement" }, bookingId: { type: Schema.Types.ObjectId, required: true, immutable: true, ref: "Booking" }, paymentId: { type: Schema.Types.ObjectId, required: true, immutable: true, ref: "Payment" },
  disputeId: { type: Schema.Types.ObjectId, required: true, immutable: true, ref: "Dispute" }, appealId: { type: Schema.Types.ObjectId, immutable: true, ref: "Appeal" },
  creatorId: { type: Schema.Types.ObjectId, required: true, immutable: true, ref: "User" }, customerId: { type: Schema.Types.ObjectId, required: true, immutable: true, ref: "User" }, currency: { type: String, required: true, immutable: true, enum: SUPPORTED_CURRENCIES },
  totalAmount: money, approvedCreatorAmount: money, approvedCustomerRefundAmount: money, platformAmount: money,
  decidedBy: { type: Schema.Types.ObjectId, required: true, immutable: true, ref: "User" }, finalizedAt: { type: Date, required: true, immutable: true }, reasonReference: { type: String, required: true, immutable: true, maxlength: 4000 }, version: { type: Number, required: true, immutable: true, default: 1 },
}, { timestamps: true, versionKey: false });
schema.index({ authority: 1, decisionId: 1 }, { unique: true });
schema.index({ entitlementId: 1, finalizedAt: -1 });
schema.index({ appealId: 1 }, { unique: true, sparse: true });
export const CreatorEntitlementFinancialAllocation = model<CreatorEntitlementFinancialAllocationDocument>("CreatorEntitlementFinancialAllocation", schema);
