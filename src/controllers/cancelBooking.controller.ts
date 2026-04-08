//backend/src/controllers/cancelBooking.controller.ts

import { Response, Request } from "express";
import mongoose from "mongoose";
import { Booking } from "../models/booking.model";
import { Slot } from "../models/slot.model";
import {
  assertCancellationAllowed,
  InteractionGuardError,
} from "../services/interactionGuards.service";

export const cancelBooking = async (req: Request, res: Response) => {
  const { bookingId } = req.params;

  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    return res.status(400).json({ message: "Invalid bookingId" });
  }

  try {
    await assertCancellationAllowed(bookingId);
  } catch (err: any) {
    if (err instanceof InteractionGuardError) {
      return res.status(403).json({ code: err.code, message: err.message });
    }
    throw err;
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const booking = await Booking.findById(bookingId).session(session);

    if (!booking) {
      throw new Error("Booking not found");
    }

    /*
      Lifecycle guard:
      Only REQUESTED and CONFIRMED bookings can be cancelled
    */
    if (!["REQUESTED", "CONFIRMED"].includes(booking.status)) {
      throw new Error("Booking not cancellable");
    }

    const previousStatus = booking.status;

    booking.status = "CANCELLED";

    /*
      Slot freeing must follow the same lifecycle contract
      used by user/creator cancellation.
    */

    if (previousStatus === "REQUESTED") {
      // free only LOCKED slots
      await Slot.updateMany(
        {
          _id: { $in: booking.slotIds },
          status: "LOCKED",
        },
        { status: "AVAILABLE" },
        { session }
      );
    }

    if (previousStatus === "CONFIRMED") {
      // free only BOOKED slots
      await Slot.updateMany(
        {
          _id: { $in: booking.slotIds },
          status: "BOOKED",
        },
        { status: "AVAILABLE" },
        { session }
      );
    }

    await booking.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ message: "Booking cancelled" });
  } catch (err: any) {
    await session.abortTransaction();
    session.endSession();
    return res.status(400).json({ message: err.message });
  }
};
