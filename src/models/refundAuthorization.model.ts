import { Document, Schema, Types, model } from "mongoose";
import { PaymentProvider } from "../enums/financial/paymentProvider.enum";
import { SUPPORTED_CURRENCIES, SupportedCurrency } from "../constants/financial/supportedCurrencies";

/** Approval evidence for an existing Refund operation; it is not provider-execution evidence. */
export interface RefundAuthorizationDocument extends Document {
  authority: string;
  decisionId: string;
  fingerprint: string;
  policyVersion: string;
  bookingId: Types.ObjectId;
  paymentId: Types.ObjectId;
  refundId: Types.ObjectId;
  terminationOperationId?: Types.ObjectId;
  provider: PaymentProvider;
  providerPaymentId: string;
  amount: number;
  currency: SupportedCurrency;
  state: "AUTHORIZED";
}
const schema = new Schema<RefundAuthorizationDocument>({
  authority: { type: String, required: true, immutable: true }, decisionId: { type: String, required: true, immutable: true },
  fingerprint: { type: String, required: true, immutable: true, select: false }, policyVersion: { type: String, required: true, immutable: true },
  bookingId: { type: Schema.Types.ObjectId, required: true, immutable: true }, paymentId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  refundId: { type: Schema.Types.ObjectId, required: true, immutable: true }, terminationOperationId: { type: Schema.Types.ObjectId, immutable: true },
  provider: { type: String, required: true, immutable: true, enum: Object.values(PaymentProvider) }, providerPaymentId: { type: String, required: true, immutable: true },
  amount: { type: Number, required: true, immutable: true, min: 1, validate: Number.isSafeInteger }, currency: { type: String, required: true, immutable: true, enum: SUPPORTED_CURRENCIES },
  state: { type: String, required: true, immutable: true, enum: ["AUTHORIZED"], default: "AUTHORIZED" },
}, { timestamps: true, versionKey: false });
schema.index({ authority: 1, decisionId: 1 }, { unique: true });
schema.index({ refundId: 1 }, { unique: true });
schema.index({ terminationOperationId: 1 }, { unique: true, partialFilterExpression: { terminationOperationId: { $type: "objectId" } } });
export const RefundAuthorization = model<RefundAuthorizationDocument>("RefundAuthorization", schema);
