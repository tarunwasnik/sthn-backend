import { getAdminActionDefinition } from "./adminActionRegistry.service";
import { applyCreatorCooldownService } from "./applyCreatorCooldown.service";
import { revokeCreatorCooldownService } from "./revokeCreatorCooldown.service";
import { logAdminAction } from "./adminActionLogger.service";
import { validateAdminActionParams } from "./adminActionValidator";

import {
  createConfirmationToken,
  hashParams,
  verifyConfirmationToken,
} from "./confirmationToken.util";

import AdminActionExecution from "../../models/adminActionExecution.model";
import { createIdempotencyKey } from "./idempotencyKey.util";

// Phase 27 — Admin Throttling
import { AdminThrottle } from "../../models/adminThrottle.model";
import { emitAdminActionMetric } from "./adminActionMetrics.service";

// Phase 29 — Operator Controls
import { AdminControl } from "../../models/adminControl.model";
import { evaluateAdminControls } from "../../utils/adminControlEvaluator";

// Phase 30.4 — Feature Flag Evaluation
import { FeatureFlagEvaluator } from "../controlPlane/featureFlagEvaluator.service";

/**
 * Phase 28 — Dispatcher timeout utility
 * Fail-fast, deterministic
 */
const withTimeout = async <T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`TIMEOUT: ${label}`)), ms)
    ),
  ]);
};

export const executeAdminActionService = async ({
  adminId,
  adminRole,
  key,
  targetId,
  params,
  reason,
  dryRun = false,
  confirmationToken,
}: {
  adminId: string;
  adminRole: string;
  key: string;
  targetId: string;
  params: Record<string, any>;
  reason: string;
  dryRun?: boolean;
  confirmationToken?: string;
}) => {
  // ==========================
  // 1️⃣ LOAD ACTION DEFINITION (FAIL CLOSED)
  // ==========================
  const action = await withTimeout(
    getAdminActionDefinition(key),
    500,
    "LOAD_ACTION_DEFINITION"
  );

  if (!action) {
    throw new Error(`Unknown admin action: ${key}`);
  }

  // ==========================
  // 🧭 PHASE 29 — OPERATOR CONTROLS (FAIL CLOSED)
  // ==========================
  const activeControls = await withTimeout(
    AdminControl.find({}),
    500,
    "LOAD_ADMIN_CONTROLS"
  );

  const controlDecision = evaluateAdminControls(activeControls, {
    actionKey: key,
    riskLevel: action.riskLevel,
    dryRun,
  });

  if (controlDecision.decision === "BLOCK") {
    emitAdminActionMetric({
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

    await logAdminAction({
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
  const activeThrottles = await withTimeout(
    AdminThrottle.find({
      adminId,
      throttleUntil: { $gt: new Date() },
    }).sort({ throttleUntil: -1 }),
    500,
    "THROTTLE_LOOKUP"
  );

  if (activeThrottles.length > 0) {
    const throttle = activeThrottles[0];

    emitAdminActionMetric({
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

    throw new Error(
      `ADMIN_THROTTLED: ${throttle.reason} (until ${throttle.throttleUntil.toISOString()})`
    );
  }

  // ==========================
  // 🧯 PHASE 30.4 — FEATURE FLAG KILL SWITCH (FAIL CLOSED)
  // ==========================
  const adminActionsEnabled =
    await FeatureFlagEvaluator.isEnabled(
      "ADMIN_ACTIONS_ENABLED",
      { role: adminRole }
    );

  if (!adminActionsEnabled) {
    emitAdminActionMetric({
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

  let deprecationInfo: {
    message: string;
    sunsetAt?: string;
  } | null = null;

  if (action.deprecated) {
    const { message, sunsetAt } = action.deprecated;
    deprecationInfo = { message, sunsetAt };

    if (!dryRun && sunsetAt) {
      if (now >= new Date(sunsetAt).getTime()) {
        throw new Error(
          `ACTION_DEPRECATED: ${message}${
            sunsetAt ? ` (sunset at ${sunsetAt})` : ""
          }`
        );
      }
    }
  }

  // ==========================
  // 🔐 PHASE 24 — POLICY
  // ==========================
  const policy = action.policy;

  if (!policy.allowedRoles.includes(adminRole as any)) {
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

  const validation = validateAdminActionParams(action, params);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const paramsHash = hashParams(params);

  // ==========================
  // 🔐 CONFIRMATION
  // ==========================
  if (!dryRun && action.riskLevel !== "low") {
    if (!confirmationToken) {
      throw new Error("Confirmation token required for this admin action");
    }

    verifyConfirmationToken({
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
  let executionRecord: any | null = null;

  if (!dryRun) {
    const idempotencyKey = createIdempotencyKey({
      adminId,
      actionKey: action.key,
      actionVersion: action.version,
      targetId,
      paramsHash,
    });

    try {
      executionRecord = await AdminActionExecution.create({
        idempotencyKey,
        adminId,
        actionKey: action.key,
        targetId,
        status: "IN_PROGRESS",
      });
    } catch (err: any) {
      if (err.code === 11000) {
        const existing = await AdminActionExecution.findOne({
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
  let rawResult: any;

  switch (key) {
    case "APPLY_CREATOR_COOLDOWN":
      rawResult = await applyCreatorCooldownService({
        adminId,
        creatorProfileId: targetId,
        days: params.days,
        reason,
        dryRun,
      });
      break;

    case "REVOKE_CREATOR_COOLDOWN":
      rawResult = await revokeCreatorCooldownService({
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
    const response: any = {
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
      response.confirmationToken = createConfirmationToken({
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

  await logAdminAction({
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
