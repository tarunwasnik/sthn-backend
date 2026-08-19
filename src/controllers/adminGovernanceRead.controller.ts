import { Request, Response } from "express";

import { adminAsyncHandler } from "../middlewares/adminAsyncHandler";
import { adminResponse } from "../utils/adminResponse";
import { getAdminGovernanceTarget } from "../services/adminGovernanceRead.service";

export const getAdminGovernanceTargetController = adminAsyncHandler(async (req: Request, res: Response) => {
  const target = await getAdminGovernanceTarget(req.params.userId);
  res.json(adminResponse({ data: target }));
});
