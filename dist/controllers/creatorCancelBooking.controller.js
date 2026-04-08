"use strict";
// backend/src/controllers/creatorCancelBooking.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelBookingByCreator = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const booking_model_1 = require("../models/booking.model");
const slot_model_1 = require("../models/slot.model");
const User_1 = __importDefault(require("../models/User"));
const abuseScore_service_1 = require("../services/abuseScore.service");
const cancelBookingByCreator = async (req, res) => {
    try {
        console.log("========== CANCEL BY CREATOR ==========");
        /* ================= USER ================= */
        const userId = req.user?._id?.toString();
        console.log("REQ.USER:", req.user);
        console.log("USER ID (from DB):", userId);
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        /* ================= INPUT ================= */
        const { bookingId } = req.body;
        console.log("REQ.BODY:", req.body);
        if (!bookingId) {
            return res.status(400).json({ message: "bookingId required" });
        }
        if (!mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
            return res.status(400).json({ message: "Invalid bookingId" });
        }
        /* ================= USER CHECK ================= */
        const dbUser = await User_1.default.findById(userId);
        if (!dbUser) {
            return res.status(404).json({ message: "User not found" });
        }
        if (dbUser.creatorCooldownUntil &&
            dbUser.creatorCooldownUntil > new Date()) {
            return res.status(403).json({
                message: "Creator actions temporarily disabled",
            });
        }
        /* ================= BOOKING ================= */
        const booking = await booking_model_1.Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ message: "Booking not found" });
        }
        console.log("BOOKING ID:", booking._id);
        console.log("BOOKING CREATOR ID:", booking.creatorId?.toString());
        /* ================= AUTH ================= */
        if (booking.creatorId.toString() !== userId) {
            console.log("❌ AUTH FAILED");
            console.log("BOOKING CREATOR:", booking.creatorId.toString());
            console.log("USER ID:", userId);
            return res.status(403).json({
                message: "Not authorized",
            });
        }
        /* ================= STATUS ================= */
        const status = booking.status?.trim().toUpperCase();
        console.log("BOOKING STATUS:", status);
        if (status !== "CONFIRMED") {
            return res.status(400).json({
                message: `Booking not cancellable (${booking.status})`,
            });
        }
        /* ================= TRANSACTION ================= */
        const session = await mongoose_1.default.startSession();
        try {
            session.startTransaction();
            /* ===== UPDATE BOOKING ===== */
            booking.status = "CANCELLED";
            booking.paymentStatus = "REFUNDED";
            /* ===== RELEASE SLOTS ===== */
            const slotUpdate = await slot_model_1.Slot.updateMany({
                _id: { $in: booking.slotIds },
                status: "BOOKED",
            }, { status: "AVAILABLE" }, { session });
            console.log("SLOTS UPDATED:", slotUpdate.modifiedCount);
            await booking.save({ session });
            console.log("BOOKING UPDATED");
            /* ===== ABUSE SCORE ===== */
            try {
                await (0, abuseScore_service_1.applyAbuseScore)(booking.creatorId, booking.hasInteracted
                    ? "CREATOR_CANCEL_AFTER_INTERACTION"
                    : "CREATOR_CANCEL");
                console.log("ABUSE SCORE APPLIED");
            }
            catch (err) {
                console.error("ABUSE SCORE FAILED:", err);
            }
            console.log("ABUSE SCORE APPLIED");
            /* ===== COMMIT ===== */
            await session.commitTransaction();
        }
        catch (err) {
            await session.abortTransaction();
            console.error("❌ TRANSACTION ERROR:", err);
            return res.status(400).json({
                message: err.message || "Cancel failed",
            });
        }
        finally {
            session.endSession(); // ✅ ALWAYS CLOSE SESSION
        }
        /* ================= FINAL RESPONSE ================= */
        console.log("✅ CANCEL SUCCESS");
        return res.status(200).json({
            message: "Booking cancelled by creator",
            booking,
        });
    }
    catch (err) {
        console.error("❌ OUTER ERROR:", err);
        return res.status(500).json({
            message: "Internal server error",
        });
    }
};
exports.cancelBookingByCreator = cancelBookingByCreator;
