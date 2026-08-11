import mongoose from "mongoose";

import { Booking } from "../models/booking.model";
import { Dispute } from "../models/dispute.model";
import { Slot } from "../models/slot.model";
import { completeBookingAutomatically } from "../services/booking/completeBooking.service";

/** Discovery remains scheduled; the completion application owns each transaction. */
export const completeBookingsJob = async () => {
  const report = { processed: 0, completed: 0, replayed: 0, blocked: 0 };
  const now = new Date();
  const tenMinutes = 10 * 60 * 1_000;
  const bookings = await Booking.find(
    { status: "CONFIRMED", isFinancialLocked: { $ne: true } },
    { _id: 1, slotIds: 1 },
  );
  if (!bookings.length) return report;

  const allSlotIds = [...new Set(bookings.flatMap((booking) =>
    booking.slotIds.map((id) => id.toString())))]
    .map((id) => new mongoose.Types.ObjectId(id));
  const slots = await Slot.find(
    { _id: { $in: allSlotIds } },
    { _id: 1, endTime: 1 },
  );
  const slotEnd = new Map(slots.map((slot) => [slot._id.toString(), slot.endTime]));
  const eligible = bookings.filter((booking) =>
    booking.slotIds.every((slotId) => {
      const end = slotEnd.get(slotId.toString());
      return !!end && end.getTime() + tenMinutes <= now.getTime();
    }));
  if (!eligible.length) return report;

  const disputed = await Dispute.find(
    { bookingId: { $in: eligible.map((booking) => booking._id) }, status: "OPEN" },
    { bookingId: 1 },
  );
  const disputedIds = new Set(disputed.map((entry) => entry.bookingId.toString()));
  for (const booking of eligible) {
    report.processed += 1;
    if (disputedIds.has(booking._id.toString())) {
      report.blocked += 1;
      continue;
    }
    try {
      const result = await completeBookingAutomatically(booking._id.toString()) as {
        replay?: boolean;
      };
      if (result?.replay) report.replayed += 1;
      else report.completed += 1;
    } catch (error) {
      report.blocked += 1;
      console.error(
        "[completeBookingsJob]",
        booking._id.toString(),
        error instanceof Error ? error.message : error,
      );
    }
  }
  return report;
};
