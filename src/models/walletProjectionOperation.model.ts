import { Document, model, Schema, Types } from "mongoose";

import {
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
} from "../constants/financial/supportedCurrencies";
import { FINANCIAL_LIMITS } from "../constants/financial/financialLimits";

const signedMinorUnit = {
  type: Number,
  required: true,
  immutable: true,
  min: -FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
  max: FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
  validate: {
    validator: (value: number) => Number.isSafeInteger(value),
    message: "Projection deltas must be safe integer minor units.",
  },
};

export interface WalletProjectionOperationDocument extends Document {
  operationReference: string;
  walletId: Types.ObjectId;
  userId: Types.ObjectId;
  currency: SupportedCurrency;
  operationKey: string;
  fingerprint: string;
  deltas: { availableBalance: number; reservedBalance: number; lockedBalance: number };
  ledgerEntryIds: Types.ObjectId[];
  projectionVersion: number;
  createdAt: Date;
}

const WalletProjectionOperationSchema = new Schema<WalletProjectionOperationDocument>(
  {
    operationReference: { type: String, required: true, immutable: true, unique: true, trim: true },
    walletId: { type: Schema.Types.ObjectId, ref: "Wallet", required: true, immutable: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true },
    currency: { type: String, required: true, immutable: true, uppercase: true, trim: true, enum: SUPPORTED_CURRENCIES },
    operationKey: { type: String, required: true, immutable: true, trim: true, validate: { validator: (value: string) => !!value?.trim(), message: "Operation key is required." } },
    fingerprint: { type: String, required: true, immutable: true, trim: true, select: false, validate: { validator: (value: string) => !!value?.trim(), message: "Fingerprint is required." } },
    deltas: {
      availableBalance: signedMinorUnit,
      reservedBalance: signedMinorUnit,
      lockedBalance: signedMinorUnit,
    },
    ledgerEntryIds: { type: [{ type: Schema.Types.ObjectId, ref: "LedgerEntry" }], default: [], immutable: true },
    projectionVersion: { type: Number, required: true, immutable: true, min: 0, validate: { validator: (value: number) => Number.isSafeInteger(value), message: "Projection version must be a non-negative safe integer." } },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

/** A key identifies exactly one immutable wallet projection effect globally. */
WalletProjectionOperationSchema.index({ operationKey: 1 }, { unique: true });
WalletProjectionOperationSchema.index({ walletId: 1, createdAt: -1 });

export const WalletProjectionOperation = model<WalletProjectionOperationDocument>(
  "WalletProjectionOperation",
  WalletProjectionOperationSchema,
);
