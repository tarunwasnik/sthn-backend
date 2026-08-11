import { FinancialError } from "./FinancialError";
export type InternalTopUpFundingErrorCode =
  | "INTERNAL_TOP_UP_FUNDING_INVALID_OUTCOME" | "INTERNAL_TOP_UP_FUNDING_FAILURE_CODE_REQUIRED"
  | "INTERNAL_TOP_UP_FUNDING_FAILURE_DATA_NOT_ALLOWED" | "INTERNAL_TOP_UP_FUNDING_INVALID_FAILURE_REASON"
  | "INTERNAL_TOP_UP_FUNDING_NOT_FOUND" | "INTERNAL_TOP_UP_FUNDING_INVALID_STATUS"
  | "INTERNAL_TOP_UP_FUNDING_IDENTITY_CONFLICT" | "INTERNAL_TOP_UP_FUNDING_OUTCOME_CONFLICT"
  | "INTERNAL_TOP_UP_FUNDING_FAILURE_PAYLOAD_CONFLICT" | "INTERNAL_TOP_UP_FUNDING_REQUEST_LINK_MISSING"
  | "INTERNAL_TOP_UP_FUNDING_REQUEST_LINK_CONFLICT" | "INTERNAL_TOP_UP_FUNDING_INTEGRITY_ERROR"
  | "INTERNAL_TOP_UP_FUNDING_DUPLICATE_IDENTITY_CONFLICT";
export class InternalTopUpFundingError extends FinancialError {
  public readonly statusCode: number;
  constructor(message: string, code: InternalTopUpFundingErrorCode, statusCode = 409, options?: { cause?: unknown }) { super(message, code, { cause: options?.cause }); this.name = this.constructor.name; this.statusCode = statusCode; }
}
