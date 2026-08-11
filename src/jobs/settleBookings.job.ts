import { Booking } from "../models/booking.model";
import { BookingCreatorSettlement } from "../models/bookingCreatorSettlement.model";
import { BookingCreatorSettlementStatus } from "../enums/financial/bookingCreatorSettlementStatus.enum";
import { bookingSettlementReleaseService } from "../services/financial/bookingSettlementRelease.service";

export const settleBookingsJob = async () => {
  const now = new Date();
  const settledBookingIds = await BookingCreatorSettlement.distinct("bookingId", {
    status: BookingCreatorSettlementStatus.SETTLED,
  });
  const bookings = await Booking.find({ status: "COMPLETED", paymentMethod: "WALLET", settlementEligibleAt: { $lte: now }, settlementId: { $exists: false }, _id: { $nin: settledBookingIds }, isFinancialLocked: { $ne: true } }, { _id: 1 }).sort({ settlementEligibleAt: 1, _id: 1 }).limit(50).lean();
  const report = { processed: 0, completed: 0, replayed: 0, skipped: 0, blocked: 0, failed: 0 };
  for (const booking of bookings) { report.processed += 1; try { const result = await bookingSettlementReleaseService.release({ bookingId: booking._id.toString(), trigger: "SCHEDULED" }); result.replay ? report.replayed++ : report.completed++; } catch (error) { report.blocked++; console.error("[settleBookingsJob]", booking._id.toString(), error instanceof Error ? error.message : error); } }
  return report;
};
