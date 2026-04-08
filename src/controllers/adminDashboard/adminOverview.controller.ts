//backend/src/controllers/adminDashboard/adminOverview.controller.ts

import { Request, Response } from "express";
import { getAdminOverviewService } from "../../services/adminDashboard/adminOverview.service";
import { adminResponse } from "../../utils/adminResponse";
import { adminAsyncHandler } from "../../middlewares/adminAsyncHandler";

/**
 * Admin Dashboard Overview
 * High-level platform KPIs
 */
export const getAdminOverview = adminAsyncHandler(
     async (
  req: Request,
  res: Response
) => {

  console.log("✅ NEW ADMIN OVERVIEW CONTROLLER HIT");
  const overview = await getAdminOverviewService();
  res.json(
  adminResponse({
    data: overview
  })
);
}
);
