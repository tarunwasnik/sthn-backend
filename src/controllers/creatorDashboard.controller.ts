// backend/src/controllers/creatorDashboard.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { CreatorProfile } from "../models/creatorProfile.model";
import { Booking } from "../models/booking.model";
import { AppError } from "../utils/AppError";

/**
 * GET /api/v1/creator/dashboard
 */
export const getCreatorDashboard = async (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError("Unauthorized", 401);
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  /* ================= CREATOR PROFILE ================= */

  const creatorProfile = await CreatorProfile.findOne({
    userId: userObjectId,
  }).lean();

  if (!creatorProfile) {
    throw new AppError("Creator profile not found", 404);
  }

  if (creatorProfile.status !== "active") {
    throw new AppError("Creator profile is not active", 403);
  }

  /* ================= BOOKING STATS ================= */

  const [totalBookings, pendingBookings, completedBookings] =
    await Promise.all([
      Booking.countDocuments({ creatorId: userObjectId }),

      Booking.countDocuments({
        creatorId: userObjectId,
        status: "REQUESTED",
      }),

      Booking.countDocuments({
        creatorId: userObjectId,
        status: "COMPLETED",
      }),
    ]);

  /* ================= RECENT BOOKINGS ================= */

  const recentBookings = await Booking.find({
    creatorId: userObjectId,
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .select(
      "status paymentStatus creatorEarningSnapshot createdAt"
    )
    .lean();

  /* ================= MTD EARNINGS ================= */

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const earningsResult = await Booking.aggregate([
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
        total: { $sum: "$creatorEarningSnapshot" },
      },
    },
  ]);

  const mtdEarnings =
    earningsResult.length > 0 ? earningsResult[0].total : 0;

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
      earning: booking.creatorEarningSnapshot ?? 0,
      createdAt: booking.createdAt,
    })),
  });
};