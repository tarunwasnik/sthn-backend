


//backend/src/contracts/adminActionUI.contract.ts

/**
 * Phase 22 — Admin Actions UI Contract
 *
 * This file defines the canonical, UI-safe response shapes
 * for all admin action executions.
 *
 * Backend code MUST conform to these contracts.
 * Frontend code MUST rely only on these contracts.
 *
 * No business logic lives here.
 */

// ================================
// Outcome enums
// ================================

export type AdminActionOutcome =
  | "PREVIEW"   // Dry run, allowed
  | "BLOCKED"   // Dry run, disallowed
  | "EXECUTED"; // Real execution completed

export type AdminActionMode = "DRY_RUN";

// ================================
// Diff contract (Phase 20.5)
// ================================

export type AdminActionDiff = Record<
  string,
  {
    before: any;
    after: any;
  }
>;

// ================================
// DRY RUN — PREVIEW (allowed)
// ================================

export interface AdminActionPreviewResponse {
  mode: AdminActionMode;
  outcome: "PREVIEW";
  action: string;

  diff: AdminActionDiff;

  summary: string;

  // Phase 20.6 — Risk-based confirmation
  confirmationRequired?: boolean;
  confirmationToken?: string;
}

// ================================
// DRY RUN — BLOCKED (disallowed)
// ================================

export interface AdminActionBlockedResponse {
  mode: AdminActionMode;
  outcome: "BLOCKED";
  action: string;

  reason: string;
  diff: {};

  summary: string;
}

// ================================
// EXECUTION — SUCCESS
// ================================

export interface AdminActionExecutedResponse {
  outcome: "EXECUTED";
  action: string;
  summary?: string;
}

// ================================
// ERROR RESPONSE (UI-safe)
// ================================

export interface AdminActionErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

// ================================
// Union types
// ================================

export type AdminActionDryRunResponse =
  | AdminActionPreviewResponse
  | AdminActionBlockedResponse;

export type AdminActionResponse =
  | AdminActionDryRunResponse
  | AdminActionExecutedResponse;
