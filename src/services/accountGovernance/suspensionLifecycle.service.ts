//backend/src/services/accountGovernance/suspensionLifecycle.service.ts

import mongoose from "mongoose";

import User from "../../models/User";
import {
  ACCOUNT_GOVERNANCE_STATE,
} from "../../constants/accountGovernance";

import { resolveAccountGovernance } from "./accountGovernanceResolver.service";
import { orchestrateGovernanceBookingConsequences } from "./governanceBookingOrchestration.service";

/* =========================================================
   TYPES
========================================================= */

type TriggerSuspensionInput = {
  adminId: string;
  userId: string;
  reason: string;
  now?: Date;
};

/* =========================================================
   TRIGGER SUSPENSION
========================================================= */

export const triggerSuspensionLifecycle = async ({
  adminId,
  userId,
  reason,
  now: inputNow = new Date(),
}: TriggerSuspensionInput) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid target user id");
  }

  if (!mongoose.Types.ObjectId.isValid(adminId)) {
    throw new Error("Invalid admin id");
  }

  if (!reason || typeof reason !== "string" || !reason.trim()) {
    throw new Error("Suspension reason is required");
  }

  if (adminId === userId) {
    throw new Error("Admin cannot suspend themselves");
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const user = await User.findById(userId).session(session);

    if (!user) {
      throw new Error("User not found");
    }

    const governance = resolveAccountGovernance(user);

    if (
      governance.condition === "BANNED" ||
      governance.condition === "PENDING_BAN"
    ) {
      throw new Error("Suspension cannot override an active ban lifecycle");
    }

    const isReplay = governance.condition === "SUSPENDED" ||
      governance.condition === "PENDING_SUSPENSION";

    const previousGovernanceState = user.governanceState;
    const triggeredAt = user.governanceTriggeredAt ?? new Date();

    /*
     * G1 establishes canonical account authority only.  Booking classification
     * and Wallet-compatible termination are deferred until their financial
     * release contract exists; this transition must not pretend to process them.
     */
    if (!isReplay) {
      user.governanceState = ACCOUNT_GOVERNANCE_STATE.SUSPENDED;
      user.governanceTriggeredAt = triggeredAt;
      user.governanceReason = reason.trim();
      user.governanceTriggeredBy = new mongoose.Types.ObjectId(adminId);
      user.suspensionProtectedUntil = null;
    }

    /*
     * Legacy status remains synchronized temporarily.
     *
     * Legacy status remains a compatibility projection while governanceState
     * is the decision authority.
     */
    user.status = "suspended";

    await user.save({ session });

    await session.commitTransaction();

    const consequences = await orchestrateGovernanceBookingConsequences({
      governedUserId: userId,
      adminId,
      reason: user.governanceReason ?? reason.trim(),
      now: inputNow,
    });

    return {
      userId: user._id,
      previousGovernanceState,
      governanceState: user.governanceState,
      triggeredAt,
      status: user.status,
      reason: user.governanceReason,
      bookingsMutated: consequences.terminatedCount > 0,
      consequences,
      replay: isReplay,
    };
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    throw error;
  } finally {
    await session.endSession();
  }
};
