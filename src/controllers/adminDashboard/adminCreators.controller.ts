//backend/src/controllers/adminDashboard/adminCreators.controller.ts

import { adminAsyncHandler } from "../../middlewares/adminAsyncHandler";
import { adminResponse } from "../../utils/adminResponse";
import { Request, Response } from "express";
import {
  getAllCreatorsService,
  getCreatorPerformanceService
} from "../../services/adminDashboard/adminCreators.service";

export const getAllCreators = adminAsyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;

  const { data, total } = await getAllCreatorsService(page, limit);

  res.json(
  adminResponse({
    data,
    pagination: {
      page,
      limit,
      total
    }
  })
);
  }
);

/**
 * Creator performance metrics
 */
export const getCreatorPerformance = async (
  req: Request,
  res: Response
) => {
  const data = await getCreatorPerformanceService();
  res.json(data);
};