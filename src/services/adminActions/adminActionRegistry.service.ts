//backend/src/services/adminActions/adminActionRegistry.service.ts


import { getActionsForRole } from "../../admin/actions/adminActionRegistry";

type RiskLevel = "low" | "high" | "critical";

const normalizeRiskLevel = (action: any) => ({
  ...action,
  riskLevel: (action.riskLevel as RiskLevel) ?? "low",
});

export const fetchAdminActionsForRole = (
  role: "admin",
  page: number,
  limit: number
) => {
  const allActions = getActionsForRole(role).map(normalizeRiskLevel);

  const total = allActions.length;
  const start = (page - 1) * limit;
  const end = start + limit;

  const actions = allActions.slice(start, end);

  return {
    actions,
    pagination: {
      page,
      limit,
      total,
    },
  };
};

export const getAdminActionDefinition = async (key: string) => {
  const allActions = getActionsForRole("admin").map(normalizeRiskLevel);
  return allActions.find((action) => action.key === key);
};