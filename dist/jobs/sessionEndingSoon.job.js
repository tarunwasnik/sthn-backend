"use strict";
// backend/src/jobs/sessionEndingSoon.job.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionEndingSoonJob = void 0;
const booking_model_1 = require("../models/booking.model");
const slot_model_1 = require("../models/slot.model");
/**
 * Notifies users when a session is about to end (5 minutes before).
 * Runs every minute.
 */
const sessionEndingSoonJob = async () => {
    const now = new Date();
    const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);
    try {
        const activeBookings = await booking_model_1.Booking.find({
            status: "CONFIRMED",
            hasInteracted: true,
        });
        if (activeBookings.length === 0)
            return;
        for (const booking of activeBookings) {
            // Get latest slot end time directly
            const latestSlot = await slot_model_1.Slot.findOne({ _id: { $in: booking.slotIds } }, { endTime: 1 }).sort({ endTime: -1 });
            if (!latestSlot)
                continue;
            const latestEndTime = latestSlot.endTime;
            if (latestEndTime > now &&
                latestEndTime <= fiveMinutesLater) {
                /**
                 * Notification trigger placeholder
                 *
                 * socket.emit("sessionEndingSoon", { bookingId })
                 * or push notification / in-app notification
                 */
                console.log(`[sessionEndingSoonJob] Booking ${booking._id} ending soon`);
            }
        }
    }
    catch (err) {
        console.error("[sessionEndingSoonJob] Error:", err);
    }
};
exports.sessionEndingSoonJob = sessionEndingSoonJob;
