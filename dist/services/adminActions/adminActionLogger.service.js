"use strict";
//backend/src/services/adminActions/adminActionLogger.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAdminAction = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const adminActionLog_model_1 = __importDefault(require("../../models/adminActionLog.model"));
// Phase 28 — Resilience
const circuitBreaker_1 = require("../../utils/circuitBreaker");
const failureTaxonomy_1 = require("../../utils/failureTaxonomy");
// ----------------------------------
// Phase 28 — Circuit breaker (audit)
// ----------------------------------
const auditBreaker = new circuitBreaker_1.CircuitBreaker((0, circuitBreaker_1.createInMemoryBreakerState)(), {
    failureThreshold: 2,
    openDurationMs: 30 * 1000, // 30s cooldown
});
/**
 * Phase 24–28 — Admin Action Logger
 *
 * Resilience guarantees:
 * - FAIL_OPEN (audit must not break execution)
 * - Circuit breaker protected
 * - Self-healing after cooldown
 */
const logAdminAction = async (input) => {
    try {
        // -----------------------------
        // 🚨 Circuit breaker gate
        // -----------------------------
        if (!auditBreaker.canProceed()) {
            // FAIL_OPEN: skip audit silently
            return;
        }
        await adminActionLog_model_1.default.create({
            adminId: new mongoose_1.default.Types.ObjectId(input.adminId),
            actionKey: input.actionKey,
            actionLabel: input.actionLabel,
            actionVersion: input.actionVersion, // 🕰️ Phase 25
            targetType: input.targetType,
            targetId: new mongoose_1.default.Types.ObjectId(input.targetId),
            params: input.params,
            reason: input.reason,
            status: input.status,
            result: input.result,
            error: input.error,
            // createdAt handled by schema
        });
        // Success → close breaker if half-open
        auditBreaker.recordSuccess();
    }
    catch {
        // Record failure
        auditBreaker.recordFailure();
        // FAIL_OPEN: never block admin execution
        if ((0, failureTaxonomy_1.isFailOpen)("AUDIT_LOGGING")) {
            return;
        }
        // Defensive fallback (should never trigger)
        throw new Error("Audit logging failed");
    }
};
exports.logAdminAction = logAdminAction;
