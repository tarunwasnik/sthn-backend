//backend/src/services/adminDashboard/adminBookings.service.ts

import { Booking } from "../../models/booking.model";

/**
 * Paginated bookings list (used by table)
 */
export const getAllBookingsService = async (
  page: number,
  limit: number
) => {
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Booking.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Booking.countDocuments()
  ]);

  return { data, total };
};

/**
 * Time-based booking trends (used by charts)
 */
export const getBookingTrendsService = async (
  days: number = 30
) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const trends = await Booking.aggregate([
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


export const getBookingStatusBreakdownService = async () => {
  const breakdown = await Booking.aggregate([
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