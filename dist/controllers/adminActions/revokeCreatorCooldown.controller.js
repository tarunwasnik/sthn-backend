"use strict";
//backend/src/controllers/adminActions/revokeCreatorCooldown.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeCreatorCooldown = void 0;
const revokeCreatorCooldown_service_1 = require("../../services/adminActions/revokeCreatorCooldown.service");
const adminAsyncHandler_1 = require("../../middlewares/adminAsyncHandler");
const adminResponse_1 = require("../../utils/adminResponse");
exports.revokeCreatorCooldown = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    const adminId = req.user.id;
    const { targetId, reason } = req.body;
    const result = await (0, revokeCreatorCooldown_service_1.revokeCreatorCooldownService)({
        adminId,
        creatorProfileId: targetId,
        reason,
    });
    res.json((0, adminResponse_1.adminResponse)({
        data: result,
    }));
});
