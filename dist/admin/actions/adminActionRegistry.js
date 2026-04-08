"use strict";
//backend/src/admin/actions/adminActionRegistry.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActionByKey = exports.getActionsForRole = exports.ADMIN_ACTIONS = void 0;
exports.ADMIN_ACTIONS = [
    {
        key: "APPLY_CREATOR_COOLDOWN",
        label: "Apply creator cooldown",
        targetType: "creator",
        allowedRoles: ["admin"],
        riskLevel: "medium",
        requiresReason: true,
        policy: {
            allowedRoles: ["admin"],
            allowDryRun: true,
            allowExecute: true,
        },
        version: 1,
        params: [
            {
                name: "days",
                type: "number",
                required: true,
                description: "Number of days to apply cooldown",
            },
        ],
    },
    {
        key: "REVOKE_CREATOR_COOLDOWN",
        label: "Revoke creator cooldown",
        targetType: "creator",
        allowedRoles: ["admin"],
        riskLevel: "medium",
        requiresReason: true,
        policy: {
            allowedRoles: ["admin"],
            allowDryRun: true,
            allowExecute: true,
        },
        version: 1,
        params: [],
    },
];
const getActionsForRole = (role) => {
    // ⚠️ Phase 24 note:
    // Still uses legacy allowedRoles.
    // Dispatcher enforces policy + version rules.
    return exports.ADMIN_ACTIONS.filter((action) => action.allowedRoles.includes(role));
};
exports.getActionsForRole = getActionsForRole;
const getActionByKey = (key) => {
    return exports.ADMIN_ACTIONS.find((action) => action.key === key);
};
exports.getActionByKey = getActionByKey;
