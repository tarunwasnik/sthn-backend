//backend/src/controllers/adminActions/applyCreatorCooldown.controller.ts


import { Request, Response } from "express";
import { executeAdminActionService } from "../../services/adminActions/adminActionDispatcher.service";
import { mapAdminActionError } from "../../utils/adminActionError.mapper";
import { adminAsyncHandler } from "../../middlewares/adminAsyncHandler";
import { adminResponse } from "../../utils/adminResponse";

export const applyCreatorCooldown = adminAsyncHandler(
  async (req: Request, res: Response) => {
    try {
      const { targetId, params, reason, dryRun = false, confirmationToken } = req.body;
      const result = await executeAdminActionService({ adminId: req.user!.id, adminRole: req.user!.role, key: "APPLY_CREATOR_COOLDOWN", targetId, params: params ?? {}, reason, dryRun, confirmationToken });
      res.json(adminResponse({ data: result }));
    } catch (error) { res.status(403).json(mapAdminActionError(error)); }
  }
);
