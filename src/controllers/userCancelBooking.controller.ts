//backend/src/controllers/userCancelBooking.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { Booking } from "../models/booking.model";
import { Slot } from "../models/slot.model";

export const cancelBookingByUser = async (
  req: Request,
  res: Response
) => {
  const rawUser = req.user as any;

  const userId =
    rawUser?.id ||
    rawUser?._id ||
    rawUser?.userId;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { bookingId } = req.body;

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const booking = await Booking.findById(bookingId).session(session);

    if (!booking) throw new Error("Booking not found");

    if (String(booking.userId) !== String(userId)) {
      throw new Error("Not authorized");
    }

    const status = booking.status;

    if (!["REQUESTED", "CONFIRMED"].includes(status)) {
      throw new Error("Booking not cancellable");
    }

    booking.status = "CANCELLED";

    if (booking.paymentStatus === "PAID") {
      booking.paymentStatus = "REFUNDED";
    }

    await Slot.updateMany(
      { _id: { $in: booking.slotIds } },
      { status: "AVAILABLE" },
      { session }
    );

    await booking.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.json({ message: "Booking cancelled", booking });
  } catch (err: any) {
    await session.abortTransaction();
    session.endSession();

    return res.status(400).json({ message: err.message });
  }
};