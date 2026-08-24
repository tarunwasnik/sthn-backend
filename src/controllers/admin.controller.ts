


//backend/src/controllers/admin.controller.ts

import { Request, Response } from "express";
import { BookingTerminationActorType, BookingTerminationType } from "../enums/booking/bookingTerminationType.enum";
import { bookingFinancialTerminationService } from "../services/financial/bookingFinancialTermination.service";
import mongoose from "mongoose";
import User from "../models/User";
import { CreatorProfile } from "../models/creatorProfile.model";
import { CREATOR_STATUS } from "../constants/creatorStatus";
import { ROLES } from "../constants/roles";
import { AppError } from "../utils/AppError";

import { Booking } from "../models/booking.model";
import { Slot } from "../models/slot.model";
import { Dispute } from "../models/dispute.model";
import { Appeal } from "../models/appeal.model";

import { createAuditLog, queryAuditLogs } from "../services/auditLog.service";
import { assertDisputeMutable } from "../services/disputeLock.service";
import { triggerSuspensionLifecycle } from "../services/accountGovernance/suspensionLifecycle.service";
import { removeSuspensionLifecycle } from "../services/accountGovernance/unsuspendLifecycle.service";
import { triggerBanLifecycle } from "../services/accountGovernance/banLifecycle.service";
import { resetAccountTrust } from "../services/accountGovernance/cooldownLifecycle.service";
import { toUserTrustAuditSnapshot } from "../dtos/admin/userTrustAuditSnapshot.dto";

/* ==================== HELPERS ==================== */

const preventSelfAction = (adminId: string, targetUserId: string) =>
  adminId === targetUserId;

const requiredGovernanceReason = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError("A governance reason is required", 400);
  }
  return value.trim();
};

/* ==================== USER STATUS ==================== */

export const suspendUser = async (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const userId = req.params.id;

  if (preventSelfAction(adminId, userId)) {
    return res.status(400).json({ message: "Admin cannot suspend themselves" });
  }

  const result = await triggerSuspensionLifecycle({
    adminId,
    userId,
    reason: requiredGovernanceReason(req.body?.reason),
  });

  await createAuditLog({
    actorType: "ADMIN",
    actorId: new mongoose.Types.ObjectId(adminId),
    action: "USER_SUSPENDED",
    entityType: "USER",
    entityId: result.userId,
    before: { governanceState: result.previousGovernanceState },
    after: {
      governanceState: result.governanceState,
      status: result.status,
      reason: result.reason,
      triggeredAt: result.triggeredAt,
      consequences: {
        terminatedCount: result.consequences.terminatedCount,
        protectedCount: result.consequences.protectedCount,
        disputeLockedCount: result.consequences.disputeLockedCount,
        financialLockedCount: result.consequences.financialLockedCount,
        failedCount: result.consequences.failedCount,
      },
    },
  });

  res.json({ message: "User suspended", ...result });
};

export const activateUser = async (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const userId = req.params.id;

  if (preventSelfAction(adminId, userId)) {
    return res.status(400).json({ message: "Admin cannot activate themselves" });
  }

  const result = await removeSuspensionLifecycle({
    adminId,
    userId,
    reason: requiredGovernanceReason(req.body?.reason),
  });

  await createAuditLog({
    actorType: "ADMIN",
    actorId: new mongoose.Types.ObjectId(adminId),
    action: "USER_ACTIVATED",
    entityType: "USER",
    entityId: result.userId,
    before: { governanceState: result.previousGovernanceState },
    after: {
      governanceState: result.governanceState,
      status: "active",
      effectiveCondition: result.effectiveCondition,
    },
  });

  res.json({ message: "User activated", ...result, status: "active" });
};

export const banUser = async (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const userId = req.params.id;

  if (preventSelfAction(adminId, userId)) {
    return res.status(400).json({ message: "Admin cannot ban themselves" });
  }

  const result = await triggerBanLifecycle({
    adminId,
    userId,
    reason: requiredGovernanceReason(req.body?.reason),
  });

  await createAuditLog({
    actorType: "ADMIN",
    actorId: new mongoose.Types.ObjectId(adminId),
    action: "USER_BANNED",
    entityType: "USER",
    entityId: result.userId,
    before: { governanceState: result.previousGovernanceState },
    after: {
      governanceState: result.governanceState,
      status: result.status,
      reason: result.reason,
      triggeredAt: result.triggeredAt,
      consequences: {
        terminatedCount: result.consequences.terminatedCount,
        protectedCount: result.consequences.protectedCount,
        disputeLockedCount: result.consequences.disputeLockedCount,
        financialLockedCount: result.consequences.financialLockedCount,
        failedCount: result.consequences.failedCount,
      },
    },
  });

  res.json({ message: "User banned", ...result });
};

/* ================= TRUST RESET ================= */

export const resetUserTrust = async (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const userId = req.params.id;

  if (preventSelfAction(adminId, userId)) {
    throw new AppError("Admin cannot reset own trust", 400);
  }

  const beforeUser = await User.findById(userId)
    .select("abuseScore status governanceState userCooldownUntil creatorCooldownUntil")
    .lean();

  if (!beforeUser) {
    throw new AppError("User not found", 404);
  }

  const user = await resetAccountTrust(userId);

  await createAuditLog({
    actorType: "ADMIN",
    actorId: new mongoose.Types.ObjectId(adminId),
    action: "USER_TRUST_RESET",
    entityType: "USER",
    entityId: user._id,
    before: toUserTrustAuditSnapshot(beforeUser),
    after: toUserTrustAuditSnapshot(user),
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

  const result = await bookingFinancialTerminationService.terminateBookingFinancially({
    bookingId,
    actorId: adminId,
    actorType: BookingTerminationActorType.ADMIN,
    terminationType: BookingTerminationType.ADMIN_CANCELLED,
    reason: typeof req.body.reason === "string" ? req.body.reason : undefined,
  });

  return res.json({ message: "Booking cancelled by admin", ...result });
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

    if (action !== "NO_ACTION") {
      throw new AppError("Dispute financial outcomes are deferred to the Financial termination and refund-accounting phases", 409);
    }

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
  const result = await queryAuditLogs(req.query);
  res.json({
    logs: result.logs.map((log) => ({
      auditReference: log._id.toString(), category: log.category, action: log.action, entityType: log.entityType, entityId: log.entityId.toString(),
      actor: { type: log.actorType, id: log.actorId?.toString(), reference: log.actorReference },
      financialContext: log.financialContext, transition: log.transition,
      metadata: log.metadata, createdAt: log.createdAt,
    })),
    pagination: result.pagination,
  });
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

    if (action === "REVERSE_DECISION" && dispute.resolution?.action !== "NO_ACTION") {
      throw new AppError("Financial dispute reversal is deferred to later Financial Domain phases", 409);
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
