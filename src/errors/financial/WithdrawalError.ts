import { FinancialError } from "./FinancialError";

export class WithdrawalError extends FinancialError {
  constructor(
    message = "Withdrawal operation failed.",
    code = "WITHDRAWAL_ERROR",
    options?: {
      cause?: unknown;
      isOperational?: boolean;
    },
  ) {
    super(message, code, options);

    this.name = this.constructor.name;
  }
}
