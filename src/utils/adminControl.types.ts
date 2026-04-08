//backend/src/utils/adminControl.types.ts


/**
 * Phase 29 — Operator Control Definitions
 *
 * This file defines the canonical control vocabulary.
 * NO behavior. NO storage. NO side effects.
 *
 * Used by:
 * - dispatcher control gate
 * - control evaluation engine
 * - audit & metrics attribution
 */

/**
 * Control scope
 *
 * Determines how widely a control applies.
 */
export type AdminControlScope =
  | "GLOBAL"
  | "ACTION"
  | "EMERGENCY";

/**
 * Global admin system modes
 *
 * Ordered from least to most restrictive.
 */
export type GlobalAdminMode =
  | "NORMAL"
  | "READ_ONLY"
  | "DRY_RUN_ONLY"
  | "ADMIN_ACTIONS_DISABLED";

/**
 * Action-level control modes
 */
export type ActionControlMode =
  | "DISABLED"
  | "DRY_RUN_ONLY";

/**
 * Emergency constraint applicability
 */
export type EmergencyAppliesTo =
  | "ALL"
  | "HIGH_RISK";

/**
 * Emergency constraint mode
 */
export type EmergencyControlMode =
  | "BLOCK"
  | "DRY_RUN_ONLY";

/**
 * Base control fields (shared)
 */
export interface BaseAdminControl {
  scope: AdminControlScope;

  /**
   * Human-readable explanation.
   * Must be safe to show to admins.
   */
  reason: string;

  /**
   * Who activated the control (adminId).
   * For auditability only.
   */
  createdBy: string;

  createdAt: Date;

  /**
   * Optional auto-expiry.
   * Enforced via TTL at storage layer.
   */
  expiresAt?: Date;
}

/**
 * Global control
 */
export interface GlobalAdminControl extends BaseAdminControl {
  scope: "GLOBAL";
  mode: GlobalAdminMode;
}

/**
 * Action-level control
 */
export interface ActionAdminControl extends BaseAdminControl {
  scope: "ACTION";
  actionKey: string;
  mode: ActionControlMode;
}

/**
 * Emergency control
 */
export interface EmergencyAdminControl extends BaseAdminControl {
  scope: "EMERGENCY";
  appliesTo: EmergencyAppliesTo;
  mode: EmergencyControlMode;
}

/**
 * Union of all admin controls
 */
export type AdminControl =
  | GlobalAdminControl
  | ActionAdminControl
  | EmergencyAdminControl;

/**
 * Dispatcher-facing decision output
 *
 * This is the ONLY shape the dispatcher will consume.
 */
export type AdminControlDecision =
  | {
      decision: "ALLOW";
    }
  | {
      decision: "FORCE_DRY_RUN";
      reason: string;
    }
  | {
      decision: "BLOCK";
      reason: string;
    };