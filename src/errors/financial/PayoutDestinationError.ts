import { FinancialError } from "./FinancialError";

export class PayoutDestinationError extends FinancialError {
  constructor(
    message = "Payout destination operation failed.",
    code = "PAYOUT_DESTINATION_ERROR",
    options?: { cause?: unknown; isOperational?: boolean },
  ) {
    super(message, code, options);
    this.name = this.constructor.name;
  }
}
