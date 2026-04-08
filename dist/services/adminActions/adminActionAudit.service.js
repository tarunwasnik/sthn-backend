"use strict";
//backend/src/services/adminActions/adminActionAudit.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditAdminThrottle = exports.fetchAdminActionAuditLogs = void 0;
const adminActionLog_model_1 = __importDefault(require("../../models/adminActionLog.model"));
const mongoose_1 = __importDefault(require("mongoose"));
const fetchAdminActionAuditLogs = async ({ adminId, actionKey, targetId, status, fromDate, toDate, page, limit, }) => {
    const query = {};
    if (adminId) {
        query.adminId = new mongoose_1.default.Types.ObjectId(adminId);
    }
    if (actionKey) {
        query.actionKey = actionKey;
    }
    if (targetId) {
        query.targetId = new mongoose_1.default.Types.ObjectId(targetId);
    }
    if (status) {
        query.status = status;
    }
    if (fromDate || toDate) {
        query.createdAt = {};
        if (fromDate)
            query.createdAt.$gte = fromDate;
        if (toDate)
            query.createdAt.$lte = toDate;
    }
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
        adminActionLog_model_1.default.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
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
exports.fetchAdminActionAuditLogs = fetchAdminActionAuditLogs;
/**
 * Phase 27 — Audit admin throttling decisions
 *
 * Throttling is a system decision, not an admin action.
 */
const auditAdminThrottle = async ({ adminId, reason, throttledUntil, }) => {
    await adminActionLog_model_1.default.create({
        adminId: new mongoose_1.default.Types.ObjectId(adminId),
        actionKey: "SYSTEM_ADMIN_THROTTLE",
        status: "BLOCKED",
        result: {
            reason,
            throttledUntil,
        },
    });
};
exports.auditAdminThrottle = auditAdminThrottle;
