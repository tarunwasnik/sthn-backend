"use strict";
// backend/src/jobs/completeBookings.job.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeBookingsJob = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const booking_model_1 = require("../models/booking.model");
const slot_model_1 = require("../models/slot.model");
const completeBookingsJob = async () => {
    let session = null;
    try {
        const now = new Date();
        const TEN_MINUTES = 10 * 60 * 1000;
        const bookings = await booking_model_1.Booking.find({ status: "CONFIRMED" }, { _id: 1, slotIds: 1 });
        if (bookings.length === 0)
            return;
        const allSlotIds = [
            ...new Set(bookings.flatMap((b) => b.slotIds.map((id) => id.toString()))),
        ].map((id) => new mongoose_1.default.Types.ObjectId(id));
        const slots = await slot_model_1.Slot.find({ _id: { $in: allSlotIds } }, { _id: 1, endTime: 1 });
        const slotMap = new Map();
        for (const slot of slots) {
            slotMap.set(slot._id.toString(), slot.endTime);
        }
        const eligibleBookings = [];
        for (const booking of bookings) {
            const allEnded = booking.slotIds.every((slotId) => {
                const endTime = slotMap.get(slotId.toString());
                if (!endTime)
                    return false;
                return (endTime.getTime() + TEN_MINUTES <= now.getTime());
            });
            if (allEnded) {
                eligibleBookings.push(booking._id);
            }
        }
        if (eligibleBookings.length === 0)
            return;
        // ✅ CREATE SESSION ONLY WHEN NEEDED
        session = await mongoose_1.default.startSession();
        session.startTransaction();
        await booking_model_1.Booking.updateMany({
            _id: { $in: eligibleBookings },
            status: "CONFIRMED",
        }, {
            $set: {
                status: "COMPLETED",
                completedAt: new Date(),
            },
        }, { session });
        await session.commitTransaction();
    }
    catch (err) {
        if (session) {
            await session.abortTransaction();
        }
        console.error("[completeBookingsJob] Error:", err);
    }
    finally {
        if (session) {
            session.endSession();
        }
    }
};
exports.completeBookingsJob = completeBookingsJob;
