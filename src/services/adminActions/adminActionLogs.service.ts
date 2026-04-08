//backend/src/services/adminActions/adminActionLogs.service.ts


import AdminActionLog from "../../models/adminActionLog.model";

type FetchInput = {
  page: number;
  limit: number;

  adminId?: string;
  targetId?: string;
  actionKey?: string;
  status?: "SUCCESS" | "FAILED";
};

export const fetchAdminActionLogsService = async ({
  page,
  limit,
  adminId,
  targetId,
  actionKey,
  status,
}: FetchInput) => {
  const query: any = {};

  if (adminId) query.adminId = adminId;
  if (targetId) query.targetId = targetId;
  if (actionKey) query.actionKey = actionKey;
  if (status) query.status = status;

  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    AdminActionLog.find(query)
      .sort({ executedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("adminId", "name email")
      .lean(),

    AdminActionLog.countDocuments(query),
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
    },
  };
};
