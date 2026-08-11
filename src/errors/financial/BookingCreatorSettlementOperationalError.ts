export type BookingCreatorSettlementOperationalErrorCode =
  | "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_RECONCILIATION_NOT_FOUND"
  | "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_SETTLEMENT_NOT_FOUND"
  | "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_RETRY_NOT_ALLOWED"
  | "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_REPAIR_NOT_ALLOWED"
  | "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_INTEGRITY_CONFLICT"
  | "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_LEDGER_CONFLICT"
  | "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_PROJECTION_CONFLICT"
  | "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_WALLET_CONFLICT"
  | "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_AUDIT_CONFLICT"
  | "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT";

export class BookingCreatorSettlementOperationalError extends Error {
  readonly code: BookingCreatorSettlementOperationalErrorCode;
  readonly statusCode: number;
  readonly cause?: unknown;

  constructor(
    message: string,
    code: BookingCreatorSettlementOperationalErrorCode,
    cause?: unknown,
  ) {
    super(message);
    this.name = "BookingCreatorSettlementOperationalError";
    this.code = code;
    this.statusCode = code.endsWith("_NOT_FOUND") ? 404 : 409;
    this.cause = cause;
  }
}
