import { adminBookingEscrowRepository, AdminBookingEscrowRecord } from "../../repositories/adminBookingEscrow.repository";
import { BookingSettlementReleaseError } from "../../errors/financial/BookingSettlementReleaseError";
import { bookingRepository } from "../../repositories/booking.repository";
import { bookingSettlementReleaseService } from "./bookingSettlementRelease.service";

export type AdminEscrowState = "HELD" | "ELIGIBLE" | "SETTLED" | "BLOCKED";

const toSafe = (record: AdminBookingEscrowRecord, now = new Date()) => {
  const settled = record.settlement?.status === "SETTLED";
  const blocked = record.isFinancialLocked || record.hasOpenDispute;
  const captured = record.payment?.status === "CAPTURED";
  const reservationCaptured = record.reservation?.status === "CAPTURED";
  const releaseAllowed = !settled && !blocked && record.status === "COMPLETED" &&
    record.paymentMethod === "WALLET" && captured && reservationCaptured;
  const state: AdminEscrowState = settled ? "SETTLED" : blocked ? "BLOCKED" :
    record.settlementEligibleAt && record.settlementEligibleAt <= now ? "ELIGIBLE" : "HELD";
  const manualReleaseBlockedReason = releaseAllowed ? undefined : settled ? "SETTLEMENT_ALREADY_COMPLETED" :
    record.hasOpenDispute ? "OPEN_DISPUTE" : record.isFinancialLocked ? "FINANCIAL_LOCKED" :
    !captured ? "PAYMENT_NOT_CAPTURED" : !reservationCaptured ? "RESERVATION_NOT_CAPTURED" : "SETTLEMENT_PRECONDITION_NOT_MET";
  return {
    bookingReference: record.bookingReference,
    paymentReference: record.payment?.paymentReference ?? record.paymentReference,
    currency: record.currency,
    capturedGrossAmount: record.totalAmount,
    serviceAmount: record.serviceAmount,
    customerFeeAmount: record.platformFeeAmount,
    creatorCommissionAmount: record.commissionAmount,
    creatorNetAmount: record.creatorAmount,
    capturedAt: record.payment?.capturedAt,
    settlementEligibleAt: record.settlementEligibleAt,
    escrowState: state,
    paymentStatus: record.payment?.status,
    reservationStatus: record.reservation?.status,
    allocation: record.allocation?.allocationReference ? { reference: record.allocation.allocationReference, status: record.allocation.status, allocatedAt: record.allocation.allocatedAt } : undefined,
    settlement: record.settlement?.settlementReference ? { reference: record.settlement.settlementReference, status: record.settlement.status, settledAt: record.settlement.settledAt } : undefined,
    hasOpenDispute: record.hasOpenDispute,
    isFinancialLocked: record.isFinancialLocked,
    manualReleaseAllowed: releaseAllowed,
    ...(manualReleaseBlockedReason ? { manualReleaseBlockedReason } : {}),
  };
};

export class AdminBookingEscrowService {
  async list(input: { state?: unknown }) {
    const state = input.state;
    if (state !== undefined && (typeof state !== "string" || !["HELD", "ELIGIBLE", "SETTLED", "BLOCKED"].includes(state))) {
      throw new BookingSettlementReleaseError("Escrow state filter is invalid.", "BOOKING_SETTLEMENT_RELEASE_INVALID_TRIGGER");
    }
    const rows = (await adminBookingEscrowRepository.list()).map((record) => toSafe(record));
    return { items: state ? rows.filter((row) => row.escrowState === state) : rows };
  }

  async get(bookingReference: string) {
    const record = await adminBookingEscrowRepository.findByBookingReference(bookingReference);
    if (!record) throw new BookingSettlementReleaseError("Booking not found.", "BOOKING_SETTLEMENT_RELEASE_BOOKING_NOT_FOUND");
    return toSafe(record);
  }

  async release(input: { bookingReference: string; adminUserId: string; reason?: string }) {
    const booking = await bookingRepository.findByBookingReference(input.bookingReference);
    if (!booking) throw new BookingSettlementReleaseError("Booking not found.", "BOOKING_SETTLEMENT_RELEASE_BOOKING_NOT_FOUND");
    return bookingSettlementReleaseService.release({ bookingId: booking._id.toString(), trigger: "ADMIN_EARLY_RELEASE", adminUserId: input.adminUserId, reason: input.reason });
  }
}

export const adminBookingEscrowService = new AdminBookingEscrowService();
