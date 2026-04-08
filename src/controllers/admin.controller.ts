


//backend/src/controllers/admin.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import User from "../models/User";
import { CreatorProfile } from "../models/creatorProfile.model";
import { CREATOR_STATUS } from "../constants/creatorStatus";
import { ROLES } from "../constants/roles";
import { AppError } from "../utils/AppError";

import { Booking } from "../models/booking.model";
import { Slot } from "../models/slot.model";
import { Dispute } from "../models/dispute.model";
import { AuditLog } from "../models/auditLog.model";
import { Appeal } from "../models/appeal.model";

import { createAuditLog } from "../services/auditLog.service";
import { assertDisputeMutable } from "../services/disputeLock.service";

/* ==================== HELPERS ==================== */

const preventSelfAction = (adminId: string, targetUserId: string) =>
  adminId === targetUserId;

/* ==================== USER STATUS ==================== */

export const suspendUser = async (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const userId = req.params.id;

  if (preventSelfAction(adminId, userId)) {
    return res.status(400).json({ message: "Admin cannot suspend themselves" });
  }

  const before = (await User.findById(userId).lean()) ?? undefined;

  const user = await User.findByIdAndUpdate(
    userId,
    { status: "suspended" },
    { new: true }
  );

  if (!user) throw new AppError("User not found", 404);

  await createAuditLog({
    actorType: "ADMIN",
    actorId: new mongoose.Types.ObjectId(adminId),
    action: "USER_SUSPENDED",
    entityType: "USER",
    entityId: user._id,
    before,
    after: { status: user.status },
  });

  res.json({ message: "User suspended", status: user.status });
};

export const activateUser = async (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const userId = req.params.id;

  if (preventSelfAction(adminId, userId)) {
    return res.status(400).json({ message: "Admin cannot activate themselves" });
  }

  const before = (await User.findById(userId).lean()) ?? undefined;

  const user = await User.findByIdAndUpdate(
    userId,
    { status: "active" },
    { new: true }
  );

  if (!user) throw new AppError("User not found", 404);

  await createAuditLog({
    actorType: "ADMIN",
    actorId: new mongoose.Types.ObjectId(adminId),
    action: "USER_ACTIVATED",
    entityType: "USER",
    entityId: user._id,
    before,
    after: { status: user.status },
  });

  res.json({ message: "User activated", status: user.status });
};

export const banUser = async (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const userId = req.params.id;

  if (preventSelfAction(adminId, userId)) {
    return res.status(400).json({ message: "Admin cannot ban themselves" });
  }

  const before = (await User.findById(userId).lean()) ?? undefined;

  const user = await User.findByIdAndUpdate(
    userId,
    { status: "banned" },
    { new: true }
  );

  if (!user) throw new AppError("User not found", 404);

  await createAuditLog({
    actorType: "ADMIN",
    actorId: new mongoose.Types.ObjectId(adminId),
    action: "USER_BANNED",
    entityType: "USER",
    entityId: user._id,
    before,
    after: { status: user.status },
  });

  res.json({ message: "User banned", status: user.status });
};

/* ================= TRUST RESET ================= */

export const resetUserTrust = async (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const userId = req.params.id;

  if (preventSelfAction(adminId, userId)) {
    throw new AppError("Admin cannot reset own trust", 400);
  }

  const before = (await User.findById(userId).lean()) ?? undefined;

  const user = await User.findByIdAndUpdate(
    userId,
    {
      abuseScore: 0,
      userCooldownUntil: null,
      creatorCooldownUntil: null,
      status: "active",
    },
    { new: true }
  );

  if (!user) throw new AppError("User not found", 404);

  await createAuditLog({
    actorType: "ADMIN",
    actorId: new mongoose.Types.ObjectId(adminId),
    action: "USER_TRUST_RESET",
    entityType: "USER",
    entityId: user._id,
    before,
    after: {
      abuseScore: user.abuseScore,
      status: user.status,
    },
  });

  res.json({ message: "User trust reset successfully" });
};

/* ================= CREATOR MANUAL APPROVAL ================= */

export const approveCreator = async (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const { creatorProfileId } = req.params;

  const profile = await CreatorProfile.findById(creatorProfileId);
  if (!profile) throw new AppError("Creator profile not found", 404);

  const before = profile.toObject();

  profile.status = CREATOR_STATUS.ACTIVE;
  await profile.save();

  // 🔁 Sync identity state
  await User.findByIdAndUpdate(profile.userId, {
    role: ROLES.CREATOR,
    creatorStatus: "approved",
  });

  await createAuditLog({
    actorType: "ADMIN",
    actorId: new mongoose.Types.ObjectId(adminId),
    action: "CREATOR_APPROVED",
    entityType: "CREATOR_PROFILE",
    entityId: profile._id,
    before,
    after: { status: profile.status },
  });

  res.json({ message: "Creator approved successfully" });
};

export const rejectCreator = async (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const { creatorProfileId } = req.params;

  const profile = await CreatorProfile.findById(creatorProfileId);
  if (!profile) throw new AppError("Creator profile not found", 404);

  const before = profile.toObject();

  profile.status = CREATOR_STATUS.DEACTIVATED;
  await profile.save();

  // 🔁 Sync identity state
  await User.findByIdAndUpdate(profile.userId, {
    creatorStatus: "rejected",
  });

  await createAuditLog({
    actorType: "ADMIN",
    actorId: new mongoose.Types.ObjectId(adminId),
    action: "CREATOR_REJECTED",
    entityType: "CREATOR_PROFILE",
    entityId: profile._id,
    before,
    after: { status: profile.status },
  });

  res.json({ message: "Creator application rejected" });
};


/* ================= ADMIN BOOKING CONTROL ================= */

export const adminCancelBooking = async (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const { bookingId } = req.params;
  const { refund } = req.body;

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const booking = await Booking.findById(bookingId).session(session);
    if (!booking) throw new AppError("Booking not found", 404);

    const before = booking.toObject();

    booking.status = "CANCELLED";
    booking.paymentStatus = refund ? "REFUNDED" : "PAID";
    await booking.save({ session });

    await Slot.updateMany(
      { _id: { $in: booking.slotIds } },
      { status: "AVAILABLE" },
      { session }
    );

    await createAuditLog({
      actorType: "ADMIN",
      actorId: new mongoose.Types.ObjectId(adminId),
      action: "BOOKING_CANCELLED_BY_ADMIN",
      entityType: "BOOKING",
      entityId: booking._id,
      before,
      after: {
        status: booking.status,
        paymentStatus: booking.paymentStatus,
      },
    });

    await session.commitTransaction();
    res.json({ message: "Booking cancelled by admin" });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/* ================= DISPUTE RESOLUTION (LOCKED) ================= */

export const resolveDispute = async (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const { disputeId } = req.params;
  const { action, note } = req.body;

  if (!["REFUND_USER", "PAY_CREATOR", "NO_ACTION"].includes(action)) {
    throw new AppError("Invalid resolution action", 400);
  }

  await assertDisputeMutable(disputeId);

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const dispute = await Dispute.findById(disputeId).session(session);
    if (!dispute || dispute.status !== "OPEN") {
      throw new AppError("Dispute not found or already resolved", 404);
    }

    const before = dispute.toObject();

    const booking = await Booking.findById(dispute.bookingId).session(session);
    if (!booking) throw new AppError("Booking not found", 404);

    if (action === "REFUND_USER") booking.paymentStatus = "REFUNDED";
    if (action === "PAY_CREATOR") booking.paymentStatus = "PAID";

    dispute.status = action === "NO_ACTION" ? "REJECTED" : "RESOLVED";
    dispute.resolution = {
      action,
      note,
      resolvedBy: new mongoose.Types.ObjectId(adminId),
      resolvedAt: new Date(),
    };

    await booking.save({ session });
    await dispute.save({ session });

    await createAuditLog({
      actorType: "ADMIN",
      actorId: new mongoose.Types.ObjectId(adminId),
      action: "DISPUTE_RESOLVED",
      entityType: "DISPUTE",
      entityId: dispute._id,
      before,
      after: dispute.resolution,
    });

    await session.commitTransaction();
    res.json({ message: "Dispute resolved successfully" });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/* ================= ESCALATED DISPUTES ================= */

export const getEscalatedDisputes = async (req: Request, res: Response) => {
  const { level } = req.query;

  const query: any = {
    status: "OPEN",
    escalationLevel: { $ne: "NONE" },
  };

  if (level) query.escalationLevel = level;

  const disputes = await Dispute.find(query)
    .sort({ escalatedAt: -1 })
    .lean();

  res.json({ disputes });
};

/* ================= AUDIT LOG VIEW ================= */

export const getAuditLogs = async (req: Request, res: Response) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).lean();
  res.json({ logs });
};

/* ================= APPEAL DECISION ================= */

export const decideAppeal = async (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const { appealId } = req.params;
  const { action, note } = req.body;

  if (!["REVERSE_DECISION", "CONFIRM_DECISION"].includes(action)) {
    throw new AppError("Invalid appeal decision action", 400);
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const appeal = await Appeal.findById(appealId).session(session);
    if (!appeal || appeal.status !== "OPEN") {
      throw new AppError("Appeal not found or already decided", 404);
    }

    const dispute = await Dispute.findById(appeal.disputeId).session(session);
    if (!dispute) throw new AppError("Linked dispute not found", 404);

    const booking = await Booking.findById(dispute.bookingId).session(session);
    if (!booking) throw new AppError("Linked booking not found", 404);

    const beforeAppeal = appeal.toObject();
    const beforeDispute = dispute.toObject();

    if (action === "REVERSE_DECISION") {
      if (dispute.resolution?.action === "REFUND_USER") {
        booking.paymentStatus = "PAID";
      }
      if (dispute.resolution?.action === "PAY_CREATOR") {
        booking.paymentStatus = "REFUNDED";
      }
    }

    appeal.status = action === "REVERSE_DECISION" ? "UPHELD" : "REJECTED";
    appeal.decision = {
      action,
      note,
      decidedBy: new mongoose.Types.ObjectId(adminId),
      decidedAt: new Date(),
    };

    await booking.save({ session });
    await appeal.save({ session });

    await createAuditLog({
      actorType: "ADMIN",
      actorId: new mongoose.Types.ObjectId(adminId),
      action: "APPEAL_DECIDED",
      entityType: "APPEAL",
      entityId: appeal._id,
      before: beforeAppeal,
      after: appeal.decision,
    });

    await createAuditLog({
      actorType: "ADMIN",
      actorId: new mongoose.Types.ObjectId(adminId),
      action: "DISPUTE_APPEAL_OUTCOME_APPLIED",
      entityType: "DISPUTE",
      entityId: dispute._id,
      before: beforeDispute,
      after: { paymentStatus: booking.paymentStatus },
    });

    await session.commitTransaction();
    res.json({ message: "Appeal decided successfully" });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};