export type BookingEscrowAllocationErrorCode =
  | "BOOKING_ESCROW_ALLOCATION_BOOKING_NOT_FOUND"
  | "BOOKING_ESCROW_ALLOCATION_PAYMENT_NOT_FOUND"
  | "BOOKING_ESCROW_ALLOCATION_RESERVATION_NOT_FOUND"
  | "BOOKING_ESCROW_ALLOCATION_ALREADY_ALLOCATED"
  | "BOOKING_ESCROW_ALLOCATION_STATUS_CONFLICT"
  | "BOOKING_ESCROW_ALLOCATION_IDENTITY_CONFLICT"
  | "BOOKING_ESCROW_ALLOCATION_LEDGER_CONFLICT"
  | "BOOKING_ESCROW_ALLOCATION_TRANSACTION_CONFLICT"
  | "BOOKING_ESCROW_ALLOCATION_DISPUTE_OPEN"
  | "BOOKING_ESCROW_ALLOCATION_FINANCIAL_LOCKED"
  | "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR";

const statusFor = (code: BookingEscrowAllocationErrorCode): number => {
  if ([
    "BOOKING_ESCROW_ALLOCATION_BOOKING_NOT_FOUND",
    "BOOKING_ESCROW_ALLOCATION_PAYMENT_NOT_FOUND",
    "BOOKING_ESCROW_ALLOCATION_RESERVATION_NOT_FOUND",
  ].includes(code)) return 404;
  if (code === "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR") return 500;
  return 409;
};

export class BookingEscrowAllocationError extends Error {
  readonly code: BookingEscrowAllocationErrorCode;
  readonly statusCode: number;
  readonly cause?: unknown;

  constructor(
    message: string,
    code: BookingEscrowAllocationErrorCode,
    options: { cause?: unknown } = {},
  ) {
    super(message);
    this.name = "BookingEscrowAllocationError";
    this.code = code;
    this.statusCode = statusFor(code);
    this.cause = options.cause;
  }
}
