"use strict";
//backend/src/services/adminDashboard/adminBookings.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBookingStatusBreakdownService = exports.getBookingTrendsService = exports.getAllBookingsService = void 0;
const booking_model_1 = require("../../models/booking.model");
/**
 * Paginated bookings list (used by table)
 */
const getAllBookingsService = async (page, limit) => {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
        booking_model_1.Booking.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        booking_model_1.Booking.countDocuments()
    ]);
    return { data, total };
};
exports.getAllBookingsService = getAllBookingsService;
/**
 * Time-based booking trends (used by charts)
 */
const getBookingTrendsService = async (days = 30) => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const trends = await booking_model_1.Booking.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: {
                    $dateToString: {
                        format: "%Y-%m-%d",
                        date: "$createdAt"
                    }
                },
                count: { $sum: 1 }
            }
        },
        {
            $project: {
                _id: 0,
                date: "$_id",
                count: 1
            }
        },
        {
            $sort: { date: 1 }
        }
    ]);
    return trends;
};
exports.getBookingTrendsService = getBookingTrendsService;
const getBookingStatusBreakdownService = async () => {
    const breakdown = await booking_model_1.Booking.aggregate([
        {
            $group: {
                _id: "$status",
                count: { $sum: 1 }
            }
        },
        {
            $project: {
                _id: 0,
                status: "$_id",
                count: 1
            }
        },
        {
            $sort: { status: 1 }
        }
    ]);
    return breakdown;
};
exports.getBookingStatusBreakdownService = getBookingStatusBreakdownService;
