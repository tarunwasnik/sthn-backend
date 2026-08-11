export class BookingTerminationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code = "BOOKING_TERMINATION_ERROR", statusCode = 400) {
    super(message);
    this.name = "BookingTerminationError";
    this.code = code;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
