import { NextFunction, Request, Response } from "express";
import { CreatorApplication } from "../models/creatorApplication.model";

/** A submitted direct applicant is not yet eligible for customer booking. */
export const restrictPendingDirectCreatorBooking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (user?.role === "user" && user.status === "pending_profile") {
      const submitted = await CreatorApplication.exists({ userId: user.id, applicationJourney: "direct_creator", status: "submitted" });
      if (submitted) return res.status(403).json({ message: "Booking is available after your Creator application is approved." });
    }
    return next();
  } catch (error) {
    return next(error);
  }
};
