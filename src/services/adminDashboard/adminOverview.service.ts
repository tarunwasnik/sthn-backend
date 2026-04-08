//backend/src/services/adminDashboard/adminOverview.service.ts


import User from "../../models/User";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { Booking } from "../../models/booking.model";

export const getAdminOverviewService = async () => {
  const now = new Date();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const last7Days = new Date();
  last7Days.setDate(now.getDate() - 7);

  const [
    totalUsers,
    usersLast7Days,

    totalCreators,
    approvedCreators,
    pendingCreators,

    totalBookings,
    bookingsLast7Days,
    bookingsToday
  ] = await Promise.all([
    // USERS
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: last7Days } }),

    // CREATORS
    CreatorProfile.countDocuments(),
    CreatorProfile.countDocuments({ status: "APPROVED" }),
    CreatorProfile.countDocuments({ status: "PENDING" }),

    // BOOKINGS
    Booking.countDocuments(),
    Booking.countDocuments({ createdAt: { $gte: last7Days } }),
    Booking.countDocuments({ createdAt: { $gte: startOfToday } })
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