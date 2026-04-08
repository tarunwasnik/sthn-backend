"use strict";
//backend/src/controllers/adminDashboard/adminBookings.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBookingStatusBreakdown = exports.getBookingTrends = exports.getAllBookings = void 0;
const adminAsyncHandler_1 = require("../../middlewares/adminAsyncHandler");
const adminResponse_1 = require("../../utils/adminResponse");
const adminBookings_service_1 = require("../../services/adminDashboard/adminBookings.service");
/**
 * Paginated bookings list
 */
exports.getAllBookings = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const { data, total } = await (0, adminBookings_service_1.getAllBookingsService)(page, limit);
    res.json((0, adminResponse_1.adminResponse)({
        data,
        pagination: {
            page,
            limit,
            total
        }
    }));
});
/**
 * Time-based booking trends
 */
exports.getBookingTrends = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    const days = Number(req.query.days) || 30;
    const trends = await (0, adminBookings_service_1.getBookingTrendsService)(days);
    res.json((0, adminResponse_1.adminResponse)({
        data: trends
    }));
});
/**
 * Booking status breakdown (for stacked charts)
 */
exports.getBookingStatusBreakdown = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    const breakdown = await (0, adminBookings_service_1.getBookingStatusBreakdownService)();
    res.json((0, adminResponse_1.adminResponse)({
        data: breakdown
    }));
});
