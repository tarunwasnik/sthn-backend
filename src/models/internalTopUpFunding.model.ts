import mongoose, { Document, Schema, Types } from "mongoose";
import { SUPPORTED_CURRENCIES, SupportedCurrency } from "../constants/financial/supportedCurrencies";
import { FINANCIAL_LIMITS } from "../constants/financial/financialLimits";
import { InternalTopUpFundingStatus } from "../enums/financial/internalTopUpFundingStatus.enum";
import { InternalTopUpFundingFailureCode } from "../enums/financial/internalTopUpFundingFailureCode.enum";

export interface IInternalTopUpFunding extends Document {
  fundingReference: string; topUpRequestId: Types.ObjectId; topUpReference: string;
  amount: number; currency: SupportedCurrency; status: InternalTopUpFundingStatus;
  idempotencyKey: string; requestFingerprint: string; processingStartedAt?: Date;
  succeededAt?: Date; failedAt?: Date; failureCode?: InternalTopUpFundingFailureCode; failureReason?: string;
  createdAt: Date; updatedAt: Date;
}
const schema = new Schema<IInternalTopUpFunding>({
  fundingReference: { type: String, required: true, unique: true, immutable: true, trim: true },
  topUpRequestId: { type: Schema.Types.ObjectId, ref: "WalletTopUpRequest", required: true, unique: true, immutable: true },
  topUpReference: { type: String, required: true, immutable: true, trim: true },
  amount: { type: Number, required: true, immutable: true, min: 1, max: FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT, validate: { validator: Number.isSafeInteger } },
  currency: { type: String, required: true, immutable: true, uppercase: true, enum: SUPPORTED_CURRENCIES },
  status: { type: String, required: true, enum: Object.values(InternalTopUpFundingStatus), default: InternalTopUpFundingStatus.CREATED },
  idempotencyKey: { type: String, required: true, unique: true, immutable: true, trim: true },
  requestFingerprint: { type: String, required: true, immutable: true, trim: true, select: false },
  processingStartedAt: Date, succeededAt: Date, failedAt: Date,
  failureCode: { type: String, enum: Object.values(InternalTopUpFundingFailureCode) },
  failureReason: { type: String, trim: true, maxlength: 500 },
}, { timestamps: true, versionKey: false });
export const InternalTopUpFunding = mongoose.model<IInternalTopUpFunding>("InternalTopUpFunding", schema);
