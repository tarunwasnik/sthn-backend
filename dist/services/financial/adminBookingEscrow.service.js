"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminBookingEscrowService = exports.AdminBookingEscrowService = void 0;
const adminBookingEscrow_repository_1 = require("../../repositories/adminBookingEscrow.repository");
const BookingSettlementReleaseError_1 = require("../../errors/financial/BookingSettlementReleaseError");
const booking_repository_1 = require("../../repositories/booking.repository");
const bookingSettlementRelease_service_1 = require("./bookingSettlementRelease.service");
const toSafe = (record, now = new Date()) => {
    const settled = record.settlement?.status === "SETTLED";
    const blocked = record.isFinancialLocked || record.hasOpenDispute;
    const captured = record.payment?.status === "CAPTURED";
    const reservationCaptured = record.reservation?.status === "CAPTURED";
    const releaseAllowed = !settled && !blocked && record.status === "COMPLETED" &&
        record.paymentMethod === "WALLET" && captured && reservationCaptured;
    const state = settled ? "SETTLED" : blocked ? "BLOCKED" :
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
class AdminBookingEscrowService {
    async list(input) {
        const state = input.state;
        if (state !== undefined && (typeof state !== "string" || !["HELD", "ELIGIBLE", "SETTLED", "BLOCKED"].includes(state))) {
            throw new BookingSettlementReleaseError_1.BookingSettlementReleaseError("Escrow state filter is invalid.", "BOOKING_SETTLEMENT_RELEASE_INVALID_TRIGGER");
        }
        const rows = (await adminBookingEscrow_repository_1.adminBookingEscrowRepository.list()).map((record) => toSafe(record));
        return { items: state ? rows.filter((row) => row.escrowState === state) : rows };
    }
    async get(bookingReference) {
        const record = await adminBookingEscrow_repository_1.adminBookingEscrowRepository.findByBookingReference(bookingReference);
        if (!record)
            throw new BookingSettlementReleaseError_1.BookingSettlementReleaseError("Booking not found.", "BOOKING_SETTLEMENT_RELEASE_BOOKING_NOT_FOUND");
        return toSafe(record);
    }
    async release(input) {
        const booking = await booking_repository_1.bookingRepository.findByBookingReference(input.bookingReference);
        if (!booking)
            throw new BookingSettlementReleaseError_1.BookingSettlementReleaseError("Booking not found.", "BOOKING_SETTLEMENT_RELEASE_BOOKING_NOT_FOUND");
        return bookingSettlementRelease_service_1.bookingSettlementReleaseService.release({ bookingId: booking._id.toString(), trigger: "ADMIN_EARLY_RELEASE", adminUserId: input.adminUserId, reason: input.reason });
    }
}
exports.AdminBookingEscrowService = AdminBookingEscrowService;
exports.adminBookingEscrowService = new AdminBookingEscrowService();
