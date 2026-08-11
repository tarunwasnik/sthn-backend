"use strict";
// backend/src/controllers/creatorDashboard.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCreatorDashboard = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const creatorProfile_model_1 = require("../models/creatorProfile.model");
const booking_model_1 = require("../models/booking.model");
const slot_model_1 = require("../models/slot.model");
const AppError_1 = require("../utils/AppError");
/**
 * GET /api/v1/creator/dashboard
 */
const getCreatorDashboard = async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new AppError_1.AppError("Unauthorized", 401);
    }
    const userObjectId = new mongoose_1.default.Types.ObjectId(userId);
    /* ================= CREATOR PROFILE ================= */
    const creatorProfile = await creatorProfile_model_1.CreatorProfile.findOne({
        userId: userObjectId,
    }).lean();
    if (!creatorProfile) {
        throw new AppError_1.AppError("Creator profile not found", 404);
    }
    if (creatorProfile.status !== "active") {
        throw new AppError_1.AppError("Creator profile is not active", 403);
    }
    /* ================= BOOKING STATS ================= */
    const [totalBookings, pendingBookings, completedBookings,] = await Promise.all([
        booking_model_1.Booking.countDocuments({
            creatorId: userObjectId,
        }),
        booking_model_1.Booking.countDocuments({
            creatorId: userObjectId,
            status: "REQUESTED",
        }),
        booking_model_1.Booking.countDocuments({
            creatorId: userObjectId,
            status: "COMPLETED",
        }),
    ]);
    /* ================= RECENT BOOKINGS ================= */
    const recentBookings = await booking_model_1.Booking.find({
        creatorId: userObjectId,
    })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("status paymentStatus creatorEarningSnapshot createdAt")
        .lean();
    /* ================= NEXT UPCOMING BOOKING ================= */
    const upcomingBookings = await booking_model_1.Booking.find({
        creatorId: userObjectId,
        status: {
            $in: ["REQUESTED", "CONFIRMED"],
        },
    })
        .select("serviceTitle status slotIds createdAt")
        .lean();
    const upcomingSlotIds = upcomingBookings.flatMap((booking) => booking.slotIds);
    const upcomingSlots = await slot_model_1.Slot.find({
        _id: { $in: upcomingSlotIds },
    }).lean();
    const upcomingSlotMap = new Map(upcomingSlots.map((slot) => [
        String(slot._id),
        slot,
    ]));
    const now = new Date();
    const nextUpcomingBooking = upcomingBookings
        .map((booking) => {
        const bookingSlots = booking.slotIds
            .map((id) => upcomingSlotMap.get(String(id)))
            .filter(Boolean)
            .sort((a, b) => new Date(a.startTime).getTime() -
            new Date(b.startTime).getTime());
        const firstSlot = bookingSlots[0];
        if (!firstSlot)
            return null;
        if (new Date(firstSlot.startTime) < now) {
            return null;
        }
        return {
            id: booking._id,
            serviceTitle: booking.serviceTitle,
            status: booking.status,
            startTime: firstSlot.startTime,
            endTime: firstSlot.endTime,
        };
    })
        .filter(Boolean)
        .sort((a, b) => new Date(a.startTime).getTime() -
        new Date(b.startTime).getTime())[0] ?? null;
    /* ================= MTD EARNINGS ================= */
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const earningsResult = await booking_model_1.Booking.aggregate([
        {
            $match: {
                creatorId: userObjectId,
                status: "COMPLETED",
                isPayable: true,
                createdAt: { $gte: startOfMonth },
            },
        },
        {
            $group: {
                _id: null,
                total: {
                    $sum: "$creatorEarningSnapshot",
                },
            },
        },
    ]);
    const mtdEarnings = earningsResult.length > 0
        ? earningsResult[0].total
        : 0;
    /* ================= RESPONSE ================= */
    res.status(200).json({
        creatorProfile: {
            id: creatorProfile._id,
            displayName: creatorProfile.displayName,
            slug: creatorProfile.slug,
            primaryCategory: creatorProfile.primaryCategory,
            status: creatorProfile.status,
            rating: creatorProfile.rating ?? 0,
            reviewCount: creatorProfile.reviewCount ?? 0,
        },
        stats: {
            totalBookings,
            pendingBookings,
            completedBookings,
        },
        earnings: {
            mtd: mtdEarnings,
        },
        recentActivity: recentBookings.map((booking) => ({
            id: booking._id,
            status: booking.status,
            paymentStatus: booking.paymentStatus,
            earning: booking.creatorEarningSnapshot ??
                0,
            createdAt: booking.createdAt,
        })),
        nextUpcomingBooking,
    });
};
exports.getCreatorDashboard = getCreatorDashboard;
