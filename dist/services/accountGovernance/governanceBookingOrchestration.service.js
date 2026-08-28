"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orchestrateGovernanceBookingConsequences = exports.classifyGovernanceBooking = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const booking_model_1 = require("../../models/booking.model");
const bookingFundReservation_model_1 = require("../../models/bookingFundReservation.model");
const dispute_model_1 = require("../../models/dispute.model");
const payment_model_1 = require("../../models/payment.model");
const slot_model_1 = require("../../models/slot.model");
const bookingTerminationType_enum_1 = require("../../enums/booking/bookingTerminationType.enum");
const bookingFundReservationStatus_enum_1 = require("../../enums/financial/bookingFundReservationStatus.enum");
const paymentMethod_enum_1 = require("../../enums/financial/paymentMethod.enum");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const bookingFinancialTermination_service_1 = require("../financial/bookingFinancialTermination.service");
const PROTECTION_WINDOW_MS = 24 * 60 * 60 * 1000;
const referenceFor = (booking) => booking.bookingReference ?? booking._id.toString();
const emptySummary = () => ({
    totalRelevantBookings: 0,
    terminatedCount: 0,
    protectedCount: 0,
    disputeLockedCount: 0,
    financialLockedCount: 0,
    noActionCount: 0,
    failedCount: 0,
    bookingReferences: {},
});
const record = (summary, outcome, reference) => {
    var _a;
    const countKeys = {
        TERMINATE: "terminatedCount",
        PROTECTED: "protectedCount",
        DISPUTE_LOCKED: "disputeLockedCount",
        FINANCIAL_LOCKED: "financialLockedCount",
        NO_ACTION: "noActionCount",
        FAILED: "failedCount",
    };
    const key = countKeys[outcome];
    if (key in summary && typeof summary[key] === "number") {
        summary[key] += 1;
    }
    ((_a = summary.bookingReferences)[outcome] ?? (_a[outcome] = [])).push(reference);
};
const isWalletFinanciallyReleasable = async (booking) => {
    if (booking.isFinancialLocked || booking.settlementId)
        return false;
    if (!booking.paymentId || booking.paymentMethod !== paymentMethod_enum_1.PaymentMethod.WALLET)
        return true;
    const [payment, reservation] = await Promise.all([
        payment_model_1.Payment.findById(booking.paymentId).select("method status settlementId").lean(),
        bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: booking._id }).select("status").lean(),
    ]);
    return payment?.method === paymentMethod_enum_1.PaymentMethod.WALLET &&
        payment.status === paymentStatus_enum_1.PaymentStatus.AUTHORIZED &&
        !payment.settlementId &&
        reservation?.status === bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE;
};
const classifyGovernanceBooking = async (booking, now = new Date()) => {
    if (booking.status !== "REQUESTED" && booking.status !== "CONFIRMED")
        return "NO_ACTION";
    if (await dispute_model_1.Dispute.exists({ bookingId: booking._id, status: "OPEN" }))
        return "DISPUTE_LOCKED";
    if (booking.status === "REQUESTED") {
        return (await isWalletFinanciallyReleasable(booking)) ? "TERMINATE" : "FINANCIAL_LOCKED";
    }
    const slots = await slot_model_1.Slot.find({ _id: { $in: booking.slotIds } })
        .select("startTime endTime")
        .sort({ startTime: 1 })
        .lean();
    if (slots.length !== booking.slotIds.length)
        return "FINANCIAL_LOCKED";
    const firstStart = slots[0].startTime.getTime();
    const lastEnd = slots.reduce((latest, slot) => Math.max(latest, slot.endTime.getTime()), 0);
    const nowMs = now.getTime();
    if (firstStart <= nowMs && lastEnd > nowMs)
        return "PROTECTED";
    if (firstStart > nowMs && firstStart - nowMs <= PROTECTION_WINDOW_MS)
        return "PROTECTED";
    if (firstStart <= nowMs)
        return "FINANCIAL_LOCKED";
    return (await isWalletFinanciallyReleasable(booking)) ? "TERMINATE" : "FINANCIAL_LOCKED";
};
exports.classifyGovernanceBooking = classifyGovernanceBooking;
/**
 * Read/classify/execute boundary for G3. Each eligible termination delegates
 * to the G2 financial authority and therefore owns its own transaction/replay.
 */
const orchestrateGovernanceBookingConsequences = async (input) => {
    if (!mongoose_1.default.Types.ObjectId.isValid(input.governedUserId))
        throw new Error("Invalid governed user id");
    const bookings = await booking_model_1.Booking.find({
        $or: [{ userId: input.governedUserId }, { creatorId: input.governedUserId }],
        status: { $in: ["REQUESTED", "CONFIRMED"] },
    }).sort({ _id: 1 });
    const summary = emptySummary();
    summary.totalRelevantBookings = bookings.length;
    for (const booking of bookings) {
        const reference = referenceFor(booking);
        try {
            const outcome = await (0, exports.classifyGovernanceBooking)(booking, input.now);
            if (outcome !== "TERMINATE") {
                record(summary, outcome, reference);
                continue;
            }
            await bookingFinancialTermination_service_1.bookingFinancialTerminationService.terminateBookingFinancially({
                bookingId: booking._id.toString(),
                actorId: input.adminId,
                actorType: bookingTerminationType_enum_1.BookingTerminationActorType.GOVERNANCE,
                terminationType: bookingTerminationType_enum_1.BookingTerminationType.GOVERNANCE_TERMINATED,
                reason: input.reason,
            });
            record(summary, "TERMINATE", reference);
        }
        catch {
            // G2 remains the invariant authority. A corrupt/unexpected graph is
            // surfaced operationally without preventing independent bookings.
            record(summary, "FAILED", reference);
        }
    }
    return summary;
};
exports.orchestrateGovernanceBookingConsequences = orchestrateGovernanceBookingConsequences;
