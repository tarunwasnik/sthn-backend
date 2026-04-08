//backend/src/controllers/adminDashboard/adminStats.controller.ts

import { Request, Response } from "express";
import { getOverviewStatsService } from "../../services/adminDashboard/adminStats.service";

export const getOverviewStats = async (req: Request, res: Response) => {
  const stats = await getOverviewStatsService();
  res.json(stats);
};