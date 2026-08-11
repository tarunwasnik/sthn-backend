import { FinancialError } from "./FinancialError";

export type WalletConversionAccountingErrorCode =
  | "WALLET_CONVERSION_ACCOUNTING_INVALID_INPUT"
  | "WALLET_CONVERSION_ACCOUNTING_REQUEST_NOT_FOUND"
  | "WALLET_CONVERSION_ACCOUNTING_INVALID_STATUS"
  | "WALLET_CONVERSION_ACCOUNTING_PROVIDER_CONFLICT"
  | "WALLET_CONVERSION_ACCOUNTING_SNAPSHOT_CONFLICT"
  | "WALLET_CONVERSION_ACCOUNTING_IDENTITY_CONFLICT"
  | "WALLET_CONVERSION_ACCOUNTING_WALLET_CONFLICT"
  | "WALLET_CONVERSION_ACCOUNTING_INSUFFICIENT_BALANCE"
  | "WALLET_CONVERSION_ACCOUNTING_LEDGER_CONFLICT"
  | "WALLET_CONVERSION_ACCOUNTING_PROJECTION_CONFLICT"
  | "WALLET_CONVERSION_ACCOUNTING_AUDIT_CONFLICT"
  | "WALLET_CONVERSION_ACCOUNTING_REPLAY_CONFLICT"
  | "WALLET_CONVERSION_ACCOUNTING_TRANSACTION_CONFLICT";

export class WalletConversionAccountingError extends FinancialError {
  readonly statusCode: number;

  constructor(message: string, code: WalletConversionAccountingErrorCode,
    options?: { cause?: unknown }) {
    super(message, code, options);
    this.name = "WalletConversionAccountingError";
    this.statusCode = code.endsWith("NOT_FOUND") ? 404 :
      code.endsWith("INVALID_INPUT") ? 422 : 409;
  }
}
