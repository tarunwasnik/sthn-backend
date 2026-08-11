import { Types } from "mongoose";

import { AuditAction } from "../../enums/financial/auditAction.enum";
import { BookingSettlementReleaseError } from "../../errors/financial/BookingSettlementReleaseError";
import { bookingRepository } from "../../repositories/booking.repository";
import { createFinancialAudit } from "../auditLog.service";
import { bookingAllocationSettlementOrchestrator } from "./bookingAllocationSettlement.orchestrator";

export type BookingSettlementReleaseTrigger = "SCHEDULED" | "ADMIN_EARLY_RELEASE";

export class BookingSettlementReleaseService {
  private async loadBooking(bookingId: string) {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new BookingSettlementReleaseError(
        "Booking not found.",
        "BOOKING_SETTLEMENT_RELEASE_BOOKING_NOT_FOUND",
      );
    }
    const booking = await bookingRepository.findById(new Types.ObjectId(bookingId));
    if (!booking) {
      throw new BookingSettlementReleaseError(
        "Booking not found.",
        "BOOKING_SETTLEMENT_RELEASE_BOOKING_NOT_FOUND",
      );
    }
    return booking;
  }

  async release(input: {
    bookingId: string;
    trigger: BookingSettlementReleaseTrigger;
    adminUserId?: string;
    reason?: string;
  }) {
    if (
      input.trigger === "ADMIN_EARLY_RELEASE" &&
      (!input.adminUserId || !Types.ObjectId.isValid(input.adminUserId))
    ) {
      throw new BookingSettlementReleaseError(
        "Administrator identity is required for manual settlement release.",
        "BOOKING_SETTLEMENT_RELEASE_INVALID_TRIGGER",
      );
    }
    const booking = await this.loadBooking(input.bookingId);
    if (
      input.trigger === "SCHEDULED" &&
      (!booking.settlementEligibleAt || booking.settlementEligibleAt > new Date())
    ) {
      throw new BookingSettlementReleaseError(
        "Booking settlement hold is still active.",
        "BOOKING_SETTLEMENT_RELEASE_HOLD_ACTIVE",
      );
    }

    const result = await bookingAllocationSettlementOrchestrator.allocateAndSettle(
      booking._id.toString(),
    );

    if (input.trigger === "ADMIN_EARLY_RELEASE" && !result.replay) {
      await createFinancialAudit({
        action: AuditAction.ADMIN_BOOKING_ESCROW_MANUAL_RELEASED,
        actor: { type: "ADMIN", id: new Types.ObjectId(input.adminUserId) },
        entityType: "BOOKING",
        entityId: new Types.ObjectId(booking._id),
        financialContext: {
          domain: "SETTLEMENT",
          primaryReference: result.settlement.settlementReference,
          bookingReference: result.booking.bookingReference,
          paymentReference: result.payment.paymentReference,
          settlementReference: result.settlement.settlementReference,
          amount: result.settlement.creatorAmount,
          currency: result.settlement.currency,
        },
        transition: { outcome: result.replay ? "REPLAYED" : "SUCCEEDED" },
        metadata: {
          operationalAction: "MANUAL_EARLY_SETTLEMENT_RELEASE",
          ...(input.reason ? { manualReleaseReason: input.reason } : {}),
          ...(booking.settlementEligibleAt
            ? { settlementEligibleAt: booking.settlementEligibleAt.toISOString() }
            : {}),
        },
      });
    }
    return result;
  }
}

export const bookingSettlementReleaseService = new BookingSettlementReleaseService();
