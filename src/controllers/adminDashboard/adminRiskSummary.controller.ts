//backend/src/controllers/adminDashboard/adminRiskSummary.controller.ts

import { Request, Response } from "express";
import { getRiskSummaryService } from "../../services/adminDashboard/adminRiskSummary.service";

/**
 * Admin risk summary
 * Aggregated alert counts
 */
export const getRiskSummary = async (
  req: Request,
  res: Response
) => {
  const summary = await getRiskSummaryService();
  res.json(summary);
};