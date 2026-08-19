import { Request, Response } from "express";

import { adminAsyncHandler } from "../../middlewares/adminAsyncHandler";
import { adminResponse } from "../../utils/adminResponse";
import { executeAdminActionService } from "../../services/adminActions/adminActionDispatcher.service";
import { mapAdminActionError } from "../../utils/adminActionError.mapper";

type GovernanceActionKey = "SUSPEND_USER" | "ACTIVATE_USER" | "BAN_USER" | "RESET_USER_TRUST";

const executeCompatibilityAction = (key: GovernanceActionKey) => adminAsyncHandler(async (req: Request, res: Response) => {
  try {
    const result = await executeAdminActionService({
      adminId: req.user!.id, adminRole: req.user!.role, key, targetId: req.params.id, params: {}, reason: req.body?.reason,
      dryRun: req.body?.dryRun === true, confirmationToken: req.body?.confirmationToken,
    });
    res.json(adminResponse({ data: result }));
  } catch (error) {
    res.status(403).json(mapAdminActionError(error));
  }
});

export const suspendUserThroughAdminAction = executeCompatibilityAction("SUSPEND_USER");
export const activateUserThroughAdminAction = executeCompatibilityAction("ACTIVATE_USER");
export const banUserThroughAdminAction = executeCompatibilityAction("BAN_USER");
export const resetUserTrustThroughAdminAction = executeCompatibilityAction("RESET_USER_TRUST");
