//backend/src/controllers/adminActions/adminActionRegistry.controller.ts

import { Request, Response } from "express";
import { adminAsyncHandler } from "../../middlewares/adminAsyncHandler";
import { adminResponse } from "../../utils/adminResponse";
import { fetchAdminActionsForRole } from "../../services/adminActions/adminActionRegistry.service";

export const listAdminActions = adminAsyncHandler(
  async (req: Request, res: Response) => {
    const role = req.user!.role;

    if (role !== "admin") {
      throw new Error("Unauthorized admin access");
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const { actions, pagination } = await fetchAdminActionsForRole(role, page, limit);

    // ✅ THIS is the missing line that unblocks Postman
   res.json(
      adminResponse({
        data: actions,
        pagination
      })
    );
  }
);