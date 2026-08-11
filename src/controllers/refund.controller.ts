//backend/src/controllers/refund.controller.ts

import { Request,Response } from "express";
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

  return res.status(409).json({ message: "Legacy refund endpoint is disabled; refunds must be initiated by Financial termination or a later dispute workflow." });
};
