//backend/src/services/adminDashboard/adminStats.service.ts


import User from "../../models/User";

export const getOverviewStatsService = async () => {
  const [result] = await User.aggregate([
    {
      $facet: {
        users: [
          { $match: { role: "user" } },
          { $count: "count" }
        ],
        creators: [
          {
            $lookup: {
              from: "creatorprofiles",
              pipeline: [{ $count: "count" }],
              as: "data"
            }
          },
          {
            $project: {
              count: { $ifNull: [{ $arrayElemAt: ["$data.count", 0] }, 0] }
            }
          }
        ],
        bookings: [
          {
            $lookup: {
              from: "bookings",
              pipeline: [{ $count: "count" }],
              as: "data"
            }
          },
          {
            $project: {
              count: { $ifNull: [{ $arrayElemAt: ["$data.count", 0] }, 0] }
            }
          }
        ]
      }
    },
    {
      $project: {
        totalUsers: { $ifNull: [{ $arrayElemAt: ["$users.count", 0] }, 0] },
        totalCreators: { $ifNull: [{ $arrayElemAt: ["$creators.count", 0] }, 0] },
        totalBookings: { $ifNull: [{ $arrayElemAt: ["$bookings.count", 0] }, 0] }
      }
    }
  ]);

  return result;
};