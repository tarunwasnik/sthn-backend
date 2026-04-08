//backend/src/utils/failureTaxonomy.ts


/**
 * Phase 28 — Failure Taxonomy
 *
 * This file defines how different subsystems are allowed to fail.
 * It contains NO behavior. Only classifications and intent.
 *
 * Used by:
 * - circuit breakers
 * - dispatcher guardrails
 * - resilience wrappers
 */

/**
 * Known subsystem identifiers
 */
export type Subsystem =
  | "DISPATCHER_CORE"
  | "THROTTLE_LOOKUP"
  | "POLICY_VALIDATION"
  | "EXECUTOR"
  | "AUDIT_LOGGING"
  | "METRICS_EMISSION"
  | "ANOMALY_DETECTION";

/**
 * Failure handling strategy
 *
 * FAIL_CLOSED:
 *   - Abort request
 *   - Explicit error
 *
 * FAIL_OPEN:
 *   - Swallow failure
 *   - Continue execution
 */
export type FailureMode = "FAIL_CLOSED" | "FAIL_OPEN";

/**
 * Subsystem criticality classification
 *
 * This is the single source of truth for:
 * - what is allowed to fail
 * - what must never fail silently
 */
export const SUBSYSTEM_FAILURE_POLICY: Record<
  Subsystem,
  FailureMode
> = {
  DISPATCHER_CORE: "FAIL_CLOSED",
  THROTTLE_LOOKUP: "FAIL_CLOSED",
  POLICY_VALIDATION: "FAIL_CLOSED",
  EXECUTOR: "FAIL_CLOSED",

  AUDIT_LOGGING: "FAIL_OPEN",
  METRICS_EMISSION: "FAIL_OPEN",
  ANOMALY_DETECTION: "FAIL_OPEN",
};

/**
 * Utility helpers (pure)
 */

export const isFailOpen = (subsystem: Subsystem): boolean =>
  SUBSYSTEM_FAILURE_POLICY[subsystem] === "FAIL_OPEN";

export const isFailClosed = (subsystem: Subsystem): boolean =>
  SUBSYSTEM_FAILURE_POLICY[subsystem] === "FAIL_CLOSED";