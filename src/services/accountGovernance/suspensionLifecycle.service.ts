//backend/src/services/accountGovernance/suspensionLifecycle.service.ts

import mongoose from "mongoose";

import User from "../../models/User";
import { Booking } from "../../models/booking.model";
import { Slot } from "../../models/slot.model";

import {
  ACCOUNT_GOVERNANCE_STATE,
  SUSPENSION_BOOKING_PROTECTION_HOURS,
} from "../../constants/accountGovernance";

import { resolveAccountGovernance } from "./accountGovernanceResolver.service";
import { BookingTerminationActorType, BookingTerminationType } from "../../enums/booking/bookingTerminationType.enum";
import { bookingFinancialTerminationService } from "../financial/bookingFinancialTermination.service";

/* =========================================================
   TYPES
========================================================= */

type TriggerSuspensionInput = {
  adminId: string;
  userId: string;
  reason: string;
};

type ProtectedBookingResult = {
  protectedBookingIds: mongoose.Types.ObjectId[];
  processedBookingIds: mongoose.Types.ObjectId[];
};

/* =========================================================
   HELPERS
========================================================= */

const addHours = (date: Date, hours: number): Date => {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
};

/* =========================================================
   PROCESS BOOKINGS FOR SUSPENSION
========================================================= */

const processSuspensionBookings = async (
  userId: string,
  triggeredAt: Date,
  protectedUntil: Date,
  session: mongoose.ClientSession,
): Promise<ProtectedBookingResult> => {
  const bookings = await Booking.find({
    $or: [{ userId }, { creatorId: userId }],
    status: {
      $in: ["REQUESTED", "CONFIRMED"],
    },
  }).session(session);

  const protectedBookingIds: mongoose.Types.ObjectId[] = [];
  const processedBookingIds: mongoose.Types.ObjectId[] = [];

  for (const booking of bookings) {
    /* =====================================================
       REQUESTED BOOKINGS
    ===================================================== */

    if (booking.status === "REQUESTED") {
      processedBookingIds.push(booking._id);
      continue;
    }

    /* =====================================================
       CONFIRMED BOOKINGS
    ===================================================== */

    if (booking.status === "CONFIRMED") {
      const slots = await Slot.find({
        _id: {
          $in: booking.slotIds,
        },
      })
        .sort({ startTime: 1 })
        .session(session);

      const firstSlot = slots[0];

      if (!firstSlot) {
        throw new Error(
          `Confirmed booking ${booking._id.toString()} has no slots`,
        );
      }

      const bookingStartTime = new Date(firstSlot.startTime);

      const isAlreadyStarted =
        bookingStartTime.getTime() <= triggeredAt.getTime();

      const startsInsideProtectionWindow =
        bookingStartTime.getTime() > triggeredAt.getTime() &&
        bookingStartTime.getTime() <= protectedUntil.getTime();

      if (isAlreadyStarted || startsInsideProtectionWindow) {
        protectedBookingIds.push(booking._id);

        continue;
      }

      processedBookingIds.push(booking._id);
      continue;
    }
  }

  return {
    protectedBookingIds,
    processedBookingIds,
  };
};

/* =========================================================
   TRIGGER SUSPENSION
========================================================= */

export const triggerSuspensionLifecycle = async ({
  adminId,
  userId,
  reason,
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

    if (
      governance.condition === "SUSPENDED" ||
      governance.condition === "PENDING_SUSPENSION"
    ) {
      throw new Error(
        "Suspension lifecycle is already active for this account",
      );
    }

    const triggeredAt = new Date();

    const protectedUntil = addHours(
      triggeredAt,
      SUSPENSION_BOOKING_PROTECTION_HOURS,
    );

    const { protectedBookingIds, processedBookingIds } =
      await processSuspensionBookings(
        userId,
        triggeredAt,
        protectedUntil,
        session,
      );

    const hasProtectedBookings = protectedBookingIds.length > 0;

    user.governanceState = hasProtectedBookings
      ? ACCOUNT_GOVERNANCE_STATE.PENDING_SUSPENSION
      : ACCOUNT_GOVERNANCE_STATE.SUSPENDED;

    user.governanceTriggeredAt = triggeredAt;
    user.governanceReason = reason.trim();
    user.governanceTriggeredBy = new mongoose.Types.ObjectId(adminId);

    user.suspensionProtectedUntil = hasProtectedBookings
      ? protectedUntil
      : null;

    /*
     * Legacy status remains synchronized temporarily.
     *
     * PENDING_SUSPENSION must remain "active" because the account
     * still has full dashboard access while protected bookings
     * are being resolved.
     *
     * Final SUSPENDED keeps the legacy field synchronized until
     * all old status consumers are migrated to governanceState.
     */
    user.status = hasProtectedBookings ? "active" : "suspended";

    await user.save({ session });

    await session.commitTransaction();

    for (const bookingId of processedBookingIds) {
      await bookingFinancialTerminationService.terminateBookingFinancially({
        bookingId: bookingId.toString(),
        actorType: BookingTerminationActorType.GOVERNANCE,
        actorId: adminId,
        terminationType: BookingTerminationType.GOVERNANCE_TERMINATED,
        reason: reason.trim(),
      });
    }

    return {
      userId: user._id,

      governanceState: user.governanceState,

      triggeredAt,
      protectedUntil: user.suspensionProtectedUntil,

      protectedBookingIds,
      processedBookingIds,

      reason: user.governanceReason,
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
