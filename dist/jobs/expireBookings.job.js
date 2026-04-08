"use strict";
// backend/src/jobs/expireBookings.job.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expireBookingsJob = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const booking_model_1 = require("../models/booking.model");
const slot_model_1 = require("../models/slot.model");
/**
 * Expires REQUESTED bookings whose expiresAt has passed
 * Runs every minute
 */
const expireBookingsJob = async () => {
    const session = await mongoose_1.default.startSession();
    try {
        const now = new Date();
        // 🔹 Step 1: Fetch expired bookings OUTSIDE transaction (IMPORTANT)
        const expiredBookings = await booking_model_1.Booking.find({
            status: "REQUESTED",
            expiresAt: { $lte: now },
        }, { _id: 1, slotIds: 1 });
        if (expiredBookings.length === 0) {
            console.log("[expireBookingsJob] No expired bookings");
            return;
        }
        const bookingIds = expiredBookings.map((b) => b._id);
        // 🔹 Deduplicate slot IDs safely
        const slotIds = [
            ...new Set(expiredBookings.flatMap((b) => b.slotIds.map((id) => id.toString()))),
        ].map((id) => new mongoose_1.default.Types.ObjectId(id));
        // 🔒 Step 2: Start transaction ONLY for DB writes
        session.startTransaction();
        // 🔹 Step 3: Expire bookings (SAFE re-check condition)
        await booking_model_1.Booking.updateMany({
            _id: { $in: bookingIds },
            status: "REQUESTED",
        }, {
            $set: { status: "EXPIRED" },
        }, { session });
        // 🔹 Step 4: Release slots
        if (slotIds.length > 0) {
            await slot_model_1.Slot.updateMany({
                _id: { $in: slotIds },
                status: "LOCKED",
            }, {
                $set: { status: "AVAILABLE" },
            }, { session });
        }
        await session.commitTransaction();
        console.log(`[expireBookingsJob] Expired ${bookingIds.length} booking(s)`);
    }
    catch (err) {
        await session.abortTransaction();
        console.error("[expireBookingsJob] Error:", err);
    }
    finally {
        session.endSession();
    }
};
exports.expireBookingsJob = expireBookingsJob;
