"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryAuditLogs = exports.validateFinancialAuditInput = exports.createFinancialAudit = exports.createAuditLog = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const auditAction_enum_1 = require("../enums/financial/auditAction.enum");
const auditLog_model_1 = require("../models/auditLog.model");
const MAX_REFERENCE_LENGTH = 160;
const MAX_METADATA_VALUE_LENGTH = 240;
const forbiddenKey = /(password|secret|token|authorization|cookie|api.?key|private.?key|encryption.?key|encrypted|decrypted|account.?number|bank.?account|routing.?number|ifsc|upi.?id|wallet.?address|cvv|card.?number|raw.?provider|provider.?credentials|destination.?details)/i;
const referenceKeys = new Set(["paymentReference", "bookingReference", "refundReference", "settlementReference", "withdrawalReference", "payoutReference", "providerReference", "ledgerTransactionReference", "projectionOperationReference"]);
const metadataKeys = new Set([
    "reasonCode",
    "idempotencyResult",
    "providerStatus",
    "failureCode",
    "operationReference",
    "classification",
    "reservationReference",
    "allocationReference",
    "commissionAmount",
    "creatorAmount",
    "serviceAmount",
    "platformFeeAmount",
    "totalAmount",
    "creatorId",
    "creatorUserId",
    "creatorWalletId",
    "creatorReference",
    "walletReference",
    "destinationReference",
    "providerRequestReference",
    "providerExecutionReference",
    "finalizationReference",
    "finalizationOutcome",
    "reconciliationReference",
    "attemptReference",
    "repairReference",
    "classificationBefore",
    "classificationAfter",
    "operationalAction",
    "operationalResult",
    "issueCode",
]);
function boundedString(value, field) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > MAX_REFERENCE_LENGTH)
        throw new Error(`AuditLog: invalid ${field}`);
    return value.trim();
}
function safeStatus(value) {
    if (value === undefined)
        return undefined;
    return boundedString(value, "transition status").slice(0, 64);
}
function sanitizeMetadata(metadata) {
    if (!metadata)
        return undefined;
    const result = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (forbiddenKey.test(key))
            throw new Error(`AuditLog: sensitive metadata field '${key}' is forbidden`);
        if (!metadataKeys.has(key))
            throw new Error(`AuditLog: metadata field '${key}' is not allowed`);
        if (typeof value === "string")
            result[key] = boundedString(value, `metadata.${key}`).slice(0, MAX_METADATA_VALUE_LENGTH);
        else if (typeof value === "boolean" || (typeof value === "number" && Number.isSafeInteger(value)))
            result[key] = value;
        else
            throw new Error(`AuditLog: invalid metadata value for '${key}'`);
    }
    return Object.keys(result).length ? result : undefined;
}
function sanitizeContext(context) {
    if (!context || !["PAYMENT", "REFUND", "ESCROW", "SETTLEMENT", "WITHDRAWAL", "PAYOUT", "BOOKING_WALLET"].includes(context.domain))
        throw new Error("AuditLog: invalid financial domain");
    const clean = { domain: context.domain, primaryReference: boundedString(context.primaryReference, "primary reference") };
    for (const key of referenceKeys)
        if (context[key] !== undefined)
            clean[key] = boundedString(context[key], key);
    if (context.provider !== undefined)
        clean.provider = boundedString(context.provider, "provider").slice(0, 64);
    if (context.amount !== undefined) {
        if (!Number.isSafeInteger(context.amount) || context.amount < 0)
            throw new Error("AuditLog: amount must be a non-negative safe integer");
        clean.amount = context.amount;
    }
    if (context.currency !== undefined) {
        const currency = boundedString(context.currency, "currency").toUpperCase();
        if (!/^[A-Z]{3}$/.test(currency))
            throw new Error("AuditLog: invalid currency");
        clean.currency = currency;
    }
    return clean;
}
function validateActor(actor) {
    if (!actor || !["USER", "CREATOR", "ADMIN", "SYSTEM", "PROVIDER"].includes(actor.type))
        throw new Error("AuditLog: invalid actor type");
    if (["USER", "CREATOR", "ADMIN"].includes(actor.type) && !actor.id)
        throw new Error("AuditLog: actor id is required for authenticated actions");
    if (["SYSTEM", "PROVIDER"].includes(actor.type) && !actor.reference)
        throw new Error("AuditLog: actor reference is required for system/provider actions");
    return { actorType: actor.type, actorId: actor.id, actorReference: actor.reference ? boundedString(actor.reference, "actor reference") : undefined };
}
/** The sole append-only audit authority, including financial audit sanitization. */
const createAuditLog = async (params) => {
    const actor = validateActor({ type: params.actorType, id: params.actorId });
    if (!params.action || !params.entityType || !params.entityId)
        throw new Error("AuditLog: action, entity type and entity id are required");
    const data = { ...actor, action: params.action, entityType: params.entityType, entityId: params.entityId, before: params.before, after: params.after };
    if (params.session)
        await auditLog_model_1.AuditLog.create([data], { session: params.session });
    else
        await auditLog_model_1.AuditLog.create(data);
};
exports.createAuditLog = createAuditLog;
const createFinancialAudit = async (params) => {
    if (!Object.values(auditAction_enum_1.AuditAction).includes(params.action))
        throw new Error("AuditLog: unsupported financial action");
    const actor = validateActor(params.actor);
    if (!params.entityType || !params.entityId)
        throw new Error("AuditLog: entity type and entity id are required");
    const transition = params.transition ? { fromStatus: safeStatus(params.transition.fromStatus), toStatus: safeStatus(params.transition.toStatus), outcome: params.transition.outcome } : undefined;
    if (transition?.outcome && !["SUCCEEDED", "FAILED", "PROCESSING", "UNKNOWN", "BLOCKED", "REPLAYED", "CONFLICT"].includes(transition.outcome))
        throw new Error("AuditLog: invalid transition outcome");
    const data = { ...actor, category: "FINANCIAL", action: params.action, entityType: params.entityType, entityId: params.entityId, financialContext: sanitizeContext(params.financialContext), transition, metadata: sanitizeMetadata(params.metadata) };
    if (params.session)
        await auditLog_model_1.AuditLog.create([data], { session: params.session });
    else
        await auditLog_model_1.AuditLog.create(data);
};
exports.createFinancialAudit = createFinancialAudit;
/** Pure validation export used by the focused Phase 6 audit checks. */
const validateFinancialAuditInput = (params) => ({ actor: validateActor(params.actor), financialContext: sanitizeContext(params.financialContext), metadata: sanitizeMetadata(params.metadata), transition: params.transition ? { fromStatus: safeStatus(params.transition.fromStatus), toStatus: safeStatus(params.transition.toStatus), outcome: params.transition.outcome } : undefined });
exports.validateFinancialAuditInput = validateFinancialAuditInput;
const queryAuditLogs = async (input) => {
    const page = input.page === undefined ? 1 : Number(input.page);
    const limit = input.limit === undefined ? 25 : Number(input.limit);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new Error("AuditLog: invalid pagination");
    const query = {};
    if (input.category !== undefined) {
        if (typeof input.category !== "string" || !["AUTH", "PROFILE", "GOVERNANCE", "BOOKING", "FINANCIAL", "ADMIN", "SYSTEM"].includes(input.category))
            throw new Error("AuditLog: invalid category");
        query.category = input.category;
    }
    if (input.action !== undefined) {
        if (typeof input.action !== "string" || !Object.values(auditAction_enum_1.AuditAction).includes(input.action))
            throw new Error("AuditLog: invalid action");
        query.action = input.action;
    }
    if (input.actorType !== undefined) {
        if (typeof input.actorType !== "string" || !["USER", "CREATOR", "ADMIN", "SYSTEM", "PROVIDER"].includes(input.actorType))
            throw new Error("AuditLog: invalid actor type");
        query.actorType = input.actorType;
    }
    if (input.actorId !== undefined) {
        if (typeof input.actorId !== "string" || !mongoose_1.default.Types.ObjectId.isValid(input.actorId))
            throw new Error("AuditLog: invalid actor id");
        query.actorId = new mongoose_1.default.Types.ObjectId(input.actorId);
    }
    if (input.financialDomain !== undefined) {
        if (typeof input.financialDomain !== "string" || !["PAYMENT", "REFUND", "ESCROW", "SETTLEMENT", "WITHDRAWAL", "PAYOUT", "BOOKING_WALLET"].includes(input.financialDomain))
            throw new Error("AuditLog: invalid financial domain");
        query["financialContext.domain"] = input.financialDomain;
    }
    for (const key of ["primaryReference", "paymentReference", "bookingReference", "refundReference", "settlementReference", "withdrawalReference", "payoutReference"])
        if (input[key] !== undefined)
            query[`financialContext.${key}`] = boundedString(input[key], key);
    if (input.dateFrom !== undefined || input.dateTo !== undefined) {
        const from = input.dateFrom === undefined ? undefined : new Date(String(input.dateFrom));
        const to = input.dateTo === undefined ? undefined : new Date(String(input.dateTo));
        if ((from && Number.isNaN(from.valueOf())) || (to && Number.isNaN(to.valueOf())) || (from && to && from > to))
            throw new Error("AuditLog: invalid date range");
        query.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    }
    const [logs, total] = await Promise.all([auditLog_model_1.AuditLog.find(query).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), auditLog_model_1.AuditLog.countDocuments(query)]);
    return { logs, pagination: { page, limit, total } };
};
exports.queryAuditLogs = queryAuditLogs;
