//backend/src/controllers/adminDashboard/adminRisk.controller.ts

import { Request, Response } from "express";
import { getHighRiskCreatorsService } from "../../services/adminDashboard/adminRisk.service";

/**
 * High-risk creators overview
 * Read-only admin visibility
 */
export const getHighRiskCreators = async (
  req: Request,
  res: Response
) => {
  const data = await getHighRiskCreatorsService();
  res.json(data);
};