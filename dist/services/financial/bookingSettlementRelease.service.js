"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingSettlementReleaseService = exports.BookingSettlementReleaseService = void 0;
const mongoose_1 = require("mongoose");
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const BookingSettlementReleaseError_1 = require("../../errors/financial/BookingSettlementReleaseError");
const booking_repository_1 = require("../../repositories/booking.repository");
const auditLog_service_1 = require("../auditLog.service");
const bookingAllocationSettlement_orchestrator_1 = require("./bookingAllocationSettlement.orchestrator");
class BookingSettlementReleaseService {
    async loadBooking(bookingId) {
        if (!mongoose_1.Types.ObjectId.isValid(bookingId)) {
            throw new BookingSettlementReleaseError_1.BookingSettlementReleaseError("Booking not found.", "BOOKING_SETTLEMENT_RELEASE_BOOKING_NOT_FOUND");
        }
        const booking = await booking_repository_1.bookingRepository.findById(new mongoose_1.Types.ObjectId(bookingId));
        if (!booking) {
            throw new BookingSettlementReleaseError_1.BookingSettlementReleaseError("Booking not found.", "BOOKING_SETTLEMENT_RELEASE_BOOKING_NOT_FOUND");
        }
        return booking;
    }
    async release(input) {
        if (input.trigger === "ADMIN_EARLY_RELEASE" &&
            (!input.adminUserId || !mongoose_1.Types.ObjectId.isValid(input.adminUserId))) {
            throw new BookingSettlementReleaseError_1.BookingSettlementReleaseError("Administrator identity is required for manual settlement release.", "BOOKING_SETTLEMENT_RELEASE_INVALID_TRIGGER");
        }
        const booking = await this.loadBooking(input.bookingId);
        if (input.trigger === "SCHEDULED" &&
            (!booking.settlementEligibleAt || booking.settlementEligibleAt > new Date())) {
            throw new BookingSettlementReleaseError_1.BookingSettlementReleaseError("Booking settlement hold is still active.", "BOOKING_SETTLEMENT_RELEASE_HOLD_ACTIVE");
        }
        const result = await bookingAllocationSettlement_orchestrator_1.bookingAllocationSettlementOrchestrator.allocateAndSettle(booking._id.toString());
        if (input.trigger === "ADMIN_EARLY_RELEASE" && !result.replay) {
            await (0, auditLog_service_1.createFinancialAudit)({
                action: auditAction_enum_1.AuditAction.ADMIN_BOOKING_ESCROW_MANUAL_RELEASED,
                actor: { type: "ADMIN", id: new mongoose_1.Types.ObjectId(input.adminUserId) },
                entityType: "BOOKING",
                entityId: new mongoose_1.Types.ObjectId(booking._id),
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
exports.BookingSettlementReleaseService = BookingSettlementReleaseService;
exports.bookingSettlementReleaseService = new BookingSettlementReleaseService();
