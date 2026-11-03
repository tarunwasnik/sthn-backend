import { Document, Schema, Types, model } from "mongoose";
import { SupportedCurrency, SUPPORTED_CURRENCIES } from "../constants/financial/supportedCurrencies";
import { PaymentProvider } from "../enums/financial/paymentProvider.enum";
import { PayoutDestinationType } from "../enums/financial/payoutDestinationType.enum";

/**
 * Immutable approval evidence for a future payout. It does not prove that a
 * provider transfer was dispatched or completed.
 */
export interface CreatorPayoutAuthorizationDocument extends Document {
  authority: string;
  decisionId: string;
  fingerprint: string;
  entitlementId: Types.ObjectId;
  payoutId: Types.ObjectId;
  creatorId: Types.ObjectId;
  bookingId: Types.ObjectId;
  paymentId: Types.ObjectId;
  payoutDestinationId: Types.ObjectId;
  destinationReference: string;
  destinationType: PayoutDestinationType;
  destinationCountry: string;
  provider: PaymentProvider;
  amount: number;
  currency: SupportedCurrency;
  state: "AUTHORIZED";
}

const schema = new Schema<CreatorPayoutAuthorizationDocument>({
  authority: { type: String, required: true, immutable: true },
  decisionId: { type: String, required: true, immutable: true },
  fingerprint: { type: String, required: true, immutable: true, select: false },
  entitlementId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  payoutId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  creatorId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  bookingId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  paymentId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  payoutDestinationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  destinationReference: { type: String, required: true, immutable: true },
  destinationType: { type: String, required: true, immutable: true, enum: Object.values(PayoutDestinationType) },
  destinationCountry: { type: String, required: true, immutable: true, uppercase: true, minlength: 2, maxlength: 2 },
  provider: { type: String, required: true, immutable: true, enum: Object.values(PaymentProvider) },
  amount: { type: Number, required: true, immutable: true, min: 1, validate: Number.isSafeInteger },
  currency: { type: String, required: true, immutable: true, enum: SUPPORTED_CURRENCIES },
  state: { type: String, required: true, immutable: true, enum: ["AUTHORIZED"], default: "AUTHORIZED" },
}, { timestamps: true, versionKey: false });

schema.index({ authority: 1, decisionId: 1 }, { unique: true });
schema.index({ entitlementId: 1 }, { unique: true });
schema.index({ payoutId: 1 }, { unique: true });

export const CreatorPayoutAuthorization = model<CreatorPayoutAuthorizationDocument>("CreatorPayoutAuthorization", schema);
