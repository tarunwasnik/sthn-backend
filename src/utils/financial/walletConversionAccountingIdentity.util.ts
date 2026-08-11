import crypto from "node:crypto";
import { Types } from "mongoose";

import { SupportedCurrency } from
  "../../constants/financial/supportedCurrencies";

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

const projectionReference = (operationKey: string) =>
  `WPO-${hash(operationKey).slice(0, 16).toUpperCase()}`;

export interface WalletConversionAccountingIdentityInput {
  conversionReference: string;
  conversionKey: string;
  providerRequestReference: string;
  providerExecutionReference: string;
  fxSnapshotReference: string;
  userId: Types.ObjectId;
  sourceWalletId: Types.ObjectId;
  targetWalletId: Types.ObjectId;
  sourceCurrency: SupportedCurrency;
  targetCurrency: SupportedCurrency;
  sourceAmount: number;
  targetAmount: number;
}

export const deriveWalletConversionAccountingIdentity = (
  input: WalletConversionAccountingIdentityInput,
) => {
  const accountingKey =
    `wallet-conversion-accounting:${input.conversionReference}:` +
    input.providerExecutionReference;
  const accountingReference =
    `WCA-${hash(accountingKey).slice(0, 20).toUpperCase()}`;
  const accountingTransactionReference =
    `WCAT-${hash(`${accountingKey}:transaction`).slice(0, 24).toUpperCase()}`;
  const sourcePostingKey = `${accountingKey}:source-ledger-debit`;
  const targetPostingKey = `${accountingKey}:target-ledger-credit`;
  const sourceProjectionKey = `${accountingKey}:source-projection`;
  const targetProjectionKey = `${accountingKey}:target-projection`;
  const canonical = {
    version: 1,
    conversionReference: input.conversionReference,
    conversionKey: input.conversionKey,
    providerRequestReference: input.providerRequestReference,
    providerExecutionReference: input.providerExecutionReference,
    fxSnapshotReference: input.fxSnapshotReference,
    userId: input.userId.toString(),
    sourceWalletId: input.sourceWalletId.toString(),
    targetWalletId: input.targetWalletId.toString(),
    sourceCurrency: input.sourceCurrency,
    targetCurrency: input.targetCurrency,
    sourceAmount: input.sourceAmount,
    targetAmount: input.targetAmount,
    accountingReference,
    accountingTransactionReference,
    sourcePostingKey,
    targetPostingKey,
    sourceProjectionKey,
    targetProjectionKey,
  };
  return {
    accountingKey,
    accountingReference,
    accountingTransactionReference,
    accountingFingerprint: hash(JSON.stringify(canonical)),
    sourcePostingKey,
    targetPostingKey,
    sourceProjectionKey,
    targetProjectionKey,
    sourceProjectionReference: projectionReference(sourceProjectionKey),
    targetProjectionReference: projectionReference(targetProjectionKey),
  };
};
