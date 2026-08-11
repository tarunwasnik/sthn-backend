//backend/src/services/accountGovernance/unsuspendLifecycle.service.ts

import mongoose from "mongoose";

import User from "../../models/User";

import { ACCOUNT_GOVERNANCE_STATE } from "../../constants/accountGovernance";
import { resolveAccountGovernance } from "./accountGovernanceResolver.service";

/* =========================================================
   TYPES
========================================================= */

type RemoveSuspensionInput = {
  adminId: string;
  userId: string;
  reason: string;
};

/* =========================================================
   REMOVE SUSPENSION
========================================================= */

export const removeSuspensionLifecycle = async ({
  adminId,
  userId,
  reason,
}: RemoveSuspensionInput) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid target user id");
  }

  if (!mongoose.Types.ObjectId.isValid(adminId)) {
    throw new Error("Invalid admin id");
  }

  if (!reason || typeof reason !== "string" || !reason.trim()) {
    throw new Error("Unsuspension reason is required");
  }

  if (adminId === userId) {
    throw new Error("Admin cannot unsuspend themselves");
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const user = await User.findById(userId).session(session);

    if (!user) {
      throw new Error("User not found");
    }

    /* =======================================================
       HIGHER AUTHORITY GUARD
    ======================================================= */

    if (
      user.governanceState === ACCOUNT_GOVERNANCE_STATE.BANNED ||
      user.governanceState === ACCOUNT_GOVERNANCE_STATE.PENDING_BAN
    ) {
      throw new Error(
        "Suspension cannot be removed while a higher ban lifecycle is active",
      );
    }

    /* =======================================================
       SUSPENSION STATE GUARD
    ======================================================= */

    if (
      user.governanceState !== ACCOUNT_GOVERNANCE_STATE.SUSPENDED &&
      user.governanceState !== ACCOUNT_GOVERNANCE_STATE.PENDING_SUSPENSION
    ) {
      throw new Error("Account does not have an active suspension lifecycle");
    }

    const previousGovernanceState = user.governanceState;

    /* =======================================================
       REMOVE ONLY SUSPENSION AUTHORITY
    ======================================================= */

    user.governanceState = ACCOUNT_GOVERNANCE_STATE.ACTIVE;

    user.governanceTriggeredAt = null;
    user.governanceReason = null;
    user.governanceTriggeredBy = null;

    user.suspensionProtectedUntil = null;

    /*
     * Legacy status synchronization.
     *
     * Cooldowns remain untouched.
     * The governance resolver will expose COOLDOWN if either
     * cooldown timestamp is still active.
     */
    user.status = "active";

    await user.save({ session });

    /*
     * Resolve the state after suspension authority is removed.
     */
    const resolvedGovernance = resolveAccountGovernance(user);

    await session.commitTransaction();

    return {
      userId: user._id,

      previousGovernanceState,

      governanceState: user.governanceState,

      effectiveCondition: resolvedGovernance.condition,

      cooldownActive: resolvedGovernance.isCooldownActive,

      userCooldownActive: resolvedGovernance.isUserCooldownActive,

      creatorCooldownActive: resolvedGovernance.isCreatorCooldownActive,

      cooldownUntil: resolvedGovernance.cooldownUntil,

      reason: reason.trim(),
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
