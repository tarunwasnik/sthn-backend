import crypto from "node:crypto";

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export interface CreatorWithdrawalReconciliationIdentityInput {
  withdrawalReference: string;
  providerRequestReference?: string;
  creatorId: string;
  creatorUserId: string;
  walletId: string;
  destinationReference: string;
  amount: number;
  currency: string;
  providerTerminalStatus?: string;
  finalizationOutcome?: string;
}

export const deriveCreatorWithdrawalReconciliationIdentity = (
  input: CreatorWithdrawalReconciliationIdentityInput,
) => {
  const reconciliationKey = `creator-withdrawal-reconciliation:${hash(
    JSON.stringify({ version: 1, ...input }),
  )}`;
  return {
    reconciliationKey,
    reconciliationReference:
      `CWR-${hash(reconciliationKey).slice(0, 20).toUpperCase()}`,
  };
};

export const deriveCreatorWithdrawalRetryIdentity = (input: {
  reconciliationReference: string;
  withdrawalReference: string;
  attemptNumber: number;
  snapshotFingerprint: string;
}) => {
  const attemptKey = `creator-withdrawal-retry:${input.reconciliationReference}:` +
    `${input.withdrawalReference}:${input.attemptNumber}:` +
    `${input.snapshotFingerprint}:RETRY_FINALIZATION`;
  return {
    attemptKey,
    attemptReference: `CWRT-${hash(attemptKey).slice(0, 20).toUpperCase()}`,
  };
};

export const deriveCreatorWithdrawalRepairIdentity = (input: {
  reconciliationReference: string;
  withdrawalReference: string;
  action: string;
  snapshotFingerprint: string;
}) => {
  const repairKey = `creator-withdrawal-repair:${input.reconciliationReference}:` +
    `${input.withdrawalReference}:${input.action}:${input.snapshotFingerprint}`;
  return {
    repairKey,
    repairReference: `CWRP-${hash(repairKey).slice(0, 20).toUpperCase()}`,
  };
};

export const fingerprintWithdrawalOperationalSnapshot = (
  snapshot: Record<string, unknown>,
) => hash(JSON.stringify(snapshot));
