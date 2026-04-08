"use strict";
// backend/src/jobs/interactionTrigger.job.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.interactionTriggerJob = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const booking_model_1 = require("../models/booking.model");
const slot_model_1 = require("../models/slot.model");
/**
 * Marks interaction as started when booking start time is reached
 * This prevents refund abuse when user waits silently
 */
const interactionTriggerJob = async () => {
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        const now = new Date();
        // 1️⃣ Find CONFIRMED bookings without interaction
        const bookings = await booking_model_1.Booking.find({
            status: "CONFIRMED",
            hasInteracted: false,
        }).session(session);
        if (bookings.length === 0) {
            await session.commitTransaction();
            console.log("[interactionTriggerJob] No bookings to process");
            return;
        }
        for (const booking of bookings) {
            // 2️⃣ Get earliest slot startTime (only one slot needed)
            const firstSlot = await slot_model_1.Slot.findOne({ _id: { $in: booking.slotIds } }, null, { session }).sort({ startTime: 1 });
            if (!firstSlot)
                continue;
            const startTime = firstSlot.startTime;
            // 3️⃣ If booking time has started → mark interaction
            if (startTime <= now) {
                booking.hasInteracted = true;
                booking.interactionStartedAt = startTime;
                await booking.save({ session });
            }
        }
        await session.commitTransaction();
    }
    catch (err) {
        await session.abortTransaction();
        console.error("[interactionTriggerJob] Error:", err);
    }
    finally {
        session.endSession();
    }
};
exports.interactionTriggerJob = interactionTriggerJob;
