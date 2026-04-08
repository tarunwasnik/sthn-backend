//backend/src/services/auditLog.service.ts


import mongoose from "mongoose";
import { AuditLog, AuditActorType } from "../models/auditLog.model";

interface CreateAuditLogParams {
  actorType: AuditActorType; // ADMIN | SYSTEM
  actorId?: mongoose.Types.ObjectId;

  action: string;           // e.g. USER_SUSPENDED
  entityType: string;       // USER | BOOKING | DISPUTE | CREATOR_PROFILE
  entityId: mongoose.Types.ObjectId;

  before?: Record<string, any>;
  after?: Record<string, any>;
}

/**
 * Create an immutable audit log entry
 *
 * IMPORTANT:
 * - This MUST succeed or the caller should fail
 * - No silent errors
 * - No updates or deletes allowed
 */
export const createAuditLog = async (
  params: CreateAuditLogParams
): Promise<void> => {
  const {
    actorType,
    actorId,
    action,
    entityType,
    entityId,
    before,
    after,
  } = params;

  // Hard validation (fail fast)
  if (!actorType) {
    throw new Error("AuditLog: actorType is required");
  }

  if (!action) {
    throw new Error("AuditLog: action is required");
  }

  if (!entityType) {
    throw new Error("AuditLog: entityType is required");
  }

  if (!entityId) {
    throw new Error("AuditLog: entityId is required");
  }

  // Enforce ADMIN actorId presence
  if (actorType === "ADMIN" && !actorId) {
    throw new Error("AuditLog: actorId is required for ADMIN actions");
  }

  await AuditLog.create({
    actorType,
    actorId,
    action,
    entityType,
    entityId,
    before,
    after,
  });
};