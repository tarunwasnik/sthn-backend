"use strict";
//backend/src/controllers/adminActions/applyCreatorCooldown.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCreatorCooldown = void 0;
const applyCreatorCooldown_service_1 = require("../../services/adminActions/applyCreatorCooldown.service");
const adminAsyncHandler_1 = require("../../middlewares/adminAsyncHandler");
const adminResponse_1 = require("../../utils/adminResponse");
exports.applyCreatorCooldown = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    const adminId = req.user.id;
    const { targetId, params, reason } = req.body;
    const result = await (0, applyCreatorCooldown_service_1.applyCreatorCooldownService)({
        adminId,
        creatorProfileId: targetId,
        days: params.days,
        reason,
    });
    res.json((0, adminResponse_1.adminResponse)({
        data: result,
    }));
});
