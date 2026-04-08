"use strict";
//backend/src/services/adminDashboard/adminStats.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOverviewStatsService = void 0;
const User_1 = __importDefault(require("../../models/User"));
const getOverviewStatsService = async () => {
    const [result] = await User_1.default.aggregate([
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
exports.getOverviewStatsService = getOverviewStatsService;
