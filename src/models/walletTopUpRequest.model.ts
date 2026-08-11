import mongoose, { Document, Schema } from "mongoose";
import { SUPPORTED_CURRENCIES, SupportedCurrency } from "../constants/financial/supportedCurrencies";
import { FINANCIAL_LIMITS } from "../constants/financial/financialLimits";
import { WalletTopUpRequestStatus } from "../enums/financial/walletTopUpRequestStatus.enum";
import { WalletTopUpRejectionCode } from "../enums/financial/walletTopUpRejectionCode.enum";

export interface IWalletTopUpRequest extends Document {
  topUpReference: string; userId: mongoose.Types.ObjectId; walletId: mongoose.Types.ObjectId;
  amount: number; currency: SupportedCurrency; status: WalletTopUpRequestStatus;
  idempotencyKey: string; requestFingerprint: string; requestedAt: Date;
  decidedAt?: Date; decidedBy?: mongoose.Types.ObjectId; rejectionCode?: WalletTopUpRejectionCode; rejectionReason?: string;
  providerPaymentId?: mongoose.Types.ObjectId; paymentId?: mongoose.Types.ObjectId; completedAt?: Date;
  providerFundingId?: mongoose.Types.ObjectId; providerFundingReference?: string; processingStartedAt?: Date;
  ledgerEntryId?: mongoose.Types.ObjectId; ledgerReference?: string; walletProjectionOperationId?: mongoose.Types.ObjectId; walletProjectionOperationReference?: string; accountingTransactionId?: string; accountingCompletedAt?: Date;
  failureCode?: string; failureReason?: string; providerFailedAt?: Date;
  failureFinalizedAt?: Date; failureFinalizedBy?: mongoose.Types.ObjectId;
  createdAt: Date; updatedAt: Date;
}
const schema = new Schema<IWalletTopUpRequest>({
  topUpReference: { type: String, required: true, unique: true, immutable: true, trim: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  walletId: { type: Schema.Types.ObjectId, ref: "Wallet", required: true, immutable: true },
  amount: { type: Number, required: true, immutable: true, min: 1, max: FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT, validate: { validator: Number.isSafeInteger } },
  currency: { type: String, required: true, immutable: true, uppercase: true, enum: SUPPORTED_CURRENCIES },
  status: { type: String, required: true, enum: Object.values(WalletTopUpRequestStatus), default: WalletTopUpRequestStatus.PENDING },
  idempotencyKey: { type: String, required: true, immutable: true, trim: true, lowercase: true },
  requestFingerprint: { type: String, required: true, immutable: true, select: false },
  requestedAt: { type: Date, required: true, immutable: true, default: Date.now },
  decidedAt: Date, decidedBy: { type: Schema.Types.ObjectId, ref: "User", select: false },
  rejectionCode: { type: String, enum: Object.values(WalletTopUpRejectionCode) },
  rejectionReason: { type: String, trim: true, maxlength: 500 },
  providerPaymentId: { type: Schema.Types.ObjectId, ref: "InternalPayment" }, paymentId: { type: Schema.Types.ObjectId, ref: "Payment" }, completedAt: Date,
  providerFundingId: { type: Schema.Types.ObjectId, ref: "InternalTopUpFunding", select: false }, providerFundingReference: { type: String, trim: true }, processingStartedAt: Date,
  ledgerEntryId: { type: Schema.Types.ObjectId, ref: "LedgerEntry", select: false }, ledgerReference: { type: String, trim: true }, walletProjectionOperationId: { type: Schema.Types.ObjectId, ref: "WalletProjectionOperation", select: false }, walletProjectionOperationReference: { type: String, trim: true }, accountingTransactionId: { type: String, trim: true }, accountingCompletedAt: Date,
  failureCode: { type: String, trim: true, maxlength: 100 },
  failureReason: { type: String, trim: true, maxlength: 500 },
  providerFailedAt: Date,
  failureFinalizedAt: Date,
  failureFinalizedBy: { type: Schema.Types.ObjectId, ref: "User", select: false },
}, { timestamps: true, versionKey: false });
schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ userId: 1, requestedAt: -1 });
schema.index({ status: 1, requestedAt: 1 });
export const WalletTopUpRequest = mongoose.model<IWalletTopUpRequest>("WalletTopUpRequest", schema);
