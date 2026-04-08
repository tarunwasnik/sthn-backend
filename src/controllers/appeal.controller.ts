



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