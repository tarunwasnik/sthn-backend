"use strict";
//backend/src/controllers/adminActions/adminActionDispatcher.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeAdminAction = void 0;
const adminAsyncHandler_1 = require("../../middlewares/adminAsyncHandler");
const adminResponse_1 = require("../../utils/adminResponse");
const adminActionDispatcher_service_1 = require("../../services/adminActions/adminActionDispatcher.service");
const adminActionError_mapper_1 = require("../../utils/adminActionError.mapper");
exports.executeAdminAction = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    try {
        const adminId = req.user.id;
        const adminRole = req.user.role; // 🔐 Phase 24 — REQUIRED
        const { key, targetId, params, reason, dryRun = false, confirmationToken, } = req.body;
        if (!key || !targetId) {
            throw new Error("Action key and targetId are required");
        }
        const result = await (0, adminActionDispatcher_service_1.executeAdminActionService)({
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
        res.json((0, adminResponse_1.adminResponse)({
            data: result,
        }));
    }
    catch (err) {
        // 🔒 Phase 22 + 24 — UI-safe error contract
        res.status(403).json((0, adminActionError_mapper_1.mapAdminActionError)(err));
    }
});
