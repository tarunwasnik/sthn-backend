//backend/src/controllers/refund.controller.ts

import { Request,Response } from "express";
import { Booking } from "../models/booking.model";
import { assertRefundAllowed, InteractionGuardError } from "../services/interactionGuards.service";

export const requestRefund = async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  try {
    await assertRefundAllowed(bookingId);
  } catch (err: any) {
    if (err instanceof InteractionGuardError) {
      return res.status(403).json({ code: err.code, message: err.message });
    }
    throw err;
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) return res.status(404).json({ message: "Booking not found" });

  booking.paymentStatus = "REFUNDED";
  await booking.save();

  return res.status(200).json({ message: "Refund processed" });
};