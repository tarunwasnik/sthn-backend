//backend/src/types/controlPlane.types.ts

/**
 * Control Plane enforcement outcome.
 * Interpreted later by the dispatcher (Phase 30.4).
 */
export enum ControlPlaneEnforcement {
  ALLOW = "ALLOW",
  FORCE_DRY_RUN = "FORCE_DRY_RUN",
  BLOCK = "BLOCK",
}

/**
 * Control Plane scope.
 * Defines the blast radius of a control.
 */
export enum ControlPlaneScope {
  /**
   * Applies to all admin actions system-wide.
   */
  GLOBAL = "GLOBAL",

  /**
   * Applies to a specific admin action key.
   */
  ACTION = "ACTION",

  /**
   * Emergency override.
   * Highest priority, evaluated first.
   */
  EMERGENCY = "EMERGENCY",
}

/**
 * Target definition for a control.
 * - GLOBAL / EMERGENCY → no target
 * - ACTION → adminActionKey
 */
export type ControlPlaneTarget =
  | { scope: ControlPlaneScope.GLOBAL }
  | { scope: ControlPlaneScope.EMERGENCY }
  | { scope: ControlPlaneScope.ACTION; actionKey: string };

/**
 * Base shape of a Control Plane rule.
 * This is intentionally storage-agnostic.
 */
export interface ControlPlaneRule {
  id: string;

  scope: ControlPlaneScope;
  target: string | null;

  enforcement: ControlPlaneEnforcement;
  reason: string;

  isActive: boolean;

  /**
   * Optional expiry.
   * Undefined means "until manually removed".
   */
  expiresAt?: Date;

  createdAt: Date;
}

/**
 * Result of evaluating control plane state
 * for a given admin action.
 */
export interface ControlPlaneEvaluationResult {
  enforcement: ControlPlaneEnforcement;

  /**
   * The control that caused this outcome.
   * Useful for audit, UI explanation, and debugging.
   */
  control?: ControlPlaneRule;
}

/**
 * Fail-closed default.
 * Used when:
 * - DB lookup fails
 * - Repository throws
 * - Inconsistent data detected
 */
export const FAIL_CLOSED_EVALUATION: ControlPlaneEvaluationResult = {
  enforcement: ControlPlaneEnforcement.BLOCK,
};
