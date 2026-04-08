//backend/src/controllers/adminDashboard/adminBookings.controller.ts

import { Request, Response } from "express";
import { adminAsyncHandler } from "../../middlewares/adminAsyncHandler";
import { adminResponse } from "../../utils/adminResponse";
import {
  getAllBookingsService,
  getBookingTrendsService,
  getBookingStatusBreakdownService
} from "../../services/adminDashboard/adminBookings.service";

/**
 * Paginated bookings list
 */
export const getAllBookings = adminAsyncHandler(
  async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const { data, total } = await getAllBookingsService(page, limit);

    res.json(
      adminResponse({
        data,
        pagination: {
          page,
          limit,
          total
        }
      })
    );
  }
);

/**
 * Time-based booking trends
 */
export const getBookingTrends = adminAsyncHandler(
  async (req: Request, res: Response) => {
    const days = Number(req.query.days) || 30;

    const trends = await getBookingTrendsService(days);

    res.json(
      adminResponse({
        data: trends
      })
    );
  }
);

/**
 * Booking status breakdown (for stacked charts)
 */
export const getBookingStatusBreakdown = adminAsyncHandler(
  async (req: Request, res: Response) => {
    const breakdown = await getBookingStatusBreakdownService();

    res.json(
      adminResponse({
        data: breakdown
      })
    );
  }
);