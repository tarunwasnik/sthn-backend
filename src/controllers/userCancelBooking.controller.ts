import { Request, Response } from "express";
import { BookingTerminationActorType, BookingTerminationType } from "../enums/booking/bookingTerminationType.enum";
import { bookingFinancialTerminationService } from "../services/financial/bookingFinancialTermination.service";

export const cancelBookingByUser = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const bookingId = req.params.bookingId ?? req.body.bookingId;
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  try {
    const result = await bookingFinancialTerminationService.terminateBookingFinancially({
      bookingId,
      actorId: userId,
      actorType: BookingTerminationActorType.CUSTOMER,
      terminationType: BookingTerminationType.CUSTOMER_CANCELLED,
      reason: typeof req.body?.reason === "string" ? req.body.reason : undefined,
    });
    return res.status(200).json({ message: "Booking cancelled", ...result });
  } catch (error: any) {
    return res.status(error.statusCode ?? 400).json({ code: error.code, message: error.message });
  }
};
