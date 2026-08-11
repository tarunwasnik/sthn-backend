import { FinancialError } from "./FinancialError";

export type WithdrawalProviderInitializationErrorCode =
  | "WITHDRAWAL_PROVIDER_WITHDRAWAL_MISSING"
  | "WITHDRAWAL_PROVIDER_RESERVATION_MISSING"
  | "WITHDRAWAL_PROVIDER_DESTINATION_MISSING"
  | "WITHDRAWAL_PROVIDER_PROVIDER_CONFLICT"
  | "WITHDRAWAL_PROVIDER_IDENTITY_CONFLICT"
  | "WITHDRAWAL_PROVIDER_EVENT_CONFLICT"
  | "WITHDRAWAL_PROVIDER_TRANSACTION_CONFLICT"
  | "WITHDRAWAL_PROVIDER_REPLAY_CONFLICT";

export class WithdrawalProviderInitializationError extends FinancialError {
  readonly statusCode: number;

  constructor(
    message: string,
    code: WithdrawalProviderInitializationErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, code, options);
    this.name = "WithdrawalProviderInitializationError";
    this.statusCode = code.endsWith("_MISSING") ? 404 : 409;
  }
}
