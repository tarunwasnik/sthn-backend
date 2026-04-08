//backend/src/services/adminDashboard/adminRiskSummary.service.ts


import { Booking } from "../../models/booking.model";
import User from "../../models/User";

export const getRiskSummaryService = async () => {
  const now = new Date();

  const results = await Booking.aggregate([
    /* 1️⃣ Group bookings by creator */
    {
      $group: {
        _id: "$creatorId",
        totalBookings: { $sum: 1 },
        cancelled: {
          $sum: {
            $cond: [{ $eq: ["$status", "CANCELLED"] }, 1, 0]
          }
        }
      }
    },

    /* 2️⃣ Cancellation rate */
    {
      $addFields: {
        cancellationRate: {
          $cond: [
            { $eq: ["$totalBookings", 0] },
            0,
            {
              $multiply: [
                { $divide: ["$cancelled", "$totalBookings"] },
                100
              ]
            }
          ]
        }
      }
    },

    /* 3️⃣ Join user */
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user"
      }
    },
    { $unwind: "$user" },

    /* 4️⃣ Flag reasons */
    {
      $addFields: {
        reasons: {
          $setUnion: [
            {
              $cond: [
                { $gte: ["$cancellationRate", 20] },
                ["HIGH_CANCELLATION"],
                []
              ]
            },
            {
              $cond: [
                { $gte: ["$user.abuseScore", 5] },
                ["ABUSE_SCORE"],
                []
              ]
            },
            {
              $cond: [
                { $gt: ["$user.creatorCooldownUntil", now] },
                ["ACTIVE_COOLDOWN"],
                []
              ]
            }
          ]
        }
      }
    },

    /* 5️⃣ Keep only risky creators */
    {
      $match: {
        reasons: { $ne: [] }
      }
    },

    /* 6️⃣ Flatten reasons for counting */
    { $unwind: "$reasons" },

    /* 7️⃣ Count per reason */
    {
      $group: {
        _id: "$reasons",
        count: { $sum: 1 }
      }
    }
  ]);

  const summary = {
    totalHighRiskCreators: 0,
    reasons: {} as Record<string, number>
  };

  results.forEach(r => {
    summary.reasons[r._id] = r.count;
    summary.totalHighRiskCreators += r.count;
  });

  return summary;
};