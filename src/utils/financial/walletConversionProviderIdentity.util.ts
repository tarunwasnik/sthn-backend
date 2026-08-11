import crypto from "node:crypto";
import { Types } from "mongoose";

import { SupportedCurrency } from
  "../../constants/financial/supportedCurrencies";

export const INTERNAL_WALLET_CONVERSION_PROVIDER = "INTERNAL";

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export interface WalletConversionProviderIdentityInput {
  conversionReference: string;
  userId: Types.ObjectId;
  sourceWalletId: Types.ObjectId;
  targetWalletId?: Types.ObjectId;
  sourceCurrency: SupportedCurrency;
  targetCurrency: SupportedCurrency;
  sourceAmount: number;
  targetAmount: number;
  fxSnapshotReference: string;
  fxProvider: string;
  fxEffectiveDate: Date;
}

export const deriveWalletConversionProviderIdentity = (
  input: WalletConversionProviderIdentityInput,
) => {
  const providerRequestKey =
    `wallet-conversion-provider:${input.conversionReference}:` +
    INTERNAL_WALLET_CONVERSION_PROVIDER;
  const requestHash = hash(providerRequestKey).toUpperCase();
  const providerRequestReference = `IWCPR-${requestHash.slice(0, 20)}`;
  const executionKey =
    `wallet-conversion-provider-execution:${providerRequestReference}`;
  const providerExecutionReference =
    `IWCXE-${hash(executionKey).slice(0, 20).toUpperCase()}`;
  const canonical = {
    version: 1,
    conversionReference: input.conversionReference,
    userId: input.userId.toString(),
    sourceWalletId: input.sourceWalletId.toString(),
    targetWalletId: input.targetWalletId?.toString() ?? null,
    sourceCurrency: input.sourceCurrency,
    targetCurrency: input.targetCurrency,
    sourceAmount: input.sourceAmount,
    targetAmount: input.targetAmount,
    fxSnapshotReference: input.fxSnapshotReference,
    fxProvider: input.fxProvider,
    fxEffectiveDate: input.fxEffectiveDate.toISOString(),
    provider: INTERNAL_WALLET_CONVERSION_PROVIDER,
    providerExecutionReference,
  };
  const providerFingerprint = hash(JSON.stringify(canonical));
  const executionFingerprint = hash(JSON.stringify({
    version: 1, providerRequestKey, providerRequestReference,
    providerExecutionReference, providerFingerprint,
    provider: INTERNAL_WALLET_CONVERSION_PROVIDER,
  }));
  return {
    providerRequestKey, providerRequestReference, providerExecutionReference,
    providerFingerprint, executionFingerprint,
    createdTransitionKey: `${providerRequestKey}:CONVERSION_PROVIDER_CREATED`,
    initializedTransitionKey:
      `${providerRequestKey}:CONVERSION_PROVIDER_INITIALIZED`,
    processingTransitionKey:
      `${executionKey}:CONVERSION_PROVIDER_PROCESSING`,
    succeededTransitionKey:
      `${executionKey}:CONVERSION_PROVIDER_SUCCEEDED`,
    failedTransitionKey: `${executionKey}:CONVERSION_PROVIDER_FAILED`,
  };
};
