export type BookingSettlementReleaseErrorCode =
  | "BOOKING_SETTLEMENT_RELEASE_BOOKING_NOT_FOUND"
  | "BOOKING_SETTLEMENT_RELEASE_HOLD_ACTIVE"
  | "BOOKING_SETTLEMENT_RELEASE_INVALID_TRIGGER";

export class BookingSettlementReleaseError extends Error {
  readonly statusCode: number;

  constructor(
    message: string,
    readonly code: BookingSettlementReleaseErrorCode,
  ) {
    super(message);
    this.name = "BookingSettlementReleaseError";
    this.statusCode = code === "BOOKING_SETTLEMENT_RELEASE_BOOKING_NOT_FOUND" ? 404 : 409;
  }
}
