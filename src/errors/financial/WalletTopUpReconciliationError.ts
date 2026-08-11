import { FinancialError } from "./FinancialError";

export const WalletTopUpReconciliationErrorCode = {
  REQUEST_NOT_FOUND: "WALLET_TOP_UP_RECONCILIATION_REQUEST_NOT_FOUND",
  NOT_FOUND: "WALLET_TOP_UP_RECONCILIATION_NOT_FOUND",
  ALREADY_RESOLVED: "WALLET_TOP_UP_RECONCILIATION_ALREADY_RESOLVED",
  INVALID_STATUS: "WALLET_TOP_UP_RECONCILIATION_INVALID_STATUS",
  INVALID_ACTION: "WALLET_TOP_UP_RECONCILIATION_INVALID_ACTION",
  CLASSIFICATION_CHANGED: "WALLET_TOP_UP_RECONCILIATION_CLASSIFICATION_CHANGED",
  SNAPSHOT_CONFLICT: "WALLET_TOP_UP_RECONCILIATION_SNAPSHOT_CONFLICT",
  RETRY_LIMIT_EXCEEDED: "WALLET_TOP_UP_RECONCILIATION_RETRY_LIMIT_EXCEEDED",
  RETRY_NOT_ALLOWED: "WALLET_TOP_UP_RECONCILIATION_RETRY_NOT_ALLOWED",
  REPAIR_NOT_ALLOWED: "WALLET_TOP_UP_RECONCILIATION_REPAIR_NOT_ALLOWED",
  REPAIR_AMBIGUOUS: "WALLET_TOP_UP_RECONCILIATION_REPAIR_AMBIGUOUS",
  REPAIR_CONFLICT: "WALLET_TOP_UP_RECONCILIATION_REPAIR_CONFLICT",
  PROVIDER_FAILURE_CONFLICT: "WALLET_TOP_UP_RECONCILIATION_PROVIDER_FAILURE_CONFLICT",
  INTEGRITY_ERROR: "WALLET_TOP_UP_RECONCILIATION_INTEGRITY_ERROR",
} as const;

export type WalletTopUpReconciliationErrorCode =
  (typeof WalletTopUpReconciliationErrorCode)[keyof typeof WalletTopUpReconciliationErrorCode];

export class WalletTopUpReconciliationError extends FinancialError {
  public readonly statusCode: number;

  private static statusFor(code: WalletTopUpReconciliationErrorCode): number {
    if (code === WalletTopUpReconciliationErrorCode.NOT_FOUND ||
      code === WalletTopUpReconciliationErrorCode.REQUEST_NOT_FOUND) return 404;
    if (code === WalletTopUpReconciliationErrorCode.INTEGRITY_ERROR) return 500;
    return 409;
  }

  constructor(
    message: string,
    code: WalletTopUpReconciliationErrorCode,
    statusCode?: number,
  ) {
    super(message, code);
    this.name = this.constructor.name;
    this.statusCode = statusCode ?? WalletTopUpReconciliationError.statusFor(code);
  }
}
