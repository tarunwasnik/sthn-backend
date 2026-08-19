import mongoose from "mongoose";

import User from "../../models/User";
import { ACCOUNT_GOVERNANCE_STATE } from "../../constants/accountGovernance";
import { orchestrateGovernanceBookingConsequences } from "./governanceBookingOrchestration.service";

type TriggerBanInput = {
  adminId: string;
  userId: string;
  reason: string;
  now?: Date;
};

/**
 * G1 account-state transition only. Booking consequences are deliberately
 * deferred until governance termination is Wallet-compatible.
 */
export const triggerBanLifecycle = async ({
  adminId,
  userId,
  reason,
  now: inputNow = new Date(),
}: TriggerBanInput) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) throw new Error("Invalid target user id");
  if (!mongoose.Types.ObjectId.isValid(adminId)) throw new Error("Invalid admin id");
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    throw new Error("Ban reason is required");
  }
  if (adminId === userId) throw new Error("Admin cannot ban themselves");

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const user = await User.findById(userId).session(session);
    if (!user) throw new Error("User not found");

    const previousGovernanceState = user.governanceState;
    const isReplay = previousGovernanceState === ACCOUNT_GOVERNANCE_STATE.BANNED;
    if (isReplay) {
      await session.commitTransaction();
    }

    const triggeredAt = user.governanceTriggeredAt ?? inputNow;
    if (!isReplay) {
      user.governanceState = ACCOUNT_GOVERNANCE_STATE.BANNED;
      user.governanceTriggeredAt = triggeredAt;
      user.governanceReason = reason.trim();
      user.governanceTriggeredBy = new mongoose.Types.ObjectId(adminId);
      user.suspensionProtectedUntil = null;
      user.status = "banned";
      await user.save({ session });
      await session.commitTransaction();
    }

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
      status: user.status,
      reason: user.governanceReason,
      triggeredAt,
      replay: isReplay,
      bookingsMutated: consequences.terminatedCount > 0,
      consequences,
    };
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};
