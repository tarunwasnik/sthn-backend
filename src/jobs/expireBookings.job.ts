import { Booking } from "../models/booking.model";
import { BookingTerminationActorType, BookingTerminationType } from "../enums/booking/bookingTerminationType.enum";
import { bookingFinancialTerminationService } from "../services/financial/bookingFinancialTermination.service";

/** The scheduled expiry caller owns discovery only; Financial termination owns execution. */
export const expireBookingsJob = async () => {
  const expiredBookings = await Booking.find({
    status: "REQUESTED",
    expiresAt: { $lte: new Date() },
  }).select("_id");

  for (const booking of expiredBookings) {
    await bookingFinancialTerminationService.terminateBookingFinancially({
      bookingId: booking._id.toString(),
      actorType: BookingTerminationActorType.SYSTEM,
      terminationType: BookingTerminationType.BOOKING_EXPIRED,
      reason: "Booking request expired.",
    });
  }
};
