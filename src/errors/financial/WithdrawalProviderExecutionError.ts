import { FinancialError } from "./FinancialError";

export type WithdrawalProviderExecutionErrorCode =
  | "WITHDRAWAL_PROVIDER_EXECUTION_PROVIDER_MISSING"
  | "WITHDRAWAL_PROVIDER_EXECUTION_STATE_CONFLICT"
  | "WITHDRAWAL_PROVIDER_EXECUTION_CONFLICT"
  | "WITHDRAWAL_PROVIDER_EXECUTION_PROVIDER_FAILURE"
  | "WITHDRAWAL_PROVIDER_EXECUTION_REPLAY_CONFLICT"
  | "WITHDRAWAL_PROVIDER_EXECUTION_TRANSACTION_CONFLICT"
  | "WITHDRAWAL_PROVIDER_EXECUTION_EVENT_CONFLICT"
  | "WITHDRAWAL_PROVIDER_EXECUTION_TERMINAL_MISMATCH";

export class WithdrawalProviderExecutionError extends FinancialError {
  readonly statusCode: number;

  constructor(
    message: string,
    code: WithdrawalProviderExecutionErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, code, options);
    this.name = "WithdrawalProviderExecutionError";
    this.statusCode = code.endsWith("_MISSING") ? 404 : 409;
  }
}
