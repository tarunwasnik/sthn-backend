"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFeatureFlagDashboard = void 0;
const featureFlagEvent_model_1 = require("../models/featureFlagEvent.model");
const getFeatureFlagDashboard = async (_req, res) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h
    const [topFlags, byRole, recentEvents,] = await Promise.all([
        // 1️⃣ Top blocked flags (last 24h)
        featureFlagEvent_model_1.FeatureFlagEvent.aggregate([
            { $match: { timestamp: { $gte: since } } },
            {
                $group: {
                    _id: "$flagKey",
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
            { $limit: 5 },
        ]),
        // 2️⃣ Blocks by role (last 24h)
        featureFlagEvent_model_1.FeatureFlagEvent.aggregate([
            { $match: { timestamp: { $gte: since } } },
            {
                $group: {
                    _id: "$role",
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
        ]),
        // 3️⃣ Most recent block events
        featureFlagEvent_model_1.FeatureFlagEvent.find({})
            .sort({ timestamp: -1 })
            .limit(10)
            .select("flagKey role userId timestamp context"),
    ]);
    return res.json({
        window: "24h",
        topBlockedFlags: topFlags.map((f) => ({
            flagKey: f._id,
            count: f.count,
        })),
        blocksByRole: byRole.map((r) => ({
            role: r._id ?? "unknown",
            count: r.count,
        })),
        recentEvents,
    });
};
exports.getFeatureFlagDashboard = getFeatureFlagDashboard;
