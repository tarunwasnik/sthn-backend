import crypto from "node:crypto";
import { Types } from "mongoose";

import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";

export const INTERNAL_WITHDRAWAL_PROVIDER = "INTERNAL";

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export const deriveWithdrawalProviderCreatorReference = (
  creatorId: Types.ObjectId,
) => `CRE-${hash(creatorId.toString()).slice(0, 16).toUpperCase()}`;

export interface WithdrawalProviderIdentityInput {
  withdrawalReference: string;
  creatorId: Types.ObjectId;
  creatorReference: string;
  walletId: Types.ObjectId;
  destinationReference: string;
  currency: SupportedCurrency;
  amount: number;
  provider?: string;
}

export const deriveWithdrawalProviderIdentity = (
  input: WithdrawalProviderIdentityInput,
) => {
  const provider = input.provider ?? INTERNAL_WITHDRAWAL_PROVIDER;
  const canonical = {
    version: 1,
    withdrawalReference: input.withdrawalReference,
    creatorId: input.creatorId.toString(),
    creatorReference: input.creatorReference,
    walletId: input.walletId.toString(),
    destinationReference: input.destinationReference,
    currency: input.currency,
    amount: input.amount,
    provider,
  };
  const providerFingerprint = hash(JSON.stringify(canonical));
  const providerRequestKey =
    `withdrawal-provider:${input.withdrawalReference}:${provider}`;
  const keyHash = hash(providerRequestKey).toUpperCase();
  return {
    provider,
    providerRequestKey,
    providerRequestReference: `IWPR-${keyHash.slice(0, 20)}`,
    providerReference: `INTERNAL-WD-${keyHash.slice(0, 24)}`,
    providerFingerprint,
    walletReference:
      `WAL-${hash(input.walletId.toString()).slice(0, 16).toUpperCase()}`,
    createdTransitionKey:
      `${providerRequestKey}:WITHDRAWAL_PROVIDER_CREATED`,
    initializedTransitionKey:
      `${providerRequestKey}:WITHDRAWAL_PROVIDER_INITIALIZED`,
  };
};

export const deriveWithdrawalProviderExecutionIdentity = (input: {
  providerRequestReference: string;
  providerRequestKey: string;
  providerReference: string;
  providerFingerprint: string;
}) => {
  const executionKey =
    `withdrawal-provider-execution:${input.providerRequestReference}`;
  const executionFingerprint = hash(JSON.stringify({
    version: 1,
    executionKey,
    providerRequestKey: input.providerRequestKey,
    providerReference: input.providerReference,
    providerFingerprint: input.providerFingerprint,
    provider: INTERNAL_WITHDRAWAL_PROVIDER,
  }));
  return {
    executionKey,
    executionReference:
      `IWXE-${hash(executionKey).slice(0, 20).toUpperCase()}`,
    executionFingerprint,
    processingTransitionKey:
      `${executionKey}:WITHDRAWAL_PROVIDER_PROCESSING`,
    succeededTransitionKey:
      `${executionKey}:WITHDRAWAL_PROVIDER_SUCCEEDED`,
    failedTransitionKey:
      `${executionKey}:WITHDRAWAL_PROVIDER_FAILED`,
  };
};
