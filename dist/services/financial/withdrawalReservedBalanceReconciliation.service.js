"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawalReservedBalanceReconciliationService = exports.WithdrawalReservedBalanceReconciliationService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const creatorBalance_model_1 = require("../../models/creatorBalance.model");
const withdrawal_model_1 = require("../../models/withdrawal.model");
const withdrawalCreatorBalanceProjectionOperation_repository_1 = require("../../repositories/withdrawalCreatorBalanceProjectionOperation.repository");
const withdrawalProjectionOperationType_enum_1 = require("../../enums/financial/withdrawalProjectionOperationType.enum");
const auditLog_service_1 = require("../auditLog.service");
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
class WithdrawalReservedBalanceReconciliationService {
    async reconcile(input) { const report = { scanned: 0, fullyReconciled: 0, alreadyReconciled: 0, noActionRequired: 0, legacyCompatible: 0, manualReviewRequired: 0, applied: 0, skipped: 0, failed: 0 }; const balances = await creatorBalance_model_1.CreatorBalance.find({ lockedBalance: { $gt: 0 } }).limit(input.limit); for (const balance of balances) {
        report.scanned++;
        const active = await withdrawal_model_1.Withdrawal.find({ creatorId: balance.creatorId, isActiveObligation: true });
        if (!active.length) {
            report.noActionRequired++;
            continue;
        }
        if (active.length !== 1 || active[0].amount !== balance.lockedBalance || active[0].currency !== balance.currency || balance.reservedBalance >= active[0].amount) {
            report.manualReviewRequired++;
            if (!input.dryRun && active[0])
                await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.WITHDRAWAL_RECONCILIATION_CONFLICT, actor: { type: "SYSTEM", reference: "withdrawal-reservation-reconciliation" }, entityType: "WITHDRAWAL", entityId: active[0]._id, financialContext: { domain: "WITHDRAWAL", primaryReference: active[0].withdrawalReference, withdrawalReference: active[0].withdrawalReference, amount: active[0].amount, currency: active[0].currency }, transition: { outcome: "CONFLICT" }, metadata: { classification: "MANUAL_REVIEW_REQUIRED", reasonCode: "LOCKED_RESERVED_EVIDENCE_CONFLICT" } });
            continue;
        }
        const withdrawal = active[0];
        const ref = `withdrawal:${withdrawal.withdrawalReference}:projection:migrate-locked-to-reserved`;
        if (await withdrawalCreatorBalanceProjectionOperation_repository_1.withdrawalCreatorBalanceProjectionOperationRepository.findByReference(ref)) {
            report.alreadyReconciled++;
            continue;
        }
        report.fullyReconciled++;
        if (!input.dryRun) {
            const session = await mongoose_1.default.startSession();
            try {
                await session.withTransaction(async () => { const updated = await creatorBalance_model_1.CreatorBalance.findOneAndUpdate({ _id: balance._id, lockedBalance: { $gte: withdrawal.amount } }, { $inc: { lockedBalance: -withdrawal.amount, reservedBalance: withdrawal.amount } }, { new: true, session }); if (!updated)
                    throw new Error("balance conflict"); await withdrawalCreatorBalanceProjectionOperation_repository_1.withdrawalCreatorBalanceProjectionOperationRepository.create({ creatorId: balance.creatorId, withdrawalId: withdrawal._id, operationReference: ref, operationType: withdrawalProjectionOperationType_enum_1.WithdrawalProjectionOperationType.MIGRATION_LOCKED_TO_RESERVED, amount: withdrawal.amount, currency: withdrawal.currency, sourceReference: withdrawal.withdrawalReference, appliedAt: new Date() }, session); await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.WITHDRAWAL_RECONCILIATION_APPLIED, actor: { type: "SYSTEM", reference: "withdrawal-reservation-reconciliation" }, entityType: "WITHDRAWAL", entityId: withdrawal._id, financialContext: { domain: "WITHDRAWAL", primaryReference: withdrawal.withdrawalReference, withdrawalReference: withdrawal.withdrawalReference, amount: withdrawal.amount, currency: withdrawal.currency, projectionOperationReference: ref }, transition: { outcome: "SUCCEEDED" }, metadata: { classification: "FULLY_RECONCILED", reasonCode: "LOCKED_TO_RESERVED_MIGRATION" }, session }); });
                report.applied++;
            }
            catch {
                report.failed++;
            }
            finally {
                await session.endSession();
            }
        }
    } return report; }
}
exports.WithdrawalReservedBalanceReconciliationService = WithdrawalReservedBalanceReconciliationService;
exports.withdrawalReservedBalanceReconciliationService = new WithdrawalReservedBalanceReconciliationService();
