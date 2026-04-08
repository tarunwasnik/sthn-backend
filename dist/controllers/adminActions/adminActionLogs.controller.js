"use strict";
//backend/src/controllers/adminActions/adminActionLogs.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminActionLogs = void 0;
const adminAsyncHandler_1 = require("../../middlewares/adminAsyncHandler");
const adminResponse_1 = require("../../utils/adminResponse");
const adminActionAudit_service_1 = require("../../services/adminActions/adminActionAudit.service");
/**
 * GET /api/v1/admin/actions/logs
 * Read-only admin action audit logs
 */
exports.getAdminActionLogs = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    const page = parseInt(req.query.page || "1");
    const limit = parseInt(req.query.limit || "20");
    const { adminId, actionKey, targetId, status, fromDate, toDate, } = req.query;
    const result = await (0, adminActionAudit_service_1.fetchAdminActionAuditLogs)({
        adminId: adminId,
        actionKey: actionKey,
        targetId: targetId,
        status: status,
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
        page,
        limit,
    });
    res.json((0, adminResponse_1.adminResponse)({
        data: result.logs,
        pagination: result.pagination,
    }));
});
