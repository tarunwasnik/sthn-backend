// backend/src/jobs/interactionTrigger.job.ts

import mongoose from "mongoose";
import { Booking } from "../models/booking.model";
import { Slot } from "../models/slot.model";

/**
 * Marks interaction as started when booking start time is reached
 * This prevents refund abuse when user waits silently
 */
export const interactionTriggerJob = async () => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const now = new Date();

    // 1️⃣ Find CONFIRMED bookings without interaction
    const bookings = await Booking.find({
      status: "CONFIRMED",
      hasInteracted: false,
    }).session(session);

    if (bookings.length === 0) {
      await session.commitTransaction();
      console.log("[interactionTriggerJob] No bookings to process");
      return;
    }

    for (const booking of bookings) {

      // 2️⃣ Get earliest slot startTime (only one slot needed)
      const firstSlot = await Slot.findOne(
        { _id: { $in: booking.slotIds } },
        null,
        { session }
      ).sort({ startTime: 1 });

      if (!firstSlot) continue;

      const startTime = firstSlot.startTime;

      // 3️⃣ If booking time has started → mark interaction
      if (startTime <= now) {
        booking.hasInteracted = true;
        booking.interactionStartedAt = startTime;
        await booking.save({ session });
      }
    }

    await session.commitTransaction();

  } catch (err) {
    await session.abortTransaction();
    console.error("[interactionTriggerJob] Error:", err);
  } finally {
    session.endSession();
  }
};