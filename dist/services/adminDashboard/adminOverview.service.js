"use strict";
//backend/src/services/adminDashboard/adminOverview.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminOverviewService = void 0;
const User_1 = __importDefault(require("../../models/User"));
const creatorProfile_model_1 = require("../../models/creatorProfile.model");
const booking_model_1 = require("../../models/booking.model");
const getAdminOverviewService = async () => {
    const now = new Date();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const last7Days = new Date();
    last7Days.setDate(now.getDate() - 7);
    const [totalUsers, usersLast7Days, totalCreators, approvedCreators, pendingCreators, totalBookings, bookingsLast7Days, bookingsToday] = await Promise.all([
        // USERS
        User_1.default.countDocuments(),
        User_1.default.countDocuments({ createdAt: { $gte: last7Days } }),
        // CREATORS
        creatorProfile_model_1.CreatorProfile.countDocuments(),
        creatorProfile_model_1.CreatorProfile.countDocuments({ status: "APPROVED" }),
        creatorProfile_model_1.CreatorProfile.countDocuments({ status: "PENDING" }),
        // BOOKINGS
        booking_model_1.Booking.countDocuments(),
        booking_model_1.Booking.countDocuments({ createdAt: { $gte: last7Days } }),
        booking_model_1.Booking.countDocuments({ createdAt: { $gte: startOfToday } })
    ]);
    return {
        users: {
            total: totalUsers,
            last7Days: usersLast7Days
        },
        creators: {
            total: totalCreators,
            approved: approvedCreators,
            pending: pendingCreators
        },
        bookings: {
            total: totalBookings,
            last7Days: bookingsLast7Days,
            today: bookingsToday
        }
    };
};
exports.getAdminOverviewService = getAdminOverviewService;
