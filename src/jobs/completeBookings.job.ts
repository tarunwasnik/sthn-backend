// backend/src/jobs/completeBookings.job.ts

import mongoose from "mongoose";
import { Booking } from "../models/booking.model";
import { Slot } from "../models/slot.model";

export const completeBookingsJob = async () => {
  let session: mongoose.ClientSession | null = null;

  try {
    const now = new Date();
    const TEN_MINUTES = 10 * 60 * 1000;

    const bookings = await Booking.find(
      { status: "CONFIRMED" },
      { _id: 1, slotIds: 1 }
    );

    if (bookings.length === 0) return;

    const allSlotIds = [
      ...new Set(
        bookings.flatMap((b) =>
          b.slotIds.map((id) => id.toString())
        )
      ),
    ].map((id) => new mongoose.Types.ObjectId(id));

    const slots = await Slot.find(
      { _id: { $in: allSlotIds } },
      { _id: 1, endTime: 1 }
    );

    const slotMap = new Map<string, Date>();
    for (const slot of slots) {
      slotMap.set(slot._id.toString(), slot.endTime);
    }

    const eligibleBookings: mongoose.Types.ObjectId[] = [];

    for (const booking of bookings) {
      const allEnded = booking.slotIds.every((slotId) => {
        const endTime = slotMap.get(slotId.toString());
        if (!endTime) return false;

        return (
          endTime.getTime() + TEN_MINUTES <= now.getTime()
        );
      });

      if (allEnded) {
        eligibleBookings.push(booking._id);
      }
    }

    if (eligibleBookings.length === 0) return;

    // ✅ CREATE SESSION ONLY WHEN NEEDED
    session = await mongoose.startSession();
    session.startTransaction();

    await Booking.updateMany(
      {
        _id: { $in: eligibleBookings },
        status: "CONFIRMED",
      },
      {
        $set: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      },
      { session }
    );

    await session.commitTransaction();

  } catch (err) {
    if (session) {
      await session.abortTransaction();
    }
    console.error("[completeBookingsJob] Error:", err);
  } finally {
    if (session) {
      session.endSession();
    }
  }
};