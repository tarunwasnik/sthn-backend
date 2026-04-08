// backend/src/controllers/bookingInteraction.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { Booking } from "../models/booking.model";

export const markBookingInteracted = async (
  req: Request,
  res: Response
) => {
  const user = req.user;
  const { bookingId } = req.params;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    return res.status(400).json({ message: "Invalid bookingId" });
  }

  const booking = await Booking.findOne({
    _id: bookingId,
    status: "CONFIRMED",
  });

  if (!booking) {
    return res.status(404).json({
      message: "Booking not found or not confirmed",
    });
  }

  if (
    String(booking.userId) !== String(user.id) &&
    String(booking.creatorId) !== String(user.id)
  ) {
    return res.status(403).json({ message: "Access denied" });
  }

  const updatedBooking = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      hasInteracted: false,
    },
    {
      $set: {
        hasInteracted: true,
        interactionStartedAt: new Date(),
      },
    },
    { new: true }
  );

  if (!updatedBooking) {
    return res.status(200).json({
      message: "Interaction already recorded",
      booking,
    });
  }

  return res.status(200).json({
    message: "Interaction recorded successfully",
    booking: updatedBooking,
  });
};