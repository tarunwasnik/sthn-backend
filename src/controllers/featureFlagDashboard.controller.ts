//backend/src/controllers/featureFlagDashboard.controller.ts
import { Request, Response } from "express";
import { FeatureFlagEvent } from "../models/featureFlagEvent.model";

export const getFeatureFlagDashboard = async (
  _req: Request,
  res: Response
) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h

  const [
    topFlags,
    byRole,
    recentEvents,
  ] = await Promise.all([
    // 1️⃣ Top blocked flags (last 24h)
    FeatureFlagEvent.aggregate([
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
    FeatureFlagEvent.aggregate([
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
    FeatureFlagEvent.find({})
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