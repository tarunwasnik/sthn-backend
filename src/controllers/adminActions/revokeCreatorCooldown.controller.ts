//backend/src/controllers/adminActions/revokeCreatorCooldown.controller.ts

import { Request, Response } from "express";
import { executeAdminActionService } from "../../services/adminActions/adminActionDispatcher.service";
import { mapAdminActionError } from "../../utils/adminActionError.mapper";
import { adminAsyncHandler } from "../../middlewares/adminAsyncHandler";
import { adminResponse } from "../../utils/adminResponse";

export const revokeCreatorCooldown = adminAsyncHandler(
  async (req: Request, res: Response) => {
    try {
      const { targetId, reason, dryRun = false, confirmationToken } = req.body;
      const result = await executeAdminActionService({ adminId: req.user!.id, adminRole: req.user!.role, key: "REVOKE_CREATOR_COOLDOWN", targetId, params: {}, reason, dryRun, confirmationToken });
      res.json(adminResponse({ data: result }));
    } catch (error) { res.status(403).json(mapAdminActionError(error)); }
  }
);
