"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetUserTrustThroughAdminAction = exports.banUserThroughAdminAction = exports.activateUserThroughAdminAction = exports.suspendUserThroughAdminAction = void 0;
const adminAsyncHandler_1 = require("../../middlewares/adminAsyncHandler");
const adminResponse_1 = require("../../utils/adminResponse");
const adminActionDispatcher_service_1 = require("../../services/adminActions/adminActionDispatcher.service");
const adminActionError_mapper_1 = require("../../utils/adminActionError.mapper");
const executeCompatibilityAction = (key) => (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    try {
        const result = await (0, adminActionDispatcher_service_1.executeAdminActionService)({
            adminId: req.user.id, adminRole: req.user.role, key, targetId: req.params.id, params: {}, reason: req.body?.reason,
            dryRun: req.body?.dryRun === true, confirmationToken: req.body?.confirmationToken,
        });
        res.json((0, adminResponse_1.adminResponse)({ data: result }));
    }
    catch (error) {
        res.status(403).json((0, adminActionError_mapper_1.mapAdminActionError)(error));
    }
});
exports.suspendUserThroughAdminAction = executeCompatibilityAction("SUSPEND_USER");
exports.activateUserThroughAdminAction = executeCompatibilityAction("ACTIVATE_USER");
exports.banUserThroughAdminAction = executeCompatibilityAction("BAN_USER");
exports.resetUserTrustThroughAdminAction = executeCompatibilityAction("RESET_USER_TRUST");
