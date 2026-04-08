//backend/src/services/booking/completeBooking.service.ts

import mongoose from "mongoose";
import { Booking } from "../../models/booking.model";
import { Dispute } from "../../models/dispute.model";
import { FeatureFlagGuard } from "../controlPlane/featureFlagGuard.service";

interface CompleteBookingInput {
  bookingId: string;
  creatorId: string;
  role: string;
}

const PLATFORM_COMMISSION_RATE = 0.2; // 20%

export const completeBookingService = async ({
  bookingId,
  creatorId,
  role,
}: CompleteBookingInput) => {

  // ✅ OUTSIDE TRANSACTION
  await FeatureFlagGuard.requireEnabled(
    "BOOKING_COMPLETION_ENABLED",
    { userId: creatorId, role },
    "Booking completion is temporarily disabled"
  );

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new Error("Invalid bookingId");
  }

  let session: mongoose.ClientSession | null = null;

  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const booking = await Booking.findOne({
      _id: bookingId,
      creatorId,
    }).session(session);

    if (!booking) {
      throw new Error("Booking not found");
    }

    if (booking.isFinancialLocked) {
      throw new Error(
        "Financial operations are locked for this booking"
      );
    }

    const openDispute = await Dispute.findOne({
      bookingId: booking._id,
      status: "OPEN",
    }).session(session);

    if (openDispute) {
      throw new Error(
        "Booking cannot be completed while a dispute is open"
      );
    }

    if (booking.status !== "CONFIRMED") {
      throw new Error("Only confirmed bookings can be completed");
    }

    if (!booking.isPayable) {
      throw new Error("Booking is not payable");
    }

    if (booking.paymentStatus === "REFUNDED") {
      throw new Error("Refunded booking cannot be completed");
    }

    if (booking.isPayoutEligible) {
      throw new Error("Booking is already payout-eligible");
    }

    if (typeof booking.price !== "number") {
      throw new Error("Booking price snapshot missing");
    }

    if (
      booking.creatorEarningSnapshot !== undefined ||
      booking.platformCommissionSnapshot !== undefined
    ) {
      throw new Error(
        "Earning snapshots are already attached to this booking"
      );
    }

    /*
      🔥 Compute earnings
    */
    const platformCommission = Number(
      (booking.price * PLATFORM_COMMISSION_RATE).toFixed(2)
    );

    const creatorEarning = Number(
      (booking.price - platformCommission).toFixed(2)
    );

    booking.status = "COMPLETED";
    booking.completedAt = new Date(); // ✅ IMPORTANT

    booking.isPayoutEligible = true;

    booking.creatorEarningSnapshot = creatorEarning;
    booking.platformCommissionSnapshot = platformCommission;

    booking.isFinancialLocked = true;

    await booking.save({ session });

    await session.commitTransaction();

    return booking;

  } catch (err) {
    if (session) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    if (session) {
      session.endSession();
    }
  }
};