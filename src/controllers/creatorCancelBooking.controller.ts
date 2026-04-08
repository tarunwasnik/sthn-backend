// backend/src/controllers/creatorCancelBooking.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { Booking } from "../models/booking.model";
import { Slot } from "../models/slot.model";
import User from "../models/User";
import { applyAbuseScore } from "../services/abuseScore.service";

export const cancelBookingByCreator = async (
  req: Request,
  res: Response
) => {
  try {
    console.log("========== CANCEL BY CREATOR ==========");

    /* ================= USER ================= */

    const userId = (req.user as any)?._id?.toString();

    console.log("REQ.USER:", req.user);
    console.log("USER ID (from DB):", userId);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    /* ================= INPUT ================= */

    const { bookingId } = req.body;

    console.log("REQ.BODY:", req.body);

    if (!bookingId) {
      return res.status(400).json({ message: "bookingId required" });
    }

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid bookingId" });
    }

    /* ================= USER CHECK ================= */

    const dbUser = await User.findById(userId);

    if (!dbUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (
      dbUser.creatorCooldownUntil &&
      dbUser.creatorCooldownUntil > new Date()
    ) {
      return res.status(403).json({
        message: "Creator actions temporarily disabled",
      });
    }

    /* ================= BOOKING ================= */

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    console.log("BOOKING ID:", booking._id);
    console.log(
      "BOOKING CREATOR ID:",
      booking.creatorId?.toString()
    );

    /* ================= AUTH ================= */

    if (booking.creatorId.toString() !== userId) {
      console.log("❌ AUTH FAILED");
      console.log("BOOKING CREATOR:", booking.creatorId.toString());
      console.log("USER ID:", userId);

      return res.status(403).json({
        message: "Not authorized",
      });
    }

    /* ================= STATUS ================= */

    const status = booking.status?.trim().toUpperCase();

    console.log("BOOKING STATUS:", status);

    if (status !== "CONFIRMED") {
      return res.status(400).json({
        message: `Booking not cancellable (${booking.status})`,
      });
    }

    /* ================= TRANSACTION ================= */

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      /* ===== UPDATE BOOKING ===== */
      booking.status = "CANCELLED";
      booking.paymentStatus = "REFUNDED";

      /* ===== RELEASE SLOTS ===== */
      const slotUpdate = await Slot.updateMany(
        {
          _id: { $in: booking.slotIds },
          status: "BOOKED",
        },
        { status: "AVAILABLE" },
        { session }
      );

      console.log("SLOTS UPDATED:", slotUpdate.modifiedCount);

      await booking.save({ session });

      console.log("BOOKING UPDATED");

      /* ===== ABUSE SCORE ===== */
      try {
  await applyAbuseScore(
    booking.creatorId,
    booking.hasInteracted
      ? "CREATOR_CANCEL_AFTER_INTERACTION"
      : "CREATOR_CANCEL"
  );
  console.log("ABUSE SCORE APPLIED");
} catch (err) {
  console.error("ABUSE SCORE FAILED:", err);
}

      console.log("ABUSE SCORE APPLIED");

      /* ===== COMMIT ===== */
      await session.commitTransaction();
    } catch (err: any) {
      await session.abortTransaction();

      console.error("❌ TRANSACTION ERROR:", err);

      return res.status(400).json({
        message: err.message || "Cancel failed",
      });
    } finally {
      session.endSession(); // ✅ ALWAYS CLOSE SESSION
    }

    /* ================= FINAL RESPONSE ================= */

    console.log("✅ CANCEL SUCCESS");

    return res.status(200).json({
      message: "Booking cancelled by creator",
      booking,
    });

  } catch (err: any) {
    console.error("❌ OUTER ERROR:", err);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};