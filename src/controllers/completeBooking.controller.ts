// backend/src/controllers/completeBooking.controller.ts

import { Request, Response } from "express";
import { completeBookingService } from "../services/booking/completeBooking.service";
import { BookingWalletReservationCaptureError } from "../errors/financial/BookingWalletReservationCaptureError";

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
    const result = await completeBookingService({
      bookingId,
      creatorId: user.id,
      role: user.role,
    });

    return res.status(200).json({
      message: "Booking completed successfully",
      ...(result as Record<string, unknown>),
    });
  } catch (err: any) {
    return res.status(
      err instanceof BookingWalletReservationCaptureError ? err.statusCode : 400,
    ).json({
      ...(err instanceof BookingWalletReservationCaptureError ? { code: err.code } : {}),
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
    const result = await completeBookingService({
      bookingId,
      creatorId: user.id, // service will validate role
      role: user.role,
    });

    return res.status(200).json({
      message: "Session ended successfully",
      ...(result as Record<string, unknown>),
    });
  } catch (err: any) {
    return res.status(
      err instanceof BookingWalletReservationCaptureError ? err.statusCode : 400,
    ).json({
      ...(err instanceof BookingWalletReservationCaptureError ? { code: err.code } : {}),
      message: err.message || "Failed to end session",
    });
  }
};
