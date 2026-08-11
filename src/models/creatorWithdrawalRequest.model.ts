import { Document, model, Schema, Types } from "mongoose";

import {
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
} from "../constants/financial/supportedCurrencies";
import { FINANCIAL_LIMITS } from "../constants/financial/financialLimits";
import { CreatorWithdrawalRequestStatus } from "../enums/financial/creatorWithdrawalRequestStatus.enum";
import { InternalWithdrawalProviderRequestStatus } from
  "../enums/financial/internalWithdrawalProviderRequestStatus.enum";
import { CreatorWithdrawalFinalizationOutcome } from
  "../enums/financial/creatorWithdrawalFinalizationOutcome.enum";

export interface CreatorWithdrawalRequestDocument extends Document {
  withdrawalReference: string;
  withdrawalKey: string;
  creatorId: Types.ObjectId;
  creatorUserId: Types.ObjectId;
  walletId: Types.ObjectId;
  destinationId: Types.ObjectId;
  destinationReference: string;
  currency: SupportedCurrency;
  amount: number;
  reservedAmount: number;
  status: CreatorWithdrawalRequestStatus;
  requestFingerprint: string;
  ledgerTransactionReference?: string;
  ledgerEntryIds: Types.ObjectId[];
  projectionReference?: string;
  providerRequestReference?: string;
  providerTerminalStatus?:
    | InternalWithdrawalProviderRequestStatus.SUCCEEDED
    | InternalWithdrawalProviderRequestStatus.FAILED;
  providerProcessingAt?: Date;
  providerSucceededAt?: Date;
  providerFailedAt?: Date;
  providerExecutionMetadata?: {
    provider: string;
    providerRequestReference: string;
    providerReference: string;
    executionReference: string;
    responseCode: string;
    failureCode?: string;
  };
  finalizationOutcome?: CreatorWithdrawalFinalizationOutcome;
  finalizationReference?: string;
  finalizationKey?: string;
  finalizationTransactionId?: string;
  finalizationLedgerEntryIds: Types.ObjectId[];
  finalizationProjectionOperationId?: Types.ObjectId;
  finalizationProjectionOperationReference?: string;
  finalizationFingerprint?: string;
  providerTerminalReference?: string;
  providerFailureCode?: string;
  completedAt?: Date;
  failedAt?: Date;
  requestedAt: Date;
  reservedAt?: Date;
  isActiveObligation: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const positiveMinorUnit = {
  type: Number,
  required: true,
  immutable: true,
  min: 1,
  max: FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
  validate: {
    validator: (value: number) => Number.isSafeInteger(value),
    message: "Withdrawal amount must be a positive safe integer.",
  },
};

const schema = new Schema<CreatorWithdrawalRequestDocument>({
  withdrawalReference: {
    type: String, required: true, immutable: true, trim: true,
  },
  withdrawalKey: {
    type: String, required: true, immutable: true, trim: true, select: false,
  },
  creatorId: {
    type: Schema.Types.ObjectId, ref: "CreatorProfile", required: true,
    immutable: true,
  },
  creatorUserId: {
    type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true,
  },
  walletId: {
    type: Schema.Types.ObjectId, ref: "Wallet", required: true, immutable: true,
  },
  destinationId: {
    type: Schema.Types.ObjectId, ref: "PayoutDestination", required: true,
    immutable: true,
  },
  destinationReference: {
    type: String, required: true, immutable: true, trim: true,
  },
  currency: {
    type: String, required: true, immutable: true, uppercase: true,
    enum: SUPPORTED_CURRENCIES,
  },
  amount: positiveMinorUnit,
  reservedAmount: {
    type: Number, required: true, default: 0, min: 0,
    max: FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
    validate: {
      validator: (value: number) => Number.isSafeInteger(value),
      message: "Reserved amount must be a non-negative safe integer.",
    },
  },
  status: {
    type: String, required: true,
    enum: Object.values(CreatorWithdrawalRequestStatus),
    default: CreatorWithdrawalRequestStatus.PENDING,
  },
  requestFingerprint: {
    type: String, required: true, immutable: true, select: false,
  },
  ledgerTransactionReference: {
    type: String, trim: true, select: false,
  },
  ledgerEntryIds: {
    type: [{ type: Schema.Types.ObjectId, ref: "LedgerEntry" }],
    default: [], select: false,
  },
  projectionReference: {
    type: String, trim: true,
  },
  providerRequestReference: {
    type: String, trim: true,
  },
  providerTerminalStatus: {
    type: String,
    enum: [
      InternalWithdrawalProviderRequestStatus.SUCCEEDED,
      InternalWithdrawalProviderRequestStatus.FAILED,
    ],
  },
  providerProcessingAt: Date,
  providerSucceededAt: Date,
  providerFailedAt: Date,
  providerExecutionMetadata: {
    provider: { type: String, trim: true },
    providerRequestReference: { type: String, trim: true },
    providerReference: { type: String, trim: true },
    executionReference: { type: String, trim: true },
    responseCode: { type: String, trim: true, maxlength: 64 },
    failureCode: { type: String, trim: true, maxlength: 64 },
  },
  finalizationOutcome: {
    type: String,
    enum: Object.values(CreatorWithdrawalFinalizationOutcome),
    select: false,
  },
  finalizationReference: {
    type: String, trim: true,
  },
  finalizationKey: {
    type: String, trim: true, select: false,
  },
  finalizationTransactionId: {
    type: String, trim: true, select: false,
  },
  finalizationLedgerEntryIds: {
    type: [{ type: Schema.Types.ObjectId, ref: "LedgerEntry" }],
    default: [], select: false,
  },
  finalizationProjectionOperationId: {
    type: Schema.Types.ObjectId,
    ref: "WalletProjectionOperation",
    select: false,
  },
  finalizationProjectionOperationReference: {
    type: String, trim: true, select: false,
  },
  finalizationFingerprint: {
    type: String, trim: true, select: false, match: /^[a-f0-9]{64}$/,
  },
  providerTerminalReference: {
    type: String, trim: true, select: false,
  },
  providerFailureCode: {
    type: String, trim: true, maxlength: 64, select: false,
  },
  completedAt: Date,
  failedAt: Date,
  requestedAt: {
    type: Date, required: true, immutable: true, default: Date.now,
  },
  reservedAt: Date,
  isActiveObligation: {
    type: Boolean, required: true, default: true, select: false,
  },
  version: {
    type: Number, required: true, default: 0, min: 0,
  },
}, { timestamps: true, versionKey: false });

schema.index({ withdrawalReference: 1 }, { unique: true });
schema.index({ withdrawalKey: 1 }, { unique: true });
schema.index({ creatorId: 1, requestedAt: -1 });
schema.index({ creatorUserId: 1, requestedAt: -1 });
schema.index({ walletId: 1, requestedAt: -1 });
schema.index({ status: 1, requestedAt: -1 });
schema.index({ requestedAt: -1 });
schema.index(
  { finalizationReference: 1 },
  {
    unique: true,
    partialFilterExpression: { finalizationReference: { $type: "string" } },
  },
);
schema.index(
  { finalizationKey: 1 },
  {
    unique: true,
    partialFilterExpression: { finalizationKey: { $type: "string" } },
  },
);
schema.index(
  { finalizationTransactionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      finalizationTransactionId: { $type: "string" },
    },
  },
);
schema.index(
  { finalizationProjectionOperationReference: 1 },
  {
    unique: true,
    partialFilterExpression: {
      finalizationProjectionOperationReference: { $type: "string" },
    },
  },
);
schema.index({ status: 1, completedAt: -1 });
schema.index({ status: 1, failedAt: -1 });
schema.index({ walletId: 1, status: 1 });
schema.index({ creatorId: 1, status: 1 });
schema.index({ providerRequestReference: 1 });
schema.index(
  { creatorUserId: 1 },
  {
    unique: true,
    partialFilterExpression: { isActiveObligation: true },
    name: "creator_withdrawal_one_active",
  },
);

export const CreatorWithdrawalRequest =
  model<CreatorWithdrawalRequestDocument>("CreatorWithdrawalRequest", schema);
