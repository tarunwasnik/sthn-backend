//backend/src/controllers/adminActions/adminActionLogs.controller.ts

import { Request, Response } from "express";
import { adminAsyncHandler } from "../../middlewares/adminAsyncHandler";
import { adminResponse } from "../../utils/adminResponse";
import { fetchAdminActionAuditLogs } from "../../services/adminActions/adminActionAudit.service";

/**
 * GET /api/v1/admin/actions/logs
 * Read-only admin action audit logs
 */
export const getAdminActionLogs = adminAsyncHandler(
  async (req: Request, res: Response) => {
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "20");

    const {
      adminId,
      actionKey,
      targetId,
      status,
      fromDate,
      toDate,
    } = req.query;

    const result = await fetchAdminActionAuditLogs({
      adminId: adminId as string | undefined,
      actionKey: actionKey as string | undefined,
      targetId: targetId as string | undefined,
      status: status as "SUCCESS" | "FAILED" | undefined,
      fromDate: fromDate ? new Date(fromDate as string) : undefined,
      toDate: toDate ? new Date(toDate as string) : undefined,
      page,
      limit,
    });

    res.json(
      adminResponse({
        data: result.logs,
        pagination: result.pagination,
      })
    );
  }
);