import mongoose, { Document, Schema } from "mongoose";

import { PaymentProvider } from "../enums/financial/paymentProvider.enum";
import { PaymentOperationStatus } from "../enums/financial/paymentOperationStatus.enum";
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "../constants/financial/supportedCurrencies";

export type PaymentOperationHistoryKind =
  | "CREATED" | "ATTEMPT_STARTED" | "PROVIDER_LINKED" | "RECONCILIATION_ATTEMPT"
  | "CONFIRMED" | "FAILED" | "UNKNOWN" | "CONFLICT";

export interface PaymentOperationHistoryEntry {
  kind: PaymentOperationHistoryKind;
  occurredAt: Date;
  providerStatus?: string;
  note?: string;
}
export interface PaymentOperationSelectionEvidence {
  operation: "COLLECTION";
  provider: PaymentProvider;
  configurationVersion: string;
  selectedAt: Date;
  rationale: string;
  simulator: boolean;
}

/**
 * Durable, provider-neutral evidence for one external operation belonging to
 * one Financial Domain Payment. It never posts ledger entries or changes a
 * Payment's lifecycle; PaymentLifecycleService remains the canonical owner.
 */
export interface IPaymentOperation extends Document {
  operationReference: string;
  paymentId: mongoose.Types.ObjectId;
  bookingId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  provider: PaymentProvider;
  selectionEvidence: PaymentOperationSelectionEvidence;
  idempotencyKey: string;
  requestedAmount: number;
  requestedCurrency: SupportedCurrency;
  providerPaymentId?: string;
  providerOrderId?: string;
  providerTransactionId?: string;
  verifiedAmount?: number;
  verifiedCurrency?: SupportedCurrency;
  providerStatus?: string;
  status: PaymentOperationStatus;
  attemptCount: number;
  dispatchStartedAt?: Date;
  dispatchKind?: "PAYMENT_SESSION";
  reconciliationAttemptCount: number;
  lastAttemptAt?: Date;
  lastReconciledAt?: Date;
  confirmedAt?: Date;
  failedAt?: Date;
  unknownAt?: Date;
  history: PaymentOperationHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const historySchema = new Schema<PaymentOperationHistoryEntry>({
  kind: { type: String, required: true, immutable: true, enum: ["CREATED", "ATTEMPT_STARTED", "PROVIDER_LINKED", "RECONCILIATION_ATTEMPT", "CONFIRMED", "FAILED", "UNKNOWN", "CONFLICT"] },
  occurredAt: { type: Date, required: true, immutable: true },
  providerStatus: { type: String, immutable: true, trim: true, maxlength: 128 },
  note: { type: String, immutable: true, trim: true, maxlength: 500 },
}, { _id: false });
const selectionEvidenceSchema = new Schema<PaymentOperationSelectionEvidence>({
  operation: { type: String, required: true, immutable: true, enum: ["COLLECTION"] }, provider: { type: String, required: true, immutable: true, enum: Object.values(PaymentProvider) }, configurationVersion: { type: String, required: true, immutable: true, maxlength: 160 }, selectedAt: { type: Date, required: true, immutable: true }, rationale: { type: String, required: true, immutable: true, maxlength: 500 }, simulator: { type: Boolean, required: true, immutable: true },
}, { _id: false, id: false });

const PaymentOperationSchema = new Schema<IPaymentOperation>({
  operationReference: { type: String, required: true, immutable: true, unique: true, trim: true },
  paymentId: { type: Schema.Types.ObjectId, ref: "Payment", required: true, immutable: true, unique: true },
  bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, immutable: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true, select: false },
  provider: { type: String, required: true, immutable: true, enum: Object.values(PaymentProvider), index: true },
  selectionEvidence: { type: selectionEvidenceSchema, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true, unique: true, select: false },
  requestedAmount: { type: Number, required: true, immutable: true, min: 1, validate: { validator: Number.isSafeInteger, message: "Requested amount must be a safe integer minor-unit value." } },
  requestedCurrency: { type: String, required: true, immutable: true, enum: SUPPORTED_CURRENCIES },
  providerPaymentId: { type: String, trim: true },
  providerOrderId: { type: String, trim: true },
  providerTransactionId: { type: String, trim: true },
  verifiedAmount: { type: Number, min: 1, validate: { validator: (value?: number) => value === undefined || Number.isSafeInteger(value), message: "Verified amount must be a safe integer minor-unit value." } },
  verifiedCurrency: { type: String, enum: SUPPORTED_CURRENCIES },
  providerStatus: { type: String, trim: true, maxlength: 128 },
  status: { type: String, required: true, enum: Object.values(PaymentOperationStatus), default: PaymentOperationStatus.PENDING, index: true },
  attemptCount: { type: Number, required: true, default: 0, min: 0 },
  dispatchStartedAt: Date,
  dispatchKind: { type: String, enum: ["PAYMENT_SESSION"] },
  reconciliationAttemptCount: { type: Number, required: true, default: 0, min: 0 },
  lastAttemptAt: Date, lastReconciledAt: Date, confirmedAt: Date, failedAt: Date, unknownAt: Date,
  history: { type: [historySchema], required: true, default: [] },
}, { timestamps: true, versionKey: false });

PaymentOperationSchema.index({ provider: 1, providerPaymentId: 1 }, { unique: true, partialFilterExpression: { providerPaymentId: { $type: "string" } } });
PaymentOperationSchema.index({ status: 1, lastReconciledAt: 1 });

export const PaymentOperation = mongoose.model<IPaymentOperation>("PaymentOperation", PaymentOperationSchema);
