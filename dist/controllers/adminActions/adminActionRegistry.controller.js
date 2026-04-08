"use strict";
//backend/src/controllers/adminActions/adminActionRegistry.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAdminActions = void 0;
const adminAsyncHandler_1 = require("../../middlewares/adminAsyncHandler");
const adminResponse_1 = require("../../utils/adminResponse");
const adminActionRegistry_service_1 = require("../../services/adminActions/adminActionRegistry.service");
exports.listAdminActions = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    const role = req.user.role;
    if (role !== "admin") {
        throw new Error("Unauthorized admin access");
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { actions, pagination } = await (0, adminActionRegistry_service_1.fetchAdminActionsForRole)(role, page, limit);
    // ✅ THIS is the missing line that unblocks Postman
    res.json((0, adminResponse_1.adminResponse)({
        data: actions,
        pagination
    }));
});
