import { NextFunction, Request, Response } from "express";

import { adminBookingEscrowService } from "../services/financial/adminBookingEscrow.service";

class AdminBookingEscrowRequestError extends Error {
  readonly statusCode = 400;
}

const readReason = (body: unknown): string | undefined => {
  if (body === undefined || body === null) return undefined;
  if (typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "reason")) throw new AdminBookingEscrowRequestError("Invalid manual settlement release request.");
  const reason = (body as { reason?: unknown }).reason;
  if (reason === undefined) return undefined;
  if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 240) throw new AdminBookingEscrowRequestError("Manual settlement release reason is invalid.");
  return reason.trim();
};

export class AdminBookingEscrowController {
  async list(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await adminBookingEscrowService.list({ state: req.query.state }) }); } catch (error) { next(error); } }
  async get(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await adminBookingEscrowService.get(req.params.bookingReference) }); } catch (error) { next(error); } }
  async release(req: Request, res: Response, next: NextFunction) { try { if (!req.user) return void res.status(401).json({ success: false, message: "Unauthorized" }); const reason = readReason(req.body); res.json({ success: true, data: await adminBookingEscrowService.release({ bookingReference: req.params.bookingReference, adminUserId: req.user.id, reason }) }); } catch (error) { next(error); } }
}

export const adminBookingEscrowController = new AdminBookingEscrowController();
