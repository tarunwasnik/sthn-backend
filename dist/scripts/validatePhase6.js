"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const auditAction_enum_1 = require("../enums/financial/auditAction.enum");
const auditLog_service_1 = require("../services/auditLog.service");
function expectThrows(fn, message) { try {
    fn();
}
catch {
    return;
} throw new Error(message); }
const actor = new mongoose_1.default.Types.ObjectId();
(0, auditLog_service_1.validateFinancialAuditInput)({ action: auditAction_enum_1.AuditAction.PAYMENT_INITIALIZED, actor: { type: "USER", id: actor }, financialContext: { domain: "PAYMENT", primaryReference: "PAYMENT-1", amount: 105, currency: "inr" }, transition: { outcome: "PROCESSING" }, metadata: { reasonCode: "provider_pending" } });
(0, auditLog_service_1.validateFinancialAuditInput)({ action: auditAction_enum_1.AuditAction.PAYOUT_PROVIDER_SYNCHRONIZED, actor: { type: "PROVIDER", reference: "INTERNAL" }, financialContext: { domain: "PAYOUT", primaryReference: "PAYOUT-1" } });
expectThrows(() => (0, auditLog_service_1.validateFinancialAuditInput)({ action: auditAction_enum_1.AuditAction.PAYMENT_INITIALIZED, actor: { type: "SYSTEM" }, financialContext: { domain: "PAYMENT", primaryReference: "P" } }), "system actor without reference accepted");
expectThrows(() => (0, auditLog_service_1.validateFinancialAuditInput)({ action: auditAction_enum_1.AuditAction.PAYMENT_INITIALIZED, actor: { type: "USER", id: actor }, financialContext: { domain: "PAYMENT", primaryReference: "P", amount: -1 } }), "negative amount accepted");
expectThrows(() => (0, auditLog_service_1.validateFinancialAuditInput)({ action: auditAction_enum_1.AuditAction.PAYMENT_INITIALIZED, actor: { type: "USER", id: actor }, financialContext: { domain: "PAYMENT", primaryReference: "P" }, metadata: { encryptedPayload: "x" } }), "sensitive metadata accepted");
expectThrows(() => (0, auditLog_service_1.validateFinancialAuditInput)({ action: auditAction_enum_1.AuditAction.PAYMENT_INITIALIZED, actor: { type: "USER", id: actor }, financialContext: { domain: "PAYMENT", primaryReference: "P" }, metadata: { arbitrary: "x" } }), "unknown metadata accepted");
if (new Set(Object.values(auditAction_enum_1.AuditAction)).size !== Object.values(auditAction_enum_1.AuditAction).length)
    throw new Error("Duplicate audit action value");
for (const action of [auditAction_enum_1.AuditAction.PAYMENT_AUTHORIZED, auditAction_enum_1.AuditAction.PAYMENT_CAPTURED, auditAction_enum_1.AuditAction.PAYMENT_FAILED, auditAction_enum_1.AuditAction.PAYMENT_OUTCOME_UNKNOWN, auditAction_enum_1.AuditAction.PAYMENT_REPLAY_DETECTED, auditAction_enum_1.AuditAction.PAYOUT_PROCESS_REQUESTED, auditAction_enum_1.AuditAction.PAYOUT_PROCESSING_STARTED, auditAction_enum_1.AuditAction.PAYOUT_PROVIDER_REQUESTED, auditAction_enum_1.AuditAction.PAYOUT_PROVIDER_SYNCHRONIZED, auditAction_enum_1.AuditAction.PAYOUT_SUCCEEDED, auditAction_enum_1.AuditAction.PAYOUT_FAILED, auditAction_enum_1.AuditAction.PAYOUT_OUTCOME_UNKNOWN, auditAction_enum_1.AuditAction.PAYOUT_REPLAY_DETECTED, auditAction_enum_1.AuditAction.WITHDRAWAL_RECONCILIATION_APPLIED, auditAction_enum_1.AuditAction.WITHDRAWAL_RECONCILIATION_CONFLICT])
    if (!Object.values(auditAction_enum_1.AuditAction).includes(action))
        throw new Error(`Missing audit action ${action}`);
(0, auditLog_service_1.validateFinancialAuditInput)({ action: auditAction_enum_1.AuditAction.WITHDRAWAL_RECONCILIATION_APPLIED, actor: { type: "SYSTEM", reference: "withdrawal-reservation-reconciliation" }, financialContext: { domain: "WITHDRAWAL", primaryReference: "WITHDRAWAL-1", projectionOperationReference: "withdrawal:1:projection:migrate" }, transition: { outcome: "SUCCEEDED" }, metadata: { classification: "FULLY_RECONCILED", reasonCode: "LOCKED_TO_RESERVED_MIGRATION" } });
expectThrows(() => (0, auditLog_service_1.validateFinancialAuditInput)({ action: auditAction_enum_1.AuditAction.PAYOUT_PROVIDER_REQUESTED, actor: { type: "PROVIDER", reference: "INTERNAL" }, financialContext: { domain: "PAYOUT", primaryReference: "PAYOUT-1" }, metadata: { destinationDetails: "secret" } }), "destination details accepted");
console.log("Phase 6A pure audit validation passed.");
