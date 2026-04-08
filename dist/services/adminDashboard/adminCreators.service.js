"use strict";
//backend/src/services/adminDashboard/adminCreator.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCreatorPerformanceService = exports.getAllCreatorsService = void 0;
const creatorProfile_model_1 = require("../../models/creatorProfile.model");
const booking_model_1 = require("../../models/booking.model");
const getAllCreatorsService = async (page, limit) => {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
        creatorProfile_model_1.CreatorProfile.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        creatorProfile_model_1.CreatorProfile.countDocuments()
    ]);
    return { data, total };
};
exports.getAllCreatorsService = getAllCreatorsService;
const getCreatorPerformanceService = async () => {
    const performance = await booking_model_1.Booking.aggregate([
        /* 1️⃣ Group bookings by creator (User) */
        {
            $group: {
                _id: "$creatorId",
                totalBookings: { $sum: 1 },
                completed: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "CONFIRMED"] }, 1, 0]
                    }
                },
                cancelled: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "CANCELLED"] }, 1, 0]
                    }
                },
                pending: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "REQUESTED"] }, 1, 0]
                    }
                }
            }
        },
        /* 2️⃣ Compute cancellation rate */
        {
            $project: {
                creatorId: "$_id",
                totalBookings: 1,
                completed: 1,
                cancelled: 1,
                pending: 1,
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
        /* 3️⃣ Join USER directly (authoritative identity) */
        {
            $lookup: {
                from: "users",
                localField: "creatorId",
                foreignField: "_id",
                as: "user"
            }
        },
        {
            $unwind: "$user"
        },
        /* 4️⃣ OPTIONAL join CreatorProfile (decorative) */
        {
            $lookup: {
                from: "creatorprofiles",
                localField: "creatorId",
                foreignField: "userid",
                as: "creatorProfile"
            }
        },
        /* 5️⃣ Add display + risk */
        {
            $addFields: {
                name: "$user.name",
                email: "$user.email",
                creatorStatus: {
                    $ifNull: [
                        { $arrayElemAt: ["$creatorProfile.status", 0] },
                        "NOT_CREATED"
                    ]
                },
                riskLevel: {
                    $cond: [
                        { $gte: ["$cancellationRate", 15] },
                        "high",
                        {
                            $cond: [
                                { $gte: ["$cancellationRate", 5] },
                                "medium",
                                "low"
                            ]
                        }
                    ]
                }
            }
        },
        {
            $project: {
                _id: 0,
                user: 0,
                creatorProfile: 0
            }
        },
        {
            $sort: { totalBookings: -1 }
        }
    ]);
    return performance;
};
exports.getCreatorPerformanceService = getCreatorPerformanceService;
