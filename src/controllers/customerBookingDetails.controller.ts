import { Request, Response } from "express";

import {
  CustomerBookingReadError,
  customerBookingReadService,
} from "../services/booking/customerBookingRead.service";

export const getCustomerBookingDetails = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  try {
    const booking = await customerBookingReadService.getById({
      bookingId: req.params.bookingId,
      customerId: req.user.id,
    });
    return res.status(200).json({ booking });
  } catch (error) {
    if (error instanceof CustomerBookingReadError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return res.status(500).json({ message: "Failed to fetch booking" });
  }
};
