import crypto from "node:crypto";

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export const deriveWalletConversionReconciliationIdentity = (
  conversionReference: string,
) => {
  const reconciliationKey =
    `wallet-conversion-reconciliation:${conversionReference}`;
  return { reconciliationKey, reconciliationReference:
    `WCR-${hash(reconciliationKey).slice(0, 20).toUpperCase()}` };
};

export const deriveWalletConversionRetryIdentity = (
  conversionReference: string,
) => {
  const attemptKey = `wallet-conversion-retry:${conversionReference}`;
  return { attemptKey, attemptReference:
    `WCRT-${hash(attemptKey).slice(0, 20).toUpperCase()}` };
};

export const deriveWalletConversionRepairIdentity = (
  conversionReference: string, action: string,
) => {
  const repairKey = `wallet-conversion-repair:${conversionReference}:${action}`;
  return { repairKey, repairReference:
    `WCRP-${hash(repairKey).slice(0, 20).toUpperCase()}` };
};
