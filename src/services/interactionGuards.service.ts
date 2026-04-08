//backend/src/services/interactionGuards.service.ts


import { Booking } from "../models/booking.model";

export class InteractionGuardError extends Error {
  code: "REFUND_LOCKED" | "CANCELLATION_LOCKED";
  constructor(code: InteractionGuardError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Throws if refund is not allowed
 */
export const assertRefundAllowed = async (bookingId: string) => {
  const booking = await Booking.findById(bookingId).select("hasInteracted");
  if (!booking) throw new Error("Booking not found");

  if (booking.hasInteracted) {
    throw new InteractionGuardError(
      "REFUND_LOCKED",
      "Refunds are locked after interaction has started"
    );
  }
};

/**
 * Throws if cancellation is not allowed
 */
export const assertCancellationAllowed = async (bookingId: string) => {
  const booking = await Booking.findById(bookingId).select("hasInteracted");
  if (!booking) throw new Error("Booking not found");

  if (booking.hasInteracted) {
    throw new InteractionGuardError(
      "CANCELLATION_LOCKED",
      "Cancellations are locked after interaction has started"
    );
  }
};