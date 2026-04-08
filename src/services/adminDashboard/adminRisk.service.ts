//backend/src/services/adminDashboard/adminRisk.service.ts


import { Booking } from "../../models/booking.model";
import User from "../../models/User";

export const getHighRiskCreatorsService = async () => {
  const now = new Date();

  const riskyCreators = await Booking.aggregate([
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

    /* 2️⃣ Compute cancellation rate */
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

    /* 3️⃣ Join User (identity + abuseScore + cooldowns) */
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user"
      }
    },
    { $unwind: "$user" },

    /* 4️⃣ Apply risk filters */
    {
      $match: {
        $or: [
          { cancellationRate: { $gte: 20 } },
          { "user.abuseScore": { $gte: 5 } },
          { "user.creatorCooldownUntil": { $gt: now } }
        ]
      }
    },

    /* 5️⃣ Build risk reasons */
    {
      $addFields: {
        riskReasons: {
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

    /* 6️⃣ Final shape */
    {
      $project: {
        _id: 0,
        creatorId: "$_id",
        name: "$user.name",
        email: "$user.email",
        abuseScore: "$user.abuseScore",
        cooldownUntil: "$user.creatorCooldownUntil",
        cancellationRate: 1,
        riskReasons: 1
      }
    },

    { $sort: { cancellationRate: -1 } }
  ]);

  return riskyCreators;
};