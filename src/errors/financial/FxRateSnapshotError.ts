import { FinancialError } from "./FinancialError";

export type FxRateSnapshotErrorCode =
  | "FX_RATE_UNSUPPORTED_BASE_CURRENCY"
  | "FX_RATE_UNSUPPORTED_QUOTE_CURRENCY"
  | "FX_RATE_PAIR_NOT_SUPPORTED"
  | "FX_RATE_IDENTICAL_CURRENCIES"
  | "FX_RATE_PROVIDER_NOT_CONFIGURED"
  | "FX_RATE_PROVIDER_TIMEOUT"
  | "FX_RATE_PROVIDER_UNAVAILABLE"
  | "FX_RATE_PROVIDER_INVALID_RESPONSE"
  | "FX_RATE_INVALID_RATE"
  | "FX_RATE_INVALID_EFFECTIVE_DATE"
  | "FX_RATE_STALE_PROVIDER_RESPONSE"
  | "FX_RATE_SNAPSHOT_NOT_FOUND"
  | "FX_RATE_SNAPSHOT_EXPIRED"
  | "FX_RATE_SNAPSHOT_IDENTITY_CONFLICT"
  | "FX_RATE_CURRENT_AUTHORITY_CONFLICT"
  | "FX_RATE_REPLAY_CONFLICT"
  | "FX_RATE_INTEGRITY_ERROR";

export class FxRateSnapshotError extends FinancialError {
  public readonly statusCode: number;

  constructor(
    message: string,
    code: FxRateSnapshotErrorCode,
    statusCode = 409,
    cause?: unknown,
  ) {
    super(message, code, { cause });
    this.statusCode = statusCode;
  }
}
