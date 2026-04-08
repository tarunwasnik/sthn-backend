//backend/src/controllers/adminActions/applyCreatorCooldown.controller.ts


import { Request, Response } from "express";
import { applyCreatorCooldownService } from "../../services/adminActions/applyCreatorCooldown.service";
import { adminAsyncHandler } from "../../middlewares/adminAsyncHandler";
import { adminResponse } from "../../utils/adminResponse";

export const applyCreatorCooldown = adminAsyncHandler(
  async (req: Request, res: Response) => {
    const adminId = req.user!.id;
    const { targetId, params, reason } = req.body;

    const result = await applyCreatorCooldownService({
      adminId,
      creatorProfileId: targetId,
      days: params.days,
      reason,
    });

    res.json(
      adminResponse({
        data: result,
      })
    );
  }
);
