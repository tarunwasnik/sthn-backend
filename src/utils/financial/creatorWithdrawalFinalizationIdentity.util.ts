import crypto from "node:crypto";
import { Types } from "mongoose";

import { SupportedCurrency } from
  "../../constants/financial/supportedCurrencies";
import { CreatorWithdrawalFinalizationOutcome } from
  "../../enums/financial/creatorWithdrawalFinalizationOutcome.enum";

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export interface CreatorWithdrawalFinalizationIdentityInput {
  withdrawalReference: string;
  withdrawalKey: string;
  creatorId: Types.ObjectId;
  creatorUserId: Types.ObjectId;
  walletId: Types.ObjectId;
  destinationId: Types.ObjectId;
  destinationReference: string;
  amount: number;
  currency: SupportedCurrency;
  providerRequestReference: string;
  providerRequestKey: string;
  providerFingerprint: string;
  providerReference: string;
  providerExecutionReference: string;
  providerExecutionFingerprint: string;
  providerTerminalStatus: "SUCCEEDED" | "FAILED";
  reservationTransactionId: string;
  outcome: CreatorWithdrawalFinalizationOutcome;
}

export const deriveCreatorWithdrawalFinalizationIdentity = (
  input: CreatorWithdrawalFinalizationIdentityInput,
) => {
  const finalizationFingerprint = hash(JSON.stringify({
    version: 1,
    withdrawalReference: input.withdrawalReference,
    withdrawalKey: input.withdrawalKey,
    creatorId: input.creatorId.toString(),
    creatorUserId: input.creatorUserId.toString(),
    walletId: input.walletId.toString(),
    destinationId: input.destinationId.toString(),
    destinationReference: input.destinationReference,
    amount: input.amount,
    currency: input.currency,
    providerRequestReference: input.providerRequestReference,
    providerRequestKey: input.providerRequestKey,
    providerFingerprint: input.providerFingerprint,
    providerReference: input.providerReference,
    providerExecutionReference: input.providerExecutionReference,
    providerExecutionFingerprint: input.providerExecutionFingerprint,
    providerTerminalStatus: input.providerTerminalStatus,
    reservationTransactionId: input.reservationTransactionId,
    outcome: input.outcome,
  }));
  const finalizationKey =
    `creator-withdrawal-finalization:${input.withdrawalReference}:` +
    input.outcome;
  const finalizationTransactionId =
    `creator-withdrawal-finalization:${input.withdrawalReference}:` +
    input.outcome.toLowerCase();
  const projectionOperationKey =
    `${finalizationTransactionId}:wallet-projection`;
  return {
    finalizationFingerprint,
    finalizationKey,
    finalizationReference:
      `CWF-${hash(finalizationKey).slice(0, 20).toUpperCase()}`,
    finalizationTransactionId,
    reservedDebitPostingKey:
      `${finalizationTransactionId}:withdrawal-reserved-debit`,
    terminalCreditPostingKey: input.outcome ===
      CreatorWithdrawalFinalizationOutcome.COMPLETED
      ? `${finalizationTransactionId}:provider-outflow-credit`
      : `${finalizationTransactionId}:wallet-available-credit`,
    projectionOperationKey,
    projectionReference:
      `WPO-${hash(projectionOperationKey).slice(0, 16).toUpperCase()}`,
  };
};
