//backend/src/controllers/adminActions/revokeCreatorCooldown.controller.ts

import { Request, Response } from "express";
import { revokeCreatorCooldownService } from "../../services/adminActions/revokeCreatorCooldown.service";
import { adminAsyncHandler } from "../../middlewares/adminAsyncHandler";
import { adminResponse } from "../../utils/adminResponse";

export const revokeCreatorCooldown = adminAsyncHandler(
  async (req: Request, res: Response) => {
    const adminId = req.user!.id;
    const { targetId, reason } = req.body;

    const result = await revokeCreatorCooldownService({
      adminId,
      creatorProfileId: targetId,
      reason,
    });

    res.json(
      adminResponse({
        data: result,
      })
    );
  }
);
