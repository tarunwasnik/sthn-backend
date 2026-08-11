//backend/src/services/accountGovernance/suspensionFinalizer.service.ts

import mongoose from "mongoose";

import User from "../../models/User";
import { Booking } from "../../models/booking.model";

import { ACCOUNT_GOVERNANCE_STATE } from "../../constants/accountGovernance";

/* =========================================================
   TYPES
========================================================= */

type FinalizeSuspensionInput = {
  userId: string;
};

/* =========================================================
   FINALIZE PENDING SUSPENSION
========================================================= */

export const finalizePendingSuspension = async ({
  userId,
}: FinalizeSuspensionInput) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid target user id");
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const user = await User.findById(userId).session(session);

    if (!user) {
      throw new Error("User not found");
    }

    if (user.governanceState !== ACCOUNT_GOVERNANCE_STATE.PENDING_SUSPENSION) {
      await session.commitTransaction();

      return {
        finalized: false,
        reason: "Account is not pending suspension",
        governanceState: user.governanceState,
      };
    }

    /*
     * Protected suspension bookings are the CONFIRMED bookings
     * that survived suspension-trigger processing.
     *
     * If any CONFIRMED booking still exists in either direction,
     * suspension must remain pending.
     */
    const protectedBooking = await Booking.findOne({
      $or: [{ userId }, { creatorId: userId }],
      status: "CONFIRMED",
    })
      .select("_id")
      .session(session);

    if (protectedBooking) {
      await session.commitTransaction();

      return {
        finalized: false,
        reason: "Protected booking obligations still exist",
        governanceState: user.governanceState,
        blockingBookingId: protectedBooking._id,
      };
    }

    /*
     * No protected CONFIRMED booking remains.
     *
     * Final suspension now becomes authoritative.
     */
    user.governanceState = ACCOUNT_GOVERNANCE_STATE.SUSPENDED;

    user.status = "suspended";

    user.suspensionProtectedUntil = null;

    await user.save({ session });

    await session.commitTransaction();

    return {
      finalized: true,
      governanceState: user.governanceState,
      suspendedAt: new Date(),
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
