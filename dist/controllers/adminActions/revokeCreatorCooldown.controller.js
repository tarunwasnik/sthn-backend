"use strict";
//backend/src/controllers/adminActions/revokeCreatorCooldown.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeCreatorCooldown = void 0;
const adminActionDispatcher_service_1 = require("../../services/adminActions/adminActionDispatcher.service");
const adminActionError_mapper_1 = require("../../utils/adminActionError.mapper");
const adminAsyncHandler_1 = require("../../middlewares/adminAsyncHandler");
const adminResponse_1 = require("../../utils/adminResponse");
exports.revokeCreatorCooldown = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    try {
        const { targetId, reason, dryRun = false, confirmationToken } = req.body;
        const result = await (0, adminActionDispatcher_service_1.executeAdminActionService)({ adminId: req.user.id, adminRole: req.user.role, key: "REVOKE_CREATOR_COOLDOWN", targetId, params: {}, reason, dryRun, confirmationToken });
        res.json((0, adminResponse_1.adminResponse)({ data: result }));
    }
    catch (error) {
        res.status(403).json((0, adminActionError_mapper_1.mapAdminActionError)(error));
    }
});
