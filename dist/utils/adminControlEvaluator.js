"use strict";
//backend/src/utils/adminControlEvaluator.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateAdminControls = void 0;
/**
 * Evaluate active admin controls and return a single decision.
 */
const evaluateAdminControls = (controls, context) => {
    // -----------------------------
    // 1️⃣ GLOBAL CONTROLS
    // -----------------------------
    const globalControls = controls.filter((c) => c.scope === "GLOBAL");
    if (globalControls.length > 0) {
        // Most recent global control wins
        const latest = globalControls.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        switch (latest.mode) {
            case "ADMIN_ACTIONS_DISABLED":
                return {
                    decision: "BLOCK",
                    reason: latest.reason,
                };
            case "DRY_RUN_ONLY":
                if (!context.dryRun) {
                    return {
                        decision: "FORCE_DRY_RUN",
                        reason: latest.reason,
                    };
                }
                break;
            case "READ_ONLY":
                if (context.riskLevel !== "low") {
                    return {
                        decision: "BLOCK",
                        reason: latest.reason,
                    };
                }
                break;
            case "NORMAL":
            default:
                break;
        }
    }
    // -----------------------------
    // 2️⃣ ACTION-LEVEL CONTROLS
    // -----------------------------
    const actionControls = controls.filter((c) => c.scope === "ACTION" &&
        c.actionKey === context.actionKey);
    if (actionControls.length > 0) {
        const latest = actionControls.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        switch (latest.mode) {
            case "DISABLED":
                return {
                    decision: "BLOCK",
                    reason: latest.reason,
                };
            case "DRY_RUN_ONLY":
                if (!context.dryRun) {
                    return {
                        decision: "FORCE_DRY_RUN",
                        reason: latest.reason,
                    };
                }
                break;
            default:
                break;
        }
    }
    // -----------------------------
    // 3️⃣ EMERGENCY CONTROLS
    // -----------------------------
    const emergencyControls = controls.filter((c) => c.scope === "EMERGENCY");
    for (const control of emergencyControls) {
        const applies = control.appliesTo === "ALL" ||
            (control.appliesTo === "HIGH_RISK" &&
                (context.riskLevel === "high" ||
                    context.riskLevel === "critical"));
        if (!applies)
            continue;
        switch (control.mode) {
            case "BLOCK":
                return {
                    decision: "BLOCK",
                    reason: control.reason,
                };
            case "DRY_RUN_ONLY":
                if (!context.dryRun) {
                    return {
                        decision: "FORCE_DRY_RUN",
                        reason: control.reason,
                    };
                }
                break;
            default:
                break;
        }
    }
    // -----------------------------
    // ✅ ALLOW
    // -----------------------------
    return { decision: "ALLOW" };
};
exports.evaluateAdminControls = evaluateAdminControls;
