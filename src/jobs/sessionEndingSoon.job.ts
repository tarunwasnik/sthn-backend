// backend/src/jobs/sessionEndingSoon.job.ts

import mongoose from "mongoose";
import { Booking } from "../models/booking.model";
import { Slot } from "../models/slot.model";

/**
 * Notifies users when a session is about to end (5 minutes before).
 * Runs every minute.
 */
export const sessionEndingSoonJob = async () => {
  const now = new Date();
  const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);

  try {
    const activeBookings = await Booking.find({
      status: "CONFIRMED",
      hasInteracted: true,
    });

    if (activeBookings.length === 0) return;

    for (const booking of activeBookings) {

      // Get latest slot end time directly
      const latestSlot = await Slot.findOne(
        { _id: { $in: booking.slotIds } },
        { endTime: 1 }
      ).sort({ endTime: -1 });

      if (!latestSlot) continue;

      const latestEndTime = latestSlot.endTime;

      if (
        latestEndTime > now &&
        latestEndTime <= fiveMinutesLater
      ) {
        /**
         * Notification trigger placeholder
         *
         * socket.emit("sessionEndingSoon", { bookingId })
         * or push notification / in-app notification
         */

        console.log(
          `[sessionEndingSoonJob] Booking ${booking._id} ending soon`
        );
      }
    }
  } catch (err) {
    console.error("[sessionEndingSoonJob] Error:", err);
  }
};