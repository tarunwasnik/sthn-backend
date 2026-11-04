import { Request, Response } from "express";
import mongoose from "mongoose";

import { Appeal } from "../models/appeal.model";
import { Booking } from "../models/booking.model";
import { Dispute } from "../models/dispute.model";
import { AppError } from "../utils/AppError";

const pageValue = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

type AppealView = { _id: mongoose.Types.ObjectId; disputeId: mongoose.Types.ObjectId; raisedByRole: "USER" | "CREATOR"; status: "OPEN" | "UPHELD" | "REJECTED"; reason: string; evidence?: string[]; createdAt: Date; updatedAt: Date; decision?: { action: "REVERSE_DECISION" | "CONFIRM_DECISION"; note?: string; decidedAt: Date } };
type DisputeView = { _id: mongoose.Types.ObjectId; bookingId: mongoose.Types.ObjectId; status: string; reason: string; raisedByRole: string; resolution?: { action: string; note?: string; resolvedAt: Date } };
type BookingView = { _id: mongoose.Types.ObjectId; bookingReference?: string; serviceTitle?: string; status?: string; createdAt?: Date; completedAt?: Date; terminatedAt?: Date };

const serializeAppeal = (appeal: AppealView, dispute: DisputeView | undefined | null, booking: BookingView | undefined | null) => ({
  appealId: String(appeal._id),
  disputeId: String(appeal.disputeId),
  bookingId: dispute ? String(dispute.bookingId) : null,
  bookingReference: booking?.bookingReference ?? null,
  serviceTitle: booking?.serviceTitle ?? null,
  raisedByRole: appeal.raisedByRole,
  status: appeal.status,
  reason: appeal.reason,
  evidence: appeal.evidence ?? [],
  createdAt: appeal.createdAt,
  updatedAt: appeal.updatedAt,
  decision: appeal.decision
    ? { action: appeal.decision.action, note: appeal.decision.note ?? null, decidedAt: appeal.decision.decidedAt }
    : null,
  dispute: dispute
    ? {
        status: dispute.status,
        reason: dispute.reason,
        raisedByRole: dispute.raisedByRole,
        resolution: dispute.resolution
          ? { action: dispute.resolution.action, note: dispute.resolution.note ?? null, resolvedAt: dispute.resolution.resolvedAt }
          : null,
      }
    : null,
});

export const listAdminAppeals = async (req: Request, res: Response) => {
  const page = pageValue(req.query.page, 1);
  const limit = Math.min(pageValue(req.query.limit, 20), 100);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  if (status && !["OPEN", "UPHELD", "REJECTED"].includes(status)) throw new AppError("Invalid appeal status", 400);
  const filter = status ? { status } : {};
  const [appeals, total] = await Promise.all([
    Appeal.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Appeal.countDocuments(filter),
  ]);
  const appealViews = appeals as unknown as AppealView[];
  const disputes = await Dispute.find({ _id: { $in: appealViews.map((appeal) => appeal.disputeId) } }).select("bookingId status reason raisedByRole resolution").lean() as unknown as DisputeView[];
  const disputeMap = new Map(disputes.map((dispute) => [String(dispute._id), dispute]));
  const bookings = await Booking.find({ _id: { $in: disputes.map((dispute) => dispute.bookingId) } }).select("bookingReference serviceTitle").lean() as unknown as BookingView[];
  const bookingMap = new Map(bookings.map((booking) => [String(booking._id), booking]));
  res.json({ appeals: appealViews.map((appeal) => { const dispute = disputeMap.get(String(appeal.disputeId)); return serializeAppeal(appeal, dispute, dispute ? bookingMap.get(String(dispute.bookingId)) : null); }), pagination: { page, limit, total } });
};

export const getAdminAppeal = async (req: Request, res: Response) => {
  const { appealId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(appealId)) throw new AppError("Invalid appealId", 400);
  const appeal = await Appeal.findById(appealId).lean() as unknown as AppealView | null;
  if (!appeal) throw new AppError("Appeal not found", 404);
  const dispute = await Dispute.findById(appeal.disputeId).select("bookingId status reason raisedByRole resolution").lean() as unknown as DisputeView | null;
  if (!dispute) throw new AppError("Linked dispute not found", 404);
  const booking = await Booking.findById(dispute.bookingId).select("bookingReference serviceTitle status createdAt completedAt terminatedAt").lean() as unknown as BookingView | null;
  if (!booking) throw new AppError("Linked booking not found", 404);
  res.json({ appeal: serializeAppeal(appeal, dispute, booking), booking: { bookingReference: booking.bookingReference ?? null, serviceTitle: booking.serviceTitle, status: booking.status, createdAt: booking.createdAt, completedAt: booking.completedAt ?? null, terminatedAt: booking.terminatedAt ?? null } });
};
