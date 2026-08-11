import crypto from "node:crypto";
import { Types } from "mongoose";

import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";

export interface CreatorWithdrawalRequestIdentityInput {
  creatorId: Types.ObjectId;
  creatorUserId: Types.ObjectId;
  walletId: Types.ObjectId;
  destinationId: Types.ObjectId;
  destinationReference: string;
  currency: SupportedCurrency;
  amount: number;
  idempotencyKey: string;
}

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export const deriveCreatorWithdrawalAuthorityFingerprint = (
  input: Omit<CreatorWithdrawalRequestIdentityInput, "idempotencyKey"> & {
    withdrawalReference: string;
  },
) => hash(JSON.stringify({
  version: 1,
  withdrawalReference: input.withdrawalReference,
  creatorId: input.creatorId.toString(),
  creatorUserId: input.creatorUserId.toString(),
  walletId: input.walletId.toString(),
  destinationId: input.destinationId.toString(),
  destinationReference: input.destinationReference,
  currency: input.currency,
  amount: input.amount,
}));

export const deriveCreatorWithdrawalProjectionFingerprint = (input: {
  creatorUserId: Types.ObjectId;
  currency: SupportedCurrency;
  operationKey: string;
  amount: number;
  ledgerEntryIds: Types.ObjectId[];
}) => hash([
  input.creatorUserId.toString(),
  input.currency,
  input.operationKey,
  -input.amount,
  input.amount,
  0,
  input.amount,
  0,
  0,
  input.ledgerEntryIds.slice()
    .sort((a, b) => a.toString().localeCompare(b.toString()))
    .map(String).join(","),
].join("|"));

export const deriveCreatorWithdrawalRequestIdentity = (
  input: CreatorWithdrawalRequestIdentityInput,
) => {
  const withdrawalKey =
    `creator-withdrawal:${input.creatorUserId.toString()}:` +
    input.idempotencyKey;
  const withdrawalReference =
    `CWR-${hash(withdrawalKey).slice(0, 20).toUpperCase()}`;
  const requestFingerprint = deriveCreatorWithdrawalAuthorityFingerprint({
    withdrawalReference,
    creatorId: input.creatorId,
    creatorUserId: input.creatorUserId,
    walletId: input.walletId,
    destinationId: input.destinationId,
    destinationReference: input.destinationReference,
    currency: input.currency,
    amount: input.amount,
  });
  const ledgerTransactionReference =
    `creator-withdrawal-reservation:${withdrawalReference}`;
  const projectionOperationKey =
    `${ledgerTransactionReference}:wallet-projection`;
  return {
    withdrawalReference,
    withdrawalKey,
    requestFingerprint,
    ledgerTransactionReference,
    availableDebitPostingKey:
      `${ledgerTransactionReference}:wallet-available-debit`,
    reservedCreditPostingKey:
      `${ledgerTransactionReference}:withdrawal-reserved-credit`,
    projectionOperationKey,
    projectionReference:
      `WPO-${hash(projectionOperationKey).slice(0, 16).toUpperCase()}`,
  };
};
