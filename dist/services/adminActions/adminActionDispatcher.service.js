"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeAdminActionService = void 0;
const adminActionRegistry_service_1 = require("./adminActionRegistry.service");
const applyCreatorCooldown_service_1 = require("./applyCreatorCooldown.service");
const revokeCreatorCooldown_service_1 = require("./revokeCreatorCooldown.service");
const adminActionLogger_service_1 = require("./adminActionLogger.service");
const adminActionValidator_1 = require("./adminActionValidator");
const confirmationToken_util_1 = require("./confirmationToken.util");
const adminActionExecution_model_1 = __importDefault(require("../../models/adminActionExecution.model"));
const idempotencyKey_util_1 = require("./idempotencyKey.util");
// Phase 27 — Admin Throttling
const adminThrottle_model_1 = require("../../models/adminThrottle.model");
const adminActionMetrics_service_1 = require("./adminActionMetrics.service");
// Phase 29 — Operator Controls
const adminControl_model_1 = require("../../models/adminControl.model");
const adminControlEvaluator_1 = require("../../utils/adminControlEvaluator");
// Phase 30.4 — Feature Flag Evaluation
const featureFlagEvaluator_service_1 = require("../controlPlane/featureFlagEvaluator.service");
/**
 * Phase 28 — Dispatcher timeout utility
 * Fail-fast, deterministic
 */
