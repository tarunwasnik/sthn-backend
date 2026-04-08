//backend/src/services/adminActions/adminActionAudit.service.ts

import AdminActionLog, {
  AdminActionStatus,
} from "../../models/adminActionLog.model";
import mongoose from "mongoose";

type AuditLogQuery = {
  adminId?: string;
  actionKey?: string;
  targetId?: string;
  status?: AdminActionStatus;
  fromDate?: Date;
  toDate?: Date;

  page: number;
  limit: number;
};

export const fetchAdminActionAuditLogs = async ({
  adminId,
  actionKey,
  targetId,
  status,
  fromDate,
  toDate,
  page,
  limit,
}: AuditLogQuery) => {
  const query: Record<string, any> = {};

  if (adminId) {
    query.adminId = new mongoose.Types.ObjectId(adminId);
  }

  if (actionKey) {
    query.actionKey = actionKey;
  }

  if (targetId) {
    query.targetId = new mongoose.Types.ObjectId(targetId);
  }

  if (status) {
    query.status = status;
  }

  if (fromDate || toDate) {
    query.createdAt = {};
    if (fromDate) query.createdAt.$gte = fromDate;
    if (toDate) query.createdAt.$lte = toDate;
  }

  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    AdminActionLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
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

/**
 * Phase 27 — Audit admin throttling decisions
 *
 * Throttling is a system decision, not an admin action.
 */
export const auditAdminThrottle = async ({
  adminId,
  reason,
  throttledUntil,
}: {
  adminId: string;
  reason: string;
  throttledUntil: Date;
}) => {
  await AdminActionLog.create({
    adminId: new mongoose.Types.ObjectId(adminId),
    actionKey: "SYSTEM_ADMIN_THROTTLE",
    status: "BLOCKED",
    result: {
      reason,
      throttledUntil,
    },
  });
};