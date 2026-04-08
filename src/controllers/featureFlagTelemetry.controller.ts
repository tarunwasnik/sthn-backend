//backend/src/controllers/featureFlagTelemetry.controller.ts
import { Request, Response } from "express";
import { FeatureFlagEvent } from "../models/featureFlagEvent.model";

export const getFeatureFlagEvents = async (
  req: Request,
  res: Response
) => {
  const {
    flagKey,
    role,
    userId,
    from,
    to,
    limit = 50,
    page = 1,
  } = req.query as Record<string, string>;

  const query: any = {};

  if (flagKey) query.flagKey = flagKey;
  if (role) query.role = role;
  if (userId) query.userId = userId;

  if (from || to) {
    query.timestamp = {};
    if (from) query.timestamp.$gte = new Date(from);
    if (to) query.timestamp.$lte = new Date(to);
  }

  const pageNum = Math.max(Number(page), 1);
  const pageSize = Math.min(Number(limit), 100);

  const [events, total] = await Promise.all([
    FeatureFlagEvent.find(query)
      .sort({ timestamp: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize),
    FeatureFlagEvent.countDocuments(query),
  ]);

  return res.json({
    data: events,
    meta: {
      page: pageNum,
      limit: pageSize,
      total,
    },
  });
};