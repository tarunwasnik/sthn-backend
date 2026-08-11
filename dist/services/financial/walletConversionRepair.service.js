"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletConversionRepairService = exports.WalletConversionRepairService = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const walletConversionOperational_response_dto_1 = require("../../dtos/wallet/walletConversionOperational.response.dto");
const walletConversionAuditAction_enum_1 = require("../../enums/financial/walletConversionAuditAction.enum");
const walletConversionOperationalClassification_enum_1 = require("../../enums/financial/walletConversionOperationalClassification.enum");
const walletConversionOperationalIssue_enum_1 = require("../../enums/financial/walletConversionOperationalIssue.enum");
const walletConversionOperationalSeverity_enum_1 = require("../../enums/financial/walletConversionOperationalSeverity.enum");
const walletConversionRepairAction_enum_1 = require("../../enums/financial/walletConversionRepairAction.enum");
const walletConversionRequestStatus_enum_1 = require("../../enums/financial/walletConversionRequestStatus.enum");
const WalletConversionOperationalError_1 = require("../../errors/financial/WalletConversionOperationalError");
const walletConversionAudit_model_1 = require("../../models/walletConversionAudit.model");
const walletConversionAudit_repository_1 = require("../../repositories/walletConversionAudit.repository");
const walletConversionReconciliation_repository_1 = require("../../repositories/walletConversionReconciliation.repository");
const walletConversionRepairOperation_repository_1 = require("../../repositories/walletConversionRepairOperation.repository");
const walletConversionRequest_repository_1 = require("../../repositories/walletConversionRequest.repository");
const idempotency_util_1 = require("../../utils/financial/idempotency.util");
const walletConversionOperationalIdentity_util_1 = require("../../utils/financial/walletConversionOperationalIdentity.util");
const walletConversionOperationalInspection_service_1 = require("./walletConversionOperationalInspection.service");
const issueFor = (action) => ({
    [walletConversionRepairAction_enum_1.WalletConversionRepairAction.RESTORE_MISSING_AUDIT]: walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.TERMINAL_AUDIT_MISSING,
    [walletConversionRepairAction_enum_1.WalletConversionRepairAction.RESTORE_LEDGER_REFERENCES]: walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.LEDGER_REFERENCES_MISSING,
    [walletConversionRepairAction_enum_1.WalletConversionRepairAction.RESTORE_PROJECTION_REFERENCES]: walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.PROJECTION_REFERENCES_MISSING,
    [walletConversionRepairAction_enum_1.WalletConversionRepairAction.RESTORE_ACCOUNTING_REFERENCES]: walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.ACCOUNTING_REFERENCES_MISSING,
})[action];
class WalletConversionRepairService {
    constructor(options = {}) {
        this.options = options;
        this.now = options.now ?? (() => new Date());
    }
    async inject(stage) {
        await this.options.failureInjector?.(stage);
    }
    async restore(inspection, action, session) {
        const request = inspection.request;
        const graph = inspection.graph;
        if (action === walletConversionRepairAction_enum_1.WalletConversionRepairAction.RESTORE_MISSING_AUDIT) {
            if (!graph.completedAt)
                return null;
            await walletConversionAudit_repository_1.walletConversionAuditRepository.createOnce({
                auditKey: (0, idempotency_util_1.createIdempotencyFingerprint)(walletConversionAuditAction_enum_1.WalletConversionAuditAction.COMPLETED, request.conversionKey),
                action: walletConversionAuditAction_enum_1.WalletConversionAuditAction.COMPLETED,
                conversionReference: request.conversionReference,
                sourceCurrency: request.sourceCurrency,
                targetCurrency: request.targetCurrency,
                sourceAmount: request.sourceAmount, targetAmount: request.targetAmount,
                fxSnapshotReference: request.fxSnapshotReference,
                fxEffectiveDate: request.fxEffectiveDate, requestedAt: request.requestedAt,
                providerRequestReference: request.providerRequestReference,
                providerExecutionReference: request.providerExecutionReference,
                providerStatus: request.providerStatus,
                providerOutcome: request.providerOutcome,
                processingAt: request.providerProcessingAt,
                accountingReference: graph.identity.accountingReference,
                transactionReference: graph.identity.accountingTransactionReference,
                sourceProjectionReference: graph.identity.sourceProjectionReference,
                targetProjectionReference: graph.identity.targetProjectionReference,
                sourceWalletVersion: graph.sourceWalletVersion,
                targetWalletVersion: graph.targetWalletVersion,
                completedAt: graph.completedAt,
            }, session);
            return ["terminalAudit"];
        }
        if (action === walletConversionRepairAction_enum_1.WalletConversionRepairAction.RESTORE_LEDGER_REFERENCES) {
            const restored = await walletConversionRequest_repository_1.walletConversionRequestRepository
                .restoreLedgerReferences({
                conversionReference: request.conversionReference,
                accountingReference: graph.identity.accountingReference,
                accountingTransactionReference: graph.identity.accountingTransactionReference, session,
            });
            return restored ? ["accountingTransactionReference"] : null;
        }
        if (action === walletConversionRepairAction_enum_1.WalletConversionRepairAction.RESTORE_PROJECTION_REFERENCES) {
            const restored = await walletConversionRequest_repository_1.walletConversionRequestRepository
                .restoreProjectionReferences({
                conversionReference: request.conversionReference,
                accountingReference: graph.identity.accountingReference,
                sourceProjectionReference: graph.identity.sourceProjectionReference,
                targetProjectionReference: graph.identity.targetProjectionReference,
                session,
            });
            return restored ? ["sourceProjectionReference",
                "targetProjectionReference"] : null;
        }
        if (!graph.completedAt)
            return null;
        const restored = await walletConversionRequest_repository_1.walletConversionRequestRepository
            .restoreAccountingReferences({
            conversionReference: request.conversionReference,
            accountingReference: graph.identity.accountingReference,
            accountingKey: graph.identity.accountingKey,
            accountingFingerprint: graph.identity.accountingFingerprint,
            accountingTargetWalletId: graph.targetWalletId,
            sourceWalletVersion: graph.sourceWalletVersion,
            targetWalletVersion: graph.targetWalletVersion,
            completedAt: graph.completedAt, session,
        });
        return restored ? ["accountingReference", "accountingKey",
            "accountingFingerprint", "accountingTargetWalletId",
            "sourceWalletVersion", "targetWalletVersion", "completedAt"] : null;
    }
    async repair(conversionReference, action, adminUserId, transactionAttempt = 0) {
        if (!Object.values(walletConversionRepairAction_enum_1.WalletConversionRepairAction).includes(action)) {
            throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion repair action is invalid.", "WALLET_CONVERSION_OPERATIONAL_INVALID_INPUT");
        }
        const inspection = await walletConversionOperationalInspection_service_1.walletConversionOperationalInspectionService
            .inspect(conversionReference);
        const reconciliation = await walletConversionReconciliation_repository_1.walletConversionReconciliationRepository
            .findByConversionReference(inspection.request.conversionReference);
        if (!reconciliation)
            throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion reconciliation was not found.", "WALLET_CONVERSION_OPERATIONAL_RECONCILIATION_NOT_FOUND");
        const identity = (0, walletConversionOperationalIdentity_util_1.deriveWalletConversionRepairIdentity)(inspection.request.conversionReference, action);
        const existing = await walletConversionRepairOperation_repository_1.walletConversionRepairOperationRepository.findByKey(identity.repairKey);
        if (existing)
            return this.validateReplay(inspection.request.conversionReference, action);
        const expectedIssue = issueFor(action);
        const allowedClassification = action ===
            walletConversionRepairAction_enum_1.WalletConversionRepairAction.RESTORE_MISSING_AUDIT
            ? walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.MISSING_AUDIT : walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.REPLAY_REQUIRED;
        if (inspection.classification !== allowedClassification ||
            inspection.request.status !== walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.COMPLETED ||
            !inspection.graph || inspection.issues.length !== 1 ||
            inspection.issues[0] !== expectedIssue) {
            throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion repair is not allowed.", "WALLET_CONVERSION_OPERATIONAL_REPAIR_NOT_ALLOWED");
        }
        const session = await mongoose_1.default.startSession();
        try {
            let result = null;
            await session.withTransaction(async () => {
                const restoredFields = await this.restore(inspection, action, session);
                if (!restoredFields)
                    throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion repair guard conflicted.", "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT");
                const at = this.now();
                await walletConversionRepairOperation_repository_1.walletConversionRepairOperationRepository.create({
                    ...identity,
                    reconciliationReference: reconciliation.reconciliationReference,
                    conversionReference: inspection.request.conversionReference,
                    action, restoredFields, performedBy: new mongoose_1.Types.ObjectId(adminUserId),
                    status: "APPLIED", performedAt: at,
                }, session);
                result = await walletConversionReconciliation_repository_1.walletConversionReconciliationRepository.markRepair({
                    reference: reconciliation.reconciliationReference,
                    expectedClassification: allowedClassification,
                    classification: walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.HEALTHY, severity: walletConversionOperationalSeverity_enum_1.WalletConversionOperationalSeverity.INFO,
                    issues: [], inspectedAt: at,
                }, session);
                if (!result)
                    throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion repair authority conflicted.", "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT");
                await this.inject("AFTER_REPAIR");
                await this.inject("BEFORE_AUDIT");
                await walletConversionAudit_repository_1.walletConversionAuditRepository.createOnce({
                    auditKey: (0, idempotency_util_1.createIdempotencyFingerprint)(walletConversionAuditAction_enum_1.WalletConversionAuditAction.REPAIRED, inspection.request.conversionKey),
                    action: walletConversionAuditAction_enum_1.WalletConversionAuditAction.REPAIRED,
                    conversionReference: inspection.request.conversionReference,
                    sourceCurrency: inspection.request.sourceCurrency,
                    targetCurrency: inspection.request.targetCurrency,
                    sourceAmount: inspection.request.sourceAmount,
                    targetAmount: inspection.request.targetAmount,
                    fxSnapshotReference: inspection.request.fxSnapshotReference,
                    fxEffectiveDate: inspection.request.fxEffectiveDate,
                    requestedAt: inspection.request.requestedAt,
                    adminActorId: new mongoose_1.Types.ObjectId(adminUserId),
                    reconciliationReference: reconciliation.reconciliationReference,
                    classification: walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.HEALTHY, severity: walletConversionOperationalSeverity_enum_1.WalletConversionOperationalSeverity.INFO,
                    issues: [], retryPerformed: false, repairPerformed: true,
                }, session);
                await this.inject("BEFORE_COMMIT");
            });
            if (!result)
                throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion repair did not commit.", "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT");
            return (0, walletConversionOperational_response_dto_1.toWalletConversionOperationalResponseDto)(result);
        }
        catch (error) {
            if (([11000, 112, 251].includes(error?.code) || error?.code ===
                "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT") &&
                transactionAttempt < 5) {
                const winner = await walletConversionRepairOperation_repository_1.walletConversionRepairOperationRepository.findByKey(identity.repairKey);
                if (winner)
                    return this.validateReplay(inspection.request.conversionReference, action);
                return this.repair(conversionReference, action, adminUserId, transactionAttempt + 1);
            }
            if (error instanceof WalletConversionOperationalError_1.WalletConversionOperationalError)
                throw error;
            throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion repair transaction failed.", "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT", error);
        }
        finally {
            await session.endSession();
        }
    }
    async validateReplay(conversionReference, action) {
        const inspection = await walletConversionOperationalInspection_service_1.walletConversionOperationalInspectionService
            .inspect(conversionReference);
        const reconciliation = await walletConversionReconciliation_repository_1.walletConversionReconciliationRepository
            .findByConversionReference(inspection.request.conversionReference);
        const identity = (0, walletConversionOperationalIdentity_util_1.deriveWalletConversionRepairIdentity)(inspection.request.conversionReference, action);
        const [operation, audits] = await Promise.all([
            walletConversionRepairOperation_repository_1.walletConversionRepairOperationRepository.findByKey(identity.repairKey),
            walletConversionAudit_model_1.WalletConversionAudit.find({
                conversionReference: inspection.request.conversionReference,
                action: walletConversionAuditAction_enum_1.WalletConversionAuditAction.REPAIRED,
            }).select("+adminActorId"),
        ]);
        if (!reconciliation || !operation || audits.length !== 1 ||
            inspection.classification !== walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.HEALTHY ||
            !reconciliation.repairPerformed ||
            operation.repairReference !== identity.repairReference ||
            operation.reconciliationReference !==
                reconciliation.reconciliationReference ||
            operation.conversionReference !== inspection.request.conversionReference ||
            operation.action !== action || operation.status !== "APPLIED" ||
            audits[0].repairPerformed !== true ||
            !audits[0].adminActorId?.equals(operation.performedBy) ||
            audits[0].reconciliationReference !==
                reconciliation.reconciliationReference) {
            throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion repair replay conflicts.", "WALLET_CONVERSION_OPERATIONAL_REPLAY_CONFLICT");
        }
        return (0, walletConversionOperational_response_dto_1.toWalletConversionOperationalResponseDto)(reconciliation);
    }
}
exports.WalletConversionRepairService = WalletConversionRepairService;
exports.walletConversionRepairService = new WalletConversionRepairService();