const withTimeout = async (promise, ms, label) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT: ${label}`)), ms)),
    ]);
};
const executeAdminActionService = async ({ adminId, adminRole, key, targetId, params, reason, dryRun = false, confirmationToken, }) => {
    // ==========================
    // 1️⃣ LOAD ACTION DEFINITION (FAIL CLOSED)
    // ==========================
    const action = await withTimeout((0, adminActionRegistry_service_1.getAdminActionDefinition)(key), 500, "LOAD_ACTION_DEFINITION");
    if (!action) {
        throw new Error(`Unknown admin action: ${key}`);
    }
    // ==========================
    // 🧭 PHASE 29 — OPERATOR CONTROLS (FAIL CLOSED)
    // ==========================
    const activeControls = await withTimeout(adminControl_model_1.AdminControl.find({}), 500, "LOAD_ADMIN_CONTROLS");
    const controlDecision = (0, adminControlEvaluator_1.evaluateAdminControls)(activeControls, {
        actionKey: key,
        riskLevel: action.riskLevel,
        dryRun,
    });
    if (controlDecision.decision === "BLOCK") {
        (0, adminActionMetrics_service_1.emitAdminActionMetric)({
            type: "ACTION_BLOCKED",
            timestamp: Date.now(),
            adminId,
            adminRole,
            actionKey: key,
            actionVersion: action.version,
            riskLevel: action.riskLevel,
            targetId,
            dryRun,
            outcome: "BLOCKED",
            reason: controlDecision.reason,
        });
        await (0, adminActionLogger_service_1.logAdminAction)({
            adminId,
            actionKey: "SYSTEM_ADMIN_CONTROL",
            actionLabel: "Admin action blocked by operator control",
            actionVersion: 1,
            targetType: "SYSTEM",
            targetId,
            params: {},
            reason: controlDecision.reason,
            status: "FAILED",
        });
        throw new Error(`ADMIN_CONTROL_BLOCKED: ${controlDecision.reason}`);
    }
    if (controlDecision.decision === "FORCE_DRY_RUN") {
        dryRun = true;
    }
    // ==========================
    // 🚨 PHASE 27 — ADMIN THROTTLING (FAIL CLOSED)
    // ==========================
    const activeThrottles = await withTimeout(adminThrottle_model_1.AdminThrottle.find({
        adminId,
        throttleUntil: { $gt: new Date() },
    }).sort({ throttleUntil: -1 }), 500, "THROTTLE_LOOKUP");
    if (activeThrottles.length > 0) {
        const throttle = activeThrottles[0];
        (0, adminActionMetrics_service_1.emitAdminActionMetric)({
            type: "ACTION_BLOCKED",
            timestamp: Date.now(),
            adminId,
            adminRole,
            actionKey: key,
            actionVersion: action.version,
            riskLevel: action.riskLevel,
            targetId,
            dryRun,
            outcome: "BLOCKED",
            reason: "ADMIN_THROTTLED",
        });
        throw new Error(`ADMIN_THROTTLED: ${throttle.reason} (until ${throttle.throttleUntil.toISOString()})`);
    }
    // ==========================
    // 🧯 PHASE 30.4 — FEATURE FLAG KILL SWITCH (FAIL CLOSED)
    // ==========================
    const adminActionsEnabled = await featureFlagEvaluator_service_1.FeatureFlagEvaluator.isEnabled("ADMIN_ACTIONS_ENABLED", { role: adminRole });
    if (!adminActionsEnabled) {
        (0, adminActionMetrics_service_1.emitAdminActionMetric)({
            type: "ACTION_BLOCKED",
            timestamp: Date.now(),
            adminId,
            adminRole,
            actionKey: key,
            actionVersion: action.version,
            riskLevel: action.riskLevel,
            targetId,
            dryRun,
            outcome: "BLOCKED",
            reason: "FEATURE_FLAG_DISABLED",
        });
        throw new Error("ADMIN_ACTIONS_DISABLED_BY_FEATURE_FLAG");
    }
    // ==========================
    // 🕰️ PHASE 25 — DEPRECATION
    // ==========================
    const now = Date.now();
    let deprecationInfo = null;
    if (action.deprecated) {
        const { message, sunsetAt } = action.deprecated;
        deprecationInfo = { message, sunsetAt };
        if (!dryRun && sunsetAt) {
            if (now >= new Date(sunsetAt).getTime()) {
                throw new Error(`ACTION_DEPRECATED: ${message}${sunsetAt ? ` (sunset at ${sunsetAt})` : ""}`);
            }
        }
    }
    // ==========================
    // 🔐 PHASE 24 — POLICY
    // ==========================
    const policy = action.policy;
    if (!policy.allowedRoles.includes(adminRole)) {
        throw new Error("POLICY_DENIED: role not allowed for this action");
    }
    if (dryRun && policy.allowDryRun === false) {
        throw new Error("POLICY_DENIED: dry run not allowed for this action");
    }
    if (!dryRun && policy.allowExecute === false) {
        throw new Error("POLICY_DENIED: execution not allowed for this action");
    }
    // ==========================
    // 2️⃣ REASON + PARAM VALIDATION
    // ==========================
    if (action.requiresReason && !reason) {
        throw new Error("This action requires a reason");
    }
    const validation = (0, adminActionValidator_1.validateAdminActionParams)(action, params);
    if (!validation.ok) {
        throw new Error(validation.error);
    }
    const paramsHash = (0, confirmationToken_util_1.hashParams)(params);
    // ==========================
    // 🔐 CONFIRMATION
    // ==========================
    if (!dryRun && action.riskLevel !== "low") {
        if (!confirmationToken) {
            throw new Error("Confirmation token required for this admin action");
        }
        (0, confirmationToken_util_1.verifyConfirmationToken)({
            token: confirmationToken,
            adminId,
            actionKey: action.key,
            actionVersion: action.version,
            targetId,
            paramsHash,
        });
    }
    // ==========================
    // 🔐 IDEMPOTENCY
    // ==========================
    let executionRecord = null;
    if (!dryRun) {
        const idempotencyKey = (0, idempotencyKey_util_1.createIdempotencyKey)({
            adminId,
            actionKey: action.key,
            actionVersion: action.version,
            targetId,
            paramsHash,
        });
        try {
            executionRecord = await adminActionExecution_model_1.default.create({
                idempotencyKey,
                adminId,
                actionKey: action.key,
                targetId,
                status: "IN_PROGRESS",
            });
        }
        catch (err) {
            if (err.code === 11000) {
                const existing = await adminActionExecution_model_1.default.findOne({
                    idempotencyKey,
                });
                if (existing?.status === "EXECUTED") {
                    return {
                        outcome: "EXECUTED",
                        action: action.key,
                        summary: "Action already executed",
                    };
                }
                if (existing?.status === "IN_PROGRESS") {
                    throw new Error("This admin action is already in progress");
                }
            }
            throw err;
        }
    }
    // ==========================
    // 3️⃣ DISPATCH TO SERVICE
    // ==========================
    let rawResult;
    switch (key) {
        case "APPLY_CREATOR_COOLDOWN":
            rawResult = await (0, applyCreatorCooldown_service_1.applyCreatorCooldownService)({
                adminId,
                creatorProfileId: targetId,
                days: params.days,
                reason,
                dryRun,
            });
            break;
        case "REVOKE_CREATOR_COOLDOWN":
            rawResult = await (0, revokeCreatorCooldown_service_1.revokeCreatorCooldownService)({
                adminId,
                creatorProfileId: targetId,
                reason,
                dryRun,
            });
            break;
        default:
            throw new Error(`No executor registered for action: ${key}`);
    }
    // ==========================
    // 🔥 DRY RUN — BLOCKED
    // ==========================
    if (dryRun && rawResult?.blocked === true) {
        return {
            mode: "DRY_RUN",
            outcome: "BLOCKED",
            action: action.key,
            diff: {},
            reason: rawResult.reason,
            summary: rawResult.summary,
            ...(deprecationInfo && { deprecation: deprecationInfo }),
        };
    }
    // ==========================
    // 🔥 DRY RUN — PREVIEW
    // ==========================
    if (dryRun) {
        const response = {
            mode: "DRY_RUN",
            outcome: "PREVIEW",
            action: action.key,
            diff: rawResult.diff ?? {},
            summary: rawResult.summary,
        };
        if (deprecationInfo) {
            response.deprecation = deprecationInfo;
        }
        if (action.riskLevel !== "low") {
            response.confirmationRequired = true;
            response.confirmationToken = (0, confirmationToken_util_1.createConfirmationToken)({
                adminId,
                actionKey: action.key,
                actionVersion: action.version,
                targetId,
                paramsHash,
            });
        }
        return response;
    }
    // ==========================
    // 🔹 EXECUTION — FINALIZE
    // ==========================
    if (executionRecord) {
        executionRecord.status = "EXECUTED";
        await executionRecord.save();
    }
    await (0, adminActionLogger_service_1.logAdminAction)({
        adminId,
        actionKey: action.key,
        actionLabel: action.label,
        actionVersion: action.version,
        targetType: action.targetType,
        targetId,
        params,
        reason,
        status: "SUCCESS",
        result: rawResult,
    });
    return {
        outcome: "EXECUTED",
        action: action.key,
        summary: rawResult?.summary,
    };
};
exports.executeAdminActionService = executeAdminActionService;
