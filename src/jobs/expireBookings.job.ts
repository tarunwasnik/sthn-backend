// backend/src/jobs/expireBookings.job.ts

import mongoose from "mongoose";
import { Booking } from "../models/booking.model";
import { Slot } from "../models/slot.model";

/**
 * Expires REQUESTED bookings whose expiresAt has passed
 * Runs every minute
 */
export const expireBookingsJob = async () => {
  const session = await mongoose.startSession();

  try {
    const now = new Date();

    // 🔹 Step 1: Fetch expired bookings OUTSIDE transaction (IMPORTANT)
    const expiredBookings = await Booking.find(
      {
        status: "REQUESTED",
        expiresAt: { $lte: now },
      },
      { _id: 1, slotIds: 1 }
    );

    if (expiredBookings.length === 0) {
      console.log("[expireBookingsJob] No expired bookings");
      return;
    }

    const bookingIds = expiredBookings.map((b) => b._id);

    // 🔹 Deduplicate slot IDs safely
    const slotIds = [
      ...new Set(
        expiredBookings.flatMap((b) =>
          b.slotIds.map((id) => id.toString())
        )
      ),
    ].map((id) => new mongoose.Types.ObjectId(id));

    // 🔒 Step 2: Start transaction ONLY for DB writes
    session.startTransaction();

    // 🔹 Step 3: Expire bookings (SAFE re-check condition)
    await Booking.updateMany(
      {
        _id: { $in: bookingIds },
        status: "REQUESTED",
      },
      {
        $set: { status: "EXPIRED" },
      },
      { session }
    );

    // 🔹 Step 4: Release slots
    if (slotIds.length > 0) {
      await Slot.updateMany(
        {
          _id: { $in: slotIds },
          status: "LOCKED",
        },
        {
          $set: { status: "AVAILABLE" },
        },
        { session }
      );
    }

    await session.commitTransaction();

    console.log(
      `[expireBookingsJob] Expired ${bookingIds.length} booking(s)`
    );
  } catch (err) {
    await session.abortTransaction();
    console.error("[expireBookingsJob] Error:", err);
  } finally {
    session.endSession();
  }
};