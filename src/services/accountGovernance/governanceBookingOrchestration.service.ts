import mongoose from "mongoose";

import { Booking, IBooking } from "../../models/booking.model";
import { BookingFundReservation } from "../../models/bookingFundReservation.model";
import { Dispute } from "../../models/dispute.model";
import { Payment } from "../../models/payment.model";
import { Slot } from "../../models/slot.model";
import {
  BookingTerminationActorType,
  BookingTerminationType,
} from "../../enums/booking/bookingTerminationType.enum";
import { BookingFundReservationStatus } from "../../enums/financial/bookingFundReservationStatus.enum";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { bookingFinancialTerminationService } from "../financial/bookingFinancialTermination.service";

export type GovernanceBookingOutcome =
  | "TERMINATE"
  | "PROTECTED"
  | "DISPUTE_LOCKED"
  | "FINANCIAL_LOCKED"
  | "NO_ACTION";

export interface GovernanceBookingConsequenceSummary {
  totalRelevantBookings: number;
  terminatedCount: number;
  protectedCount: number;
  disputeLockedCount: number;
  financialLockedCount: number;
  noActionCount: number;
  failedCount: number;
  bookingReferences: Partial<Record<GovernanceBookingOutcome | "FAILED", string[]>>;
}

const PROTECTION_WINDOW_MS = 24 * 60 * 60 * 1_000;

const referenceFor = (booking: IBooking): string =>
  booking.bookingReference ?? booking._id.toString();

const emptySummary = (): GovernanceBookingConsequenceSummary => ({
  totalRelevantBookings: 0,
  terminatedCount: 0,
  protectedCount: 0,
  disputeLockedCount: 0,
  financialLockedCount: 0,
  noActionCount: 0,
  failedCount: 0,
  bookingReferences: {},
});

const record = (
  summary: GovernanceBookingConsequenceSummary,
  outcome: GovernanceBookingOutcome | "FAILED",
  reference: string,
) => {
  const countKeys: Record<GovernanceBookingOutcome | "FAILED", keyof GovernanceBookingConsequenceSummary> = {
    TERMINATE: "terminatedCount",
    PROTECTED: "protectedCount",
    DISPUTE_LOCKED: "disputeLockedCount",
    FINANCIAL_LOCKED: "financialLockedCount",
    NO_ACTION: "noActionCount",
    FAILED: "failedCount",
  };
  const key = countKeys[outcome];
  if (key in summary && typeof summary[key] === "number") {
    (summary[key] as number) += 1;
  }
  (summary.bookingReferences[outcome] ??= []).push(reference);
};

const isWalletFinanciallyReleasable = async (booking: IBooking): Promise<boolean> => {
  if (booking.isFinancialLocked || booking.settlementId) return false;
  if (!booking.paymentId || booking.paymentMethod !== PaymentMethod.WALLET) return true;
  const [payment, reservation] = await Promise.all([
    Payment.findById(booking.paymentId).select("method status settlementId").lean(),
    BookingFundReservation.findOne({ bookingId: booking._id }).select("status").lean(),
  ]);
  return payment?.method === PaymentMethod.WALLET &&
    payment.status === PaymentStatus.AUTHORIZED &&
    !payment.settlementId &&
    reservation?.status === BookingFundReservationStatus.ACTIVE;
};

export const classifyGovernanceBooking = async (
  booking: IBooking,
  now: Date = new Date(),
): Promise<GovernanceBookingOutcome> => {
  if (booking.status !== "REQUESTED" && booking.status !== "CONFIRMED") return "NO_ACTION";
  if (await Dispute.exists({ bookingId: booking._id, status: "OPEN" })) return "DISPUTE_LOCKED";

  if (booking.status === "REQUESTED") {
    return (await isWalletFinanciallyReleasable(booking)) ? "TERMINATE" : "FINANCIAL_LOCKED";
  }

  const slots = await Slot.find({ _id: { $in: booking.slotIds } })
    .select("startTime endTime")
    .sort({ startTime: 1 })
    .lean();
  if (slots.length !== booking.slotIds.length) return "FINANCIAL_LOCKED";
  const firstStart = slots[0].startTime.getTime();
  const lastEnd = slots.reduce((latest, slot) => Math.max(latest, slot.endTime.getTime()), 0);
  const nowMs = now.getTime();

  if (firstStart <= nowMs && lastEnd > nowMs) return "PROTECTED";
  if (firstStart > nowMs && firstStart - nowMs <= PROTECTION_WINDOW_MS) return "PROTECTED";
  if (firstStart <= nowMs) return "FINANCIAL_LOCKED";
  return (await isWalletFinanciallyReleasable(booking)) ? "TERMINATE" : "FINANCIAL_LOCKED";
};

/**
 * Read/classify/execute boundary for G3. Each eligible termination delegates
 * to the G2 financial authority and therefore owns its own transaction/replay.
 */
export const orchestrateGovernanceBookingConsequences = async (input: {
  governedUserId: string;
  adminId: string;
  reason: string;
  now?: Date;
}): Promise<GovernanceBookingConsequenceSummary> => {
  if (!mongoose.Types.ObjectId.isValid(input.governedUserId)) throw new Error("Invalid governed user id");
  const bookings = await Booking.find({
    $or: [{ userId: input.governedUserId }, { creatorId: input.governedUserId }],
    status: { $in: ["REQUESTED", "CONFIRMED"] },
  }).sort({ _id: 1 });
  const summary = emptySummary();
  summary.totalRelevantBookings = bookings.length;

  for (const booking of bookings) {
    const reference = referenceFor(booking);
    try {
      const outcome = await classifyGovernanceBooking(booking, input.now);
      if (outcome !== "TERMINATE") {
        record(summary, outcome, reference);
        continue;
      }
      await bookingFinancialTerminationService.terminateBookingFinancially({
        bookingId: booking._id.toString(),
        actorId: input.adminId,
        actorType: BookingTerminationActorType.GOVERNANCE,
        terminationType: BookingTerminationType.GOVERNANCE_TERMINATED,
        reason: input.reason,
      });
      record(summary, "TERMINATE", reference);
    } catch {
      // G2 remains the invariant authority. A corrupt/unexpected graph is
      // surfaced operationally without preventing independent bookings.
      record(summary, "FAILED", reference);
    }
  }
  return summary;
};
