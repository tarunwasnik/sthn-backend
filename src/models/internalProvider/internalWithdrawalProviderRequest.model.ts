import { Document, model, Schema } from "mongoose";

import {
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
} from "../../constants/financial/supportedCurrencies";
import { FINANCIAL_LIMITS } from "../../constants/financial/financialLimits";
import { InternalWithdrawalProviderRequestStatus } from
  "../../enums/financial/internalWithdrawalProviderRequestStatus.enum";
import {
  ProviderExecutionInfo,
  ProviderMetadata,
} from "../../types/internalProvider";
import {
  ProviderExecutionSchema,
  ProviderMetadataSchema,
  ProviderPayloadSchema,
} from "./schemas";

export interface InternalWithdrawalProviderRequestDocument extends Document {
  providerRequestReference: string;
  providerRequestKey: string;
  withdrawalReference: string;
  creatorReference: string;
  walletReference: string;
  destinationReference: string;
  currency: SupportedCurrency;
  amount: number;
  providerStatus: InternalWithdrawalProviderRequestStatus;
  providerReference: string;
  providerFingerprint: string;
  executionReference?: string;
  executionFingerprint?: string;
  providerMetadata?: ProviderMetadata;
  execution?: ProviderExecutionInfo;
  payloads?: { request: unknown; response: unknown };
  terminalResult?: {
    outcome: "SUCCEEDED" | "FAILED";
    code: string;
    message?: string;
  };
  isTerminal: boolean;
  processingAt?: Date;
  succeededAt?: Date;
  failedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const schema = new Schema<InternalWithdrawalProviderRequestDocument>({
  providerRequestReference: {
    type: String, required: true, immutable: true, trim: true,
  },
  providerRequestKey: {
    type: String, required: true, immutable: true, trim: true, select: false,
  },
  withdrawalReference: {
    type: String, required: true, immutable: true, trim: true,
  },
  creatorReference: {
    type: String, required: true, immutable: true, trim: true,
  },
  walletReference: {
    type: String, required: true, immutable: true, trim: true,
  },
  destinationReference: {
    type: String, required: true, immutable: true, trim: true,
  },
  currency: {
    type: String, required: true, immutable: true, uppercase: true,
    enum: SUPPORTED_CURRENCIES,
  },
  amount: {
    type: Number, required: true, immutable: true, min: 1,
    max: FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
    validate: {
      validator: (value: number) => Number.isSafeInteger(value),
      message: "Provider withdrawal amount must be a positive safe integer.",
    },
  },
  providerStatus: {
    type: String, required: true,
    enum: Object.values(InternalWithdrawalProviderRequestStatus),
    default: InternalWithdrawalProviderRequestStatus.CREATED,
  },
  providerReference: {
    type: String, required: true, immutable: true, trim: true,
  },
  providerFingerprint: {
    type: String, required: true, immutable: true, select: false,
    match: /^[a-f0-9]{64}$/,
  },
  executionReference: {
    type: String, trim: true,
  },
  executionFingerprint: {
    type: String, trim: true, select: false, match: /^[a-f0-9]{64}$/,
  },
  providerMetadata: {
    type: ProviderMetadataSchema,
  },
  execution: {
    type: ProviderExecutionSchema,
  },
  payloads: {
    type: ProviderPayloadSchema,
  },
  terminalResult: {
    outcome: {
      type: String,
      enum: [
        InternalWithdrawalProviderRequestStatus.SUCCEEDED,
        InternalWithdrawalProviderRequestStatus.FAILED,
      ],
    },
    code: { type: String, trim: true, maxlength: 64 },
    message: { type: String, trim: true, maxlength: 500 },
  },
  isTerminal: {
    type: Boolean, required: true, default: false,
  },
  processingAt: Date,
  succeededAt: Date,
  failedAt: Date,
  version: {
    type: Number, required: true, default: 0, min: 0,
  },
}, { timestamps: true, versionKey: false });

schema.index({ providerRequestReference: 1 }, { unique: true });
schema.index({ providerRequestKey: 1 }, { unique: true });
schema.index({ withdrawalReference: 1 }, { unique: true });
schema.index(
  { providerReference: 1 },
  {
    unique: true,
    partialFilterExpression: { providerReference: { $type: "string" } },
  },
);

export const InternalWithdrawalProviderRequest =
  model<InternalWithdrawalProviderRequestDocument>(
    "InternalWithdrawalProviderRequest",
    schema,
  );
