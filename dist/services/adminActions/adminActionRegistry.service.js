"use strict";
//backend/src/services/adminActions/adminActionRegistry.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminActionDefinition = exports.fetchAdminActionsForRole = void 0;
const adminActionRegistry_1 = require("../../admin/actions/adminActionRegistry");
const normalizeRiskLevel = (action) => ({
    ...action,
    riskLevel: action.riskLevel ?? "low",
});
const fetchAdminActionsForRole = (role, page, limit) => {
    const allActions = (0, adminActionRegistry_1.getActionsForRole)(role).map(normalizeRiskLevel);
    const total = allActions.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const actions = allActions.slice(start, end);
    return {
        actions,
        pagination: {
            page,
            limit,
            total,
        },
    };
};
exports.fetchAdminActionsForRole = fetchAdminActionsForRole;
const getAdminActionDefinition = async (key) => {
    const allActions = (0, adminActionRegistry_1.getActionsForRole)("admin").map(normalizeRiskLevel);
    return allActions.find((action) => action.key === key);
};
exports.getAdminActionDefinition = getAdminActionDefinition;
