//backend/src/services/adminActions/adminActionMetrics.service.ts


import AdminActionMetric from "../../models/AdminActionMetric.model";
import { AdminActionMetricEvent } from "./adminActionMetrics.types";
import { detectAdminActionAnomalies } from "./adminActionAnomaly.service";
import { recordAdminActionSignal } from "./adminActionSignal.service";

// Phase 28 — Resilience
import {
  CircuitBreaker,
  createInMemoryBreakerState,
} from "../../utils/circuitBreaker";
import {
  isFailOpen,
} from "../../utils/failureTaxonomy";

/**
 * Phase 26 — Metrics & Anomaly Engine
 *
 * Phase 28 additions:
 * - Circuit breaker
 * - Fail-open semantics
 *
 * IMPORTANT:
 * - This service must NEVER throw
 * - Metrics must NEVER affect admin action execution
 */

// ----------------------------------
// In-memory rolling window
// ----------------------------------

const inMemoryWindow: AdminActionMetricEvent[] = [];

// Rolling window duration (5 minutes)
const WINDOW_MS = 5 * 60 * 1000;

// ----------------------------------
// Phase 28 — Circuit breaker (metrics)
// ----------------------------------

const metricsBreaker = new CircuitBreaker(
  createInMemoryBreakerState(),
  {
    failureThreshold: 3,
    openDurationMs: 60 * 1000, // 1 minute cooldown
  }
);

// ----------------------------------
// Public API
// ----------------------------------

/**
 * Emit an admin action metric.
 *
 * - Fire-and-forget
 * - Failure-safe
 * - Circuit-breaker protected
 */
export const emitAdminActionMetric = async (
  event: AdminActionMetricEvent
) => {
  try {
    // -----------------------------
    // 🚨 Circuit breaker check
    // -----------------------------
    if (!metricsBreaker.canProceed()) {
      // FAIL_OPEN: skip metrics silently
      return;
    }

    const now = Date.now();

    // -----------------------------
    // 1️⃣ Update in-memory window
    // -----------------------------
    inMemoryWindow.push(event);

    while (
      inMemoryWindow.length > 0 &&
      inMemoryWindow[0].timestamp < now - WINDOW_MS
    ) {
      inMemoryWindow.shift();
    }

    // -----------------------------
    // 2️⃣ Persist to MongoDB
    // -----------------------------
    AdminActionMetric.create({
      type: event.type,
      timestamp: event.timestamp,

      adminId: event.adminId,
      adminRole: event.adminRole,

      actionKey: event.actionKey,
      actionVersion: event.actionVersion,
      riskLevel: event.riskLevel,

      targetId: event.targetId,

      dryRun: event.dryRun,
      outcome: event.outcome,
      reason: event.reason,
    }).catch(() => {
      // Count DB failure
      metricsBreaker.recordFailure();
    });

    // -----------------------------
    // 3️⃣ Anomaly detection
    // -----------------------------
    try {
      const signals = detectAdminActionAnomalies(inMemoryWindow);
      signals.forEach(recordAdminActionSignal);

      // Success path → close breaker if half-open
      metricsBreaker.recordSuccess();
    } catch {
      // Anomaly pipeline failure
      metricsBreaker.recordFailure();
    }
  } catch {
    // Absolute last line of defense
    // Metrics must NEVER throw
    if (isFailOpen("METRICS_EMISSION")) {
      return;
    }
  }
};

/**
 * INTERNAL — Expose rolling window for testing/debugging only
 */
export const getInMemoryAdminMetrics = () => inMemoryWindow;