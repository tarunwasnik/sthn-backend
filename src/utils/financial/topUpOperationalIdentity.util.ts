import crypto from "crypto";
import { IInternalTopUpFunding } from "../../models/internalTopUpFunding.model";
import { IWalletTopUpRequest } from "../../models/walletTopUpRequest.model";

export interface TopUpOperationalAccountingIdentity {
  transactionId: string;
  postingKey: string;
  operationKey: string;
  operationReference: string;
}

export const deriveTopUpOperationalAccountingIdentity = (
  request: IWalletTopUpRequest,
  funding: IInternalTopUpFunding,
): TopUpOperationalAccountingIdentity => {
  const seed = `${request.topUpReference}|${funding.fundingReference}|${request.userId}|${request.walletId}|${request.amount}|${request.currency}`;
  const transactionId = `TUA-${crypto.createHash("sha256").update(seed).digest("hex").slice(0, 24).toUpperCase()}`;
  const operationKey = `wallet-top-up:${transactionId}:projection`;
  return {
    transactionId,
    postingKey: `wallet-top-up:${transactionId}:ledger`,
    operationKey,
    operationReference: `WPO-${crypto.createHash("sha256").update(operationKey).digest("hex").slice(0, 16).toUpperCase()}`,
  };
};

export const topUpProjectionFingerprint = (
  request: IWalletTopUpRequest,
  operationKey: string,
  ledgerEntryId: string,
): string => {
  const canonical = [
    request.userId.toString(), request.currency, operationKey,
    request.amount, 0, 0, 0, 0, 0, ledgerEntryId,
  ].join("|");
  return crypto.createHash("sha256").update(canonical).digest("hex");
};

export const deterministicOperationalReference = (
  prefix: string,
  identity: string,
  length = 24,
): string => `${prefix}-${crypto.createHash("sha256").update(identity).digest("hex").slice(0, length).toUpperCase()}`;

export const deterministicSnapshotFingerprint = (
  snapshot: Record<string, unknown>,
): string => crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
