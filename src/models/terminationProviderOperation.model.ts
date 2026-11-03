import mongoose, { Document, Schema } from "mongoose";
import { PaymentProvider } from "../enums/financial/paymentProvider.enum";
import { BookingTerminationActorType, BookingTerminationType } from "../enums/booking/bookingTerminationType.enum";
import { SUPPORTED_CURRENCIES, SupportedCurrency } from "../constants/financial/supportedCurrencies";

export type TerminationProviderOperationStatus = "PENDING" | "IN_FLIGHT" | "UNKNOWN" | "CONFIRMED" | "FAILED" | "FINALIZED";

/** Unconnected recovery record. It does not itself authorize a provider mutation. */
export interface ITerminationProviderOperation extends Document {
  bookingId: mongoose.Types.ObjectId;
  paymentId: mongoose.Types.ObjectId;
  claimKey: string;
  intent: BookingTerminationType;
  actorType: BookingTerminationActorType;
  actorId?: mongoose.Types.ObjectId;
  provider: PaymentProvider;
  providerPaymentId: string;
  kind: "CANCEL" | "REFUND";
  dispatchMode?: "LEGACY" | "DISPOSITION";
  amount: number;
  currency: SupportedCurrency;
  idempotencyKey: string;
  status: TerminationProviderOperationStatus;
  attemptedAt?: Date;
  resolvedAt?: Date;
  providerStatus?: string;
  providerOperationReference?: string;
  finalizedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ITerminationProviderOperation>({
  bookingId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  paymentId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  claimKey: { type: String, required: true, immutable: true },
  intent: { type: String, enum: Object.values(BookingTerminationType), required: true, immutable: true },
  actorType: { type: String, enum: Object.values(BookingTerminationActorType), required: true, immutable: true },
  actorId: { type: Schema.Types.ObjectId, immutable: true },
  provider: { type: String, enum: Object.values(PaymentProvider), required: true, immutable: true },
  providerPaymentId: { type: String, required: true, immutable: true },
  kind: { type: String, enum: ["CANCEL", "REFUND"], required: true, immutable: true },
  dispatchMode: { type: String, enum: ["LEGACY", "DISPOSITION"], immutable: true, default: "LEGACY" },
  amount: { type: Number, required: true, immutable: true, min: 1, validate: Number.isSafeInteger },
  currency: { type: String, required: true, immutable: true, enum: SUPPORTED_CURRENCIES },
  idempotencyKey: { type: String, required: true, immutable: true },
  status: { type: String, required: true, enum: ["PENDING", "IN_FLIGHT", "UNKNOWN", "CONFIRMED", "FAILED", "FINALIZED"], default: "PENDING" },
  attemptedAt: Date, resolvedAt: Date, providerStatus: String,
  providerOperationReference: String, finalizedAt: Date,
}, { timestamps: true, versionKey: false });

schema.index({ claimKey: 1 }, { unique: true });
schema.index({ idempotencyKey: 1 }, { unique: true });
schema.index({ bookingId: 1 }, { unique: true });
schema.index({ provider: 1, providerOperationReference: 1 }, { unique: true, partialFilterExpression: { providerOperationReference: { $type: "string" } } });

export const TerminationProviderOperation = mongoose.model<ITerminationProviderOperation>("TerminationProviderOperation", schema);
