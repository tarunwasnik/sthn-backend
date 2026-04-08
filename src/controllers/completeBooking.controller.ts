// backend/src/controllers/completeBooking.controller.ts

import { Request, Response } from "express";
import { completeBookingService } from "../services/booking/completeBooking.service";

/* =========================================================
   CREATOR COMPLETES BOOKING
   ========================================================= */

export const completeBookingByCreator = async (
  req: Request,
  res: Response
) => {
  const user = req.user;
  const { bookingId } = req.params;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const booking = await completeBookingService({
      bookingId,
      creatorId: user.id,
      role: user.role,
    });

    return res.status(200).json({
      message: "Booking completed successfully",
      booking,
    });
  } catch (err: any) {
    return res.status(400).json({
      message: err.message || "Failed to complete booking",
    });
  }
};

/* =========================================================
   USER ENDS SESSION
   ========================================================= */

export const completeBookingByUser = async (
  req: Request,
  res: Response
) => {
  const user = req.user;
  const { bookingId } = req.params;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const booking = await completeBookingService({
      bookingId,
      creatorId: user.id, // service will validate role
      role: user.role,
    });

    return res.status(200).json({
      message: "Session ended successfully",
      booking,
    });
  } catch (err: any) {
    return res.status(400).json({
      message: err.message || "Failed to end session",
    });
  }
};