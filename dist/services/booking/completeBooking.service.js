"use strict";
//backend/src/services/booking/completeBooking.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeBookingService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const booking_model_1 = require("../../models/booking.model");
const dispute_model_1 = require("../../models/dispute.model");
const featureFlagGuard_service_1 = require("../controlPlane/featureFlagGuard.service");
const PLATFORM_COMMISSION_RATE = 0.2; // 20%
const completeBookingService = async ({ bookingId, creatorId, role, }) => {
    // ✅ OUTSIDE TRANSACTION
    await featureFlagGuard_service_1.FeatureFlagGuard.requireEnabled("BOOKING_COMPLETION_ENABLED", { userId: creatorId, role }, "Booking completion is temporarily disabled");
    if (!mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
        throw new Error("Invalid bookingId");
    }
    let session = null;
    try {
        session = await mongoose_1.default.startSession();
        session.startTransaction();
        const booking = await booking_model_1.Booking.findOne({
            _id: bookingId,
            creatorId,
        }).session(session);
        if (!booking) {
            throw new Error("Booking not found");
        }
        if (booking.isFinancialLocked) {
            throw new Error("Financial operations are locked for this booking");
        }
        const openDispute = await dispute_model_1.Dispute.findOne({
            bookingId: booking._id,
            status: "OPEN",
        }).session(session);
        if (openDispute) {
            throw new Error("Booking cannot be completed while a dispute is open");
        }
        if (booking.status !== "CONFIRMED") {
            throw new Error("Only confirmed bookings can be completed");
        }
        if (!booking.isPayable) {
            throw new Error("Booking is not payable");
        }
        if (booking.paymentStatus === "REFUNDED") {
            throw new Error("Refunded booking cannot be completed");
        }
        if (booking.isPayoutEligible) {
            throw new Error("Booking is already payout-eligible");
        }
        if (typeof booking.price !== "number") {
            throw new Error("Booking price snapshot missing");
        }
        if (booking.creatorEarningSnapshot !== undefined ||
            booking.platformCommissionSnapshot !== undefined) {
            throw new Error("Earning snapshots are already attached to this booking");
        }
        /*
          🔥 Compute earnings
        */
        const platformCommission = Number((booking.price * PLATFORM_COMMISSION_RATE).toFixed(2));
        const creatorEarning = Number((booking.price - platformCommission).toFixed(2));
        booking.status = "COMPLETED";
        booking.completedAt = new Date(); // ✅ IMPORTANT
        booking.isPayoutEligible = true;
        booking.creatorEarningSnapshot = creatorEarning;
        booking.platformCommissionSnapshot = platformCommission;
        booking.isFinancialLocked = true;
        await booking.save({ session });
        await session.commitTransaction();
        return booking;
    }
    catch (err) {
        if (session) {
            await session.abortTransaction();
        }
        throw err;
    }
    finally {
        if (session) {
            session.endSession();
        }
    }
};
exports.completeBookingService = completeBookingService;
