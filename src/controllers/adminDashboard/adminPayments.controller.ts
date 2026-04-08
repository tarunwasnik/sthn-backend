//backend/src/controllers/adminDashboard/admminPayments.Controller.ts

import { Request, Response } from "express";
import { getAllPaymentsService } from "../../services/adminDashboard/adminPayments.service";
import { adminAsyncHandler } from "../../middlewares/adminAsyncHandler";
import { adminResponse } from "../../utils/adminResponse";

/**
 * Admin payments list (placeholder-safe)
 * Pagination-ready even if empty
 */
export const getAllPayments = adminAsyncHandler(
  async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const payments = await getAllPaymentsService();

    // Since payments are not implemented yet
    const total = Array.isArray(payments) ? payments.length : 0;

    res.json(
  adminResponse({
    data : payments,
    pagination: {
      page,
      limit,
      total
    }
  })
);
  }
);