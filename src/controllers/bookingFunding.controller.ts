import { Request, Response } from "express";

import { bookingFundingReadService } from "../services/booking/bookingFundingRead.service";

const safeError = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export const previewBookingFunding = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  try {
    const preview = await bookingFundingReadService.preview({
      authenticatedUserId: req.user.id,
      serviceId: String(req.body.serviceId ?? ""),
      slotIds: Array.isArray(req.body.slotIds) ? req.body.slotIds.map(String) : [],
    });
    return res.status(200).json({ preview });
  } catch (error) {
    return res.status(400).json({ message: safeError(error, "Could not preview booking funding.") });
  }
};

export const getBookingFunding = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  try {
    const funding = await bookingFundingReadService.getFunding({
      authenticatedUserId: req.user.id,
      bookingId: req.params.bookingId,
    });
    return res.status(200).json({ funding });
  } catch (error) {
    const message = safeError(error, "Could not read booking funding.");
    const status = message === "Booking not found" ? 404
      : message === "You are not allowed to view this booking funding." ? 403
        : 400;
    return res.status(status).json({ message });
  }
};
