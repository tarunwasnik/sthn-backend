//backend/src/controllers/adminActions/adminActionDispatcher.controller.ts

import { Request, Response } from "express";
import { adminAsyncHandler } from "../../middlewares/adminAsyncHandler";
import { adminResponse } from "../../utils/adminResponse";
import { executeAdminActionService } from "../../services/adminActions/adminActionDispatcher.service";
import { mapAdminActionError } from "../../utils/adminActionError.mapper";

export const executeAdminAction = adminAsyncHandler(
  async (req: Request, res: Response) => {
    try {
      const adminId = req.user!.id;
      const adminRole = req.user!.role; // 🔐 Phase 24 — REQUIRED

      const {
        key,
        targetId,
        params,
        reason,
        dryRun = false,
        confirmationToken,
      } = req.body;

      if (!key || !targetId) {
        throw new Error("Action key and targetId are required");
      }

      const result = await executeAdminActionService({
        adminId,
        adminRole,
        key,
        targetId,
        params: params || {},
        reason,
        dryRun,
        confirmationToken,
      });

      // 🔒 Phase 22 — pass-through UI contract
      res.json(
        adminResponse({
          data: result,
        })
      );
    } catch (err: any) {
      // 🔒 Phase 22 + 24 — UI-safe error contract
      res.status(403).json(mapAdminActionError(err));
    }
  }
);