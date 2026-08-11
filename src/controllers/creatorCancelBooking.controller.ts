import { Request, Response } from "express";
import { BookingTerminationActorType, BookingTerminationType } from "../enums/booking/bookingTerminationType.enum";
import { bookingFinancialTerminationService } from "../services/financial/bookingFinancialTermination.service";

export const cancelBookingByCreator = async (req: Request, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });
  try {
    const result = await bookingFinancialTerminationService.terminateBookingFinancially({
      bookingId: req.body.bookingId,
      actorId: req.user.id,
      actorType: BookingTerminationActorType.CREATOR,
      terminationType: BookingTerminationType.CREATOR_CANCELLED,
      reason: typeof req.body.reason === "string" ? req.body.reason : undefined,
    });
    return res.status(200).json({ message: "Booking cancelled by creator", ...result });
  } catch (error: any) {
    return res.status(error.statusCode ?? 400).json({ code: error.code, message: error.message });
  }
};
