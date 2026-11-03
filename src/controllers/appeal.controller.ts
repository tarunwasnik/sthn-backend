



//backend/src/controllers/appeal.controller.ts

import {Request, Response } from "express";
import mongoose from "mongoose";
import { Appeal } from "../models/appeal.model";
import { Dispute } from "../models/dispute.model";
import { Booking } from "../models/booking.model";

/**
 * Raise an appeal (USER / CREATOR)
 * POST /appeals/:disputeId
 * Body: { reason: string, evidence?: string[] }
 */
export const raiseAppeal = async (
  req: Request,
  res: Response
) => {
  const user = req.user;
  const { disputeId } = req.params;
  const { reason, evidence = [] } = req.body;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!mongoose.Types.ObjectId.isValid(disputeId)) {
    return res.status(400).json({ message: "Invalid disputeId" });
  }

  if (!reason || !reason.trim()) {
    return res.status(400).json({ message: "Reason is required" });
  }

  const dispute = await Dispute.findById(disputeId);
  if (!dispute) {
    return res.status(404).json({ message: "Dispute not found" });
  }

  // Only resolved/rejected disputes can be appealed
  if (!["RESOLVED", "REJECTED"].includes(dispute.status)) {
    return res.status(400).json({
      message: "Appeal allowed only after dispute is resolved or rejected",
    });
  }

  // Ensure no duplicate appeal exists
  const existing = await Appeal.findOne({ disputeId });
  if (existing) {
    return res.status(409).json({
      message: "An appeal has already been raised for this dispute",
    });
  }

  // Validate role & participation
  const booking = await Booking.findById(dispute.bookingId);
  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  const actorId = new mongoose.Types.ObjectId(user.id);

  const isUser = booking.userId.equals(actorId);
  const isCreator = booking.creatorId.equals(actorId);

  if (!isUser && !isCreator) {
    return res.status(403).json({ message: "Access denied" });
  }

  const appeal = await Appeal.create({
    disputeId,
    raisedBy: actorId,
    raisedByRole: isUser ? "USER" : "CREATOR",
    reason: reason.trim(),
    evidence,
    status: "OPEN",
  });

  res.status(201).json({
    message: "Appeal raised successfully",
    appeal,
  });
};

/** Participant-safe appeal status read. Admin decision notes remain private. */
export const getMyAppealForDispute = async (req: Request, res: Response) => {
  const user = req.user;
  const { disputeId } = req.params;
  if (!user) return res.status(401).json({ message: "Unauthorized" });
  if (!mongoose.Types.ObjectId.isValid(disputeId)) return res.status(400).json({ message: "Invalid disputeId" });

  const appeal = await Appeal.findOne({ disputeId }).lean();
  if (!appeal) return res.status(404).json({ message: "Appeal not found" });
  if (String(appeal.raisedBy) !== user.id) return res.status(403).json({ message: "Access denied" });

  const dispute = await Dispute.findById(appeal.disputeId).select("bookingId").lean();
  if (!dispute) return res.status(404).json({ message: "Linked dispute not found" });
  const booking = await Booking.findOne({ _id: dispute.bookingId, $or: [{ userId: user.id }, { creatorId: user.id }] }).select("_id").lean();
  if (!booking) return res.status(403).json({ message: "Access denied" });

  return res.status(200).json({
    appeal: {
      appealId: String(appeal._id),
      disputeId: String(appeal.disputeId),
      bookingId: String(dispute.bookingId),
      raisedByRole: appeal.raisedByRole,
      status: appeal.status,
      reason: appeal.reason,
      evidence: appeal.evidence ?? [],
      createdAt: appeal.createdAt,
      updatedAt: appeal.updatedAt,
      decision: appeal.decision ? { action: appeal.decision.action, decidedAt: appeal.decision.decidedAt } : null,
    },
  });
};
