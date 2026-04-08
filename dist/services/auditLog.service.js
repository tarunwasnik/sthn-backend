"use strict";
//backend/src/services/auditLog.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuditLog = void 0;
const auditLog_model_1 = require("../models/auditLog.model");
/**
 * Create an immutable audit log entry
 *
 * IMPORTANT:
 * - This MUST succeed or the caller should fail
 * - No silent errors
 * - No updates or deletes allowed
 */
const createAuditLog = async (params) => {
    const { actorType, actorId, action, entityType, entityId, before, after, } = params;
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
    await auditLog_model_1.AuditLog.create({
        actorType,
        actorId,
        action,
        entityType,
        entityId,
        before,
        after,
    });
};
exports.createAuditLog = createAuditLog;
