"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settleBookingsJob = void 0;
const booking_model_1 = require("../models/booking.model");
const bookingCreatorSettlement_model_1 = require("../models/bookingCreatorSettlement.model");
const bookingCreatorSettlementStatus_enum_1 = require("../enums/financial/bookingCreatorSettlementStatus.enum");
const bookingSettlementRelease_service_1 = require("../services/financial/bookingSettlementRelease.service");
const settleBookingsJob = async () => {
    const now = new Date();
    const settledBookingIds = await bookingCreatorSettlement_model_1.BookingCreatorSettlement.distinct("bookingId", {
        status: bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.SETTLED,
    });
    const bookings = await booking_model_1.Booking.find({ status: "COMPLETED", paymentMethod: "WALLET", settlementEligibleAt: { $lte: now }, settlementId: { $exists: false }, _id: { $nin: settledBookingIds }, isFinancialLocked: { $ne: true } }, { _id: 1 }).sort({ settlementEligibleAt: 1, _id: 1 }).limit(50).lean();
    const report = { processed: 0, completed: 0, replayed: 0, skipped: 0, blocked: 0, failed: 0 };
    for (const booking of bookings) {
        report.processed += 1;
        try {
            const result = await bookingSettlementRelease_service_1.bookingSettlementReleaseService.release({ bookingId: booking._id.toString(), trigger: "SCHEDULED" });
            result.replay ? report.replayed++ : report.completed++;
        }
        catch (error) {
            report.blocked++;
            console.error("[settleBookingsJob]", booking._id.toString(), error instanceof Error ? error.message : error);
        }
    }
    return report;
};
exports.settleBookingsJob = settleBookingsJob;
