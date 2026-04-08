//backend/src/services/adminActions/adminActionLogger.service.ts

import mongoose from "mongoose";
import AdminActionLog from "../../models/adminActionLog.model";

// Phase 28 — Resilience
import {
  CircuitBreaker,
  createInMemoryBreakerState,
} from "../../utils/circuitBreaker";
import { isFailOpen } from "../../utils/failureTaxonomy";

type LogInput = {
  adminId: string;

  actionKey: string;
  actionLabel: string;
  actionVersion: number; // 🕰️ Phase 25

  targetType: string;
  targetId: string;

  params: Record<string, any>;
  reason: string;

  status: "SUCCESS" | "FAILED";

  result?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
  };
};

// ----------------------------------
// Phase 28 — Circuit breaker (audit)
// ----------------------------------

const auditBreaker = new CircuitBreaker(
  createInMemoryBreakerState(),
  {
    failureThreshold: 2,
    openDurationMs: 30 * 1000, // 30s cooldown
  }
);

/**
 * Phase 24–28 — Admin Action Logger
 *
 * Resilience guarantees:
 * - FAIL_OPEN (audit must not break execution)
 * - Circuit breaker protected
 * - Self-healing after cooldown
 */
export const logAdminAction = async (input: LogInput) => {
  try {
    // -----------------------------
    // 🚨 Circuit breaker gate
    // -----------------------------
    if (!auditBreaker.canProceed()) {
      // FAIL_OPEN: skip audit silently
      return;
    }

    await AdminActionLog.create({
      adminId: new mongoose.Types.ObjectId(input.adminId),

      actionKey: input.actionKey,
      actionLabel: input.actionLabel,
      actionVersion: input.actionVersion, // 🕰️ Phase 25

      targetType: input.targetType,
      targetId: new mongoose.Types.ObjectId(input.targetId),

      params: input.params,
      reason: input.reason,

      status: input.status,
      result: input.result,
      error: input.error,
      // createdAt handled by schema
    });

    // Success → close breaker if half-open
    auditBreaker.recordSuccess();
  } catch {
    // Record failure
    auditBreaker.recordFailure();

    // FAIL_OPEN: never block admin execution
    if (isFailOpen("AUDIT_LOGGING")) {
      return;
    }

    // Defensive fallback (should never trigger)
    throw new Error("Audit logging failed");
  }
};