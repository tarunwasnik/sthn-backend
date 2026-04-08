"use strict";
//backend/src/services/adminActions/adminActionLogs.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAdminActionLogsService = void 0;
const adminActionLog_model_1 = __importDefault(require("../../models/adminActionLog.model"));
const fetchAdminActionLogsService = async ({ page, limit, adminId, targetId, actionKey, status, }) => {
    const query = {};
    if (adminId)
        query.adminId = adminId;
    if (targetId)
        query.targetId = targetId;
    if (actionKey)
        query.actionKey = actionKey;
    if (status)
        query.status = status;
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
        adminActionLog_model_1.default.find(query)
            .sort({ executedAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("adminId", "name email")
            .lean(),
        adminActionLog_model_1.default.countDocuments(query),
    ]);
    return {
        logs,
        pagination: {
            page,
            limit,
            total,
        },
    };
};
exports.fetchAdminActionLogsService = fetchAdminActionLogsService;
