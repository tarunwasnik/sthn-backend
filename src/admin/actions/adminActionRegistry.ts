//backend/src/admin/actions/adminActionRegistry.ts

export type AdminActionRisk = "low" | "medium" | "high" | "critical";
export type AdminActionTarget = "user" | "creator" | "booking" | "system";

export interface AdminActionParam {
  name: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  description: string;
}

/**
 * Phase 24 — Policy-based authorization
 */
export interface AdminActionPolicy {
  allowedRoles: Array<"admin">;
  allowDryRun: boolean;
  allowExecute: boolean;
}

/**
 * Phase 25 — Deprecation metadata
 */
export interface AdminActionDeprecation {
  since: string; // ISO date
  message: string;
  sunsetAt?: string; // ISO date (hard stop)
}

export interface AdminActionDefinition {
  key: string;
  label: string;
  targetType: AdminActionTarget;

  /**
   * ⚠️ Legacy coarse filter (kept for backward compatibility)
   */
  allowedRoles: Array<"admin">;

  riskLevel: AdminActionRisk;
  requiresReason: boolean;
  params: AdminActionParam[];

  /**
   * ✅ Phase 24 policy block
   */
  policy: AdminActionPolicy;

  /**
   * 🕰️ Phase 25 versioning
   */
  version: number;

  /**
   * ⚠️ Phase 25 deprecation (optional)
   */
  deprecated?: AdminActionDeprecation;
}

export const ADMIN_ACTIONS: AdminActionDefinition[] = [
  {
    key: "APPLY_CREATOR_COOLDOWN",
    label: "Apply creator cooldown",
    targetType: "creator",

    allowedRoles: ["admin"],

    riskLevel: "medium",
    requiresReason: true,

    policy: {
      allowedRoles: ["admin"],
      allowDryRun: true,
      allowExecute: true,
    },

    version: 1,

    params: [
      {
        name: "days",
        type: "number",
        required: true,
        description: "Number of days to apply cooldown",
      },
    ],
  },

  {
    key: "REVOKE_CREATOR_COOLDOWN",
    label: "Revoke creator cooldown",
    targetType: "creator",

    allowedRoles: ["admin"],

    riskLevel: "medium",
    requiresReason: true,

    policy: {
      allowedRoles: ["admin"],
      allowDryRun: true,
      allowExecute: true,
    },

    version: 1,

    params: [],
  },
];

export const getActionsForRole = (role: "admin") => {
  // ⚠️ Phase 24 note:
  // Still uses legacy allowedRoles.
  // Dispatcher enforces policy + version rules.
  return ADMIN_ACTIONS.filter((action) =>
    action.allowedRoles.includes(role)
  );
};

export const getActionByKey = (key: string) => {
  return ADMIN_ACTIONS.find((action) => action.key === key);
};












