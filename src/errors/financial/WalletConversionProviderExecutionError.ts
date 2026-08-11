import { FinancialError } from "./FinancialError";

export type WalletConversionProviderExecutionErrorCode =
  | "WALLET_CONVERSION_PROVIDER_UNAUTHORIZED"
  | "WALLET_CONVERSION_PROVIDER_INVALID_INPUT"
  | "WALLET_CONVERSION_PROVIDER_REQUEST_NOT_FOUND"
  | "WALLET_CONVERSION_PROVIDER_REQUEST_NOT_APPROVED"
  | "WALLET_CONVERSION_PROVIDER_IDENTITY_CONFLICT"
  | "WALLET_CONVERSION_PROVIDER_STATE_CONFLICT"
  | "WALLET_CONVERSION_PROVIDER_TERMINAL_MISMATCH"
  | "WALLET_CONVERSION_PROVIDER_REPLAY_CONFLICT"
  | "WALLET_CONVERSION_PROVIDER_EVENT_CONFLICT"
  | "WALLET_CONVERSION_PROVIDER_AUDIT_CONFLICT"
  | "WALLET_CONVERSION_PROVIDER_SYNCHRONIZATION_CONFLICT"
  | "WALLET_CONVERSION_PROVIDER_TRANSACTION_CONFLICT"
  | "WALLET_CONVERSION_PROVIDER_FAILURE";

export class WalletConversionProviderExecutionError extends FinancialError {
  readonly statusCode: number;

  constructor(message: string,
    code: WalletConversionProviderExecutionErrorCode,
    options?: { cause?: unknown }) {
    super(message, code, options);
    this.name = "WalletConversionProviderExecutionError";
    this.statusCode = code.endsWith("UNAUTHORIZED") ? 401 :
      code.endsWith("INVALID_INPUT") ? 422 :
        code.endsWith("NOT_FOUND") ? 404 : 409;
  }
}
