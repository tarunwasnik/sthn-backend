import { FinancialError } from "./FinancialError";

export type CreatorWithdrawalRequestErrorCode =
  | "CREATOR_WITHDRAWAL_INVALID_REQUEST"
  | "CREATOR_WITHDRAWAL_CREATOR_INACTIVE"
  | "CREATOR_WITHDRAWAL_WALLET_MISSING"
  | "CREATOR_WITHDRAWAL_DESTINATION_MISSING"
  | "CREATOR_WITHDRAWAL_CURRENCY_MISMATCH"
  | "CREATOR_WITHDRAWAL_INSUFFICIENT_BALANCE"
  | "CREATOR_WITHDRAWAL_ELIGIBILITY_FAILURE"
  | "CREATOR_WITHDRAWAL_EXISTING_WITHDRAWAL"
  | "CREATOR_WITHDRAWAL_LEDGER_CONFLICT"
  | "CREATOR_WITHDRAWAL_PROJECTION_CONFLICT"
  | "CREATOR_WITHDRAWAL_REPLAY_CONFLICT"
  | "CREATOR_WITHDRAWAL_INTEGRITY_CONFLICT"
  | "CREATOR_WITHDRAWAL_TRANSACTION_CONFLICT";

export class CreatorWithdrawalRequestError extends FinancialError {
  readonly statusCode: number;

  constructor(
    message: string,
    code: CreatorWithdrawalRequestErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, code, options);
    this.name = "CreatorWithdrawalRequestError";
    this.statusCode = code.endsWith("_MISSING")
      ? 404
      : code === "CREATOR_WITHDRAWAL_INVALID_REQUEST"
        ? 400
        : 409;
  }
}
