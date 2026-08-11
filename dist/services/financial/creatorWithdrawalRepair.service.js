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
exports.creatorWithdrawalRepairService = exports.CreatorWithdrawalRepairService = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const creatorWithdrawalFinalizationOutcome_enum_1 = require("../../enums/financial/creatorWithdrawalFinalizationOutcome.enum");
const creatorWithdrawalOperationalAction_enum_1 = require("../../enums/financial/creatorWithdrawalOperationalAction.enum");
const creatorWithdrawalOperationalClassification_enum_1 = require("../../enums/financial/creatorWithdrawalOperationalClassification.enum");
const creatorWithdrawalOperationalSeverity_enum_1 = require("../../enums/financial/creatorWithdrawalOperationalSeverity.enum");
const creatorWithdrawalRequestStatus_enum_1 = require("../../enums/financial/creatorWithdrawalRequestStatus.enum");
const CreatorWithdrawalOperationalError_1 = require("../../errors/financial/CreatorWithdrawalOperationalError");
const creatorWithdrawalReconciliation_repository_1 = require("../../repositories/creatorWithdrawalReconciliation.repository");
const creatorWithdrawalRepairOperation_repository_1 = require("../../repositories/creatorWithdrawalRepairOperation.repository");
const creatorWithdrawalRequest_repository_1 = require("../../repositories/creatorWithdrawalRequest.repository");
const creatorWithdrawalOperationalIdentity_util_1 = require("../../utils/financial/creatorWithdrawalOperationalIdentity.util");
const auditLog_service_1 = require("../auditLog.service");
const creatorWithdrawalFinalization_service_1 = require("./creatorWithdrawalFinalization.service");
const creatorWithdrawalOperationalInspection_service_1 = require("./creatorWithdrawalOperationalInspection.service");
class CreatorWithdrawalRepairService {
    constructor(onStage = () => undefined) {
        this.onStage = onStage;
    }
    async repair(reconciliationReference, action, adminUserId) {
        if (![creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_FINALIZATION_LINKS,
            creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_TERMINAL_AUDIT].includes(action)) {
            throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Invalid withdrawal repair action.", "CREATOR_WITHDRAWAL_OPERATIONAL_INVALID_ACTION");
        }
        const reconciliation = await creatorWithdrawalReconciliation_repository_1.creatorWithdrawalReconciliationRepository
            .findByReference(reconciliationReference);
        if (!reconciliation)
            throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Withdrawal reconciliation was not found.", "CREATOR_WITHDRAWAL_OPERATIONAL_RECONCILIATION_NOT_FOUND");
        const applied = await creatorWithdrawalRepairOperation_repository_1.creatorWithdrawalRepairOperationRepository
            .findApplied(reconciliationReference, action);
        if (applied && [creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.HEALTHY_COMPLETED,
            creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.HEALTHY_FAILED].includes(reconciliation.classification)) {
            await creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService.validateReplay(reconciliation.withdrawalReference);
            return { repairReference: applied.repairReference,
                reconciliationReference,
                withdrawalReference: reconciliation.withdrawalReference,
                action, repairedFields: applied.repairedFields,
                status: applied.status, replay: true };
        }
        const inspection = await creatorWithdrawalOperationalInspection_service_1.creatorWithdrawalOperationalInspectionService
            .inspect(reconciliation.withdrawalReference);
        if (inspection.snapshotFingerprint !== reconciliation.snapshotFingerprint) {
            throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Withdrawal repair snapshot changed.", "CREATOR_WITHDRAWAL_OPERATIONAL_SNAPSHOT_CONFLICT");
        }
        const allowed = action === creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_FINALIZATION_LINKS
            ? inspection.classification === creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.MISSING_FINALIZATION_LINKS &&
                inspection.missingFinalizationFields.length > 0
            : inspection.classification === creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.MISSING_AUDIT &&
                inspection.terminalAuditCount === 0;
        if (!allowed || !inspection.provider ||
            !inspection.expectedFinalizationIdentity ||
            inspection.finalizationLedgerEntryIds.length !== 2 ||
            !inspection.finalizationProjectionOperationId) {
            throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Repair is not allowed for this withdrawal graph.", "CREATOR_WITHDRAWAL_OPERATIONAL_REPAIR_NOT_ALLOWED");
        }
        const identity = (0, creatorWithdrawalOperationalIdentity_util_1.deriveCreatorWithdrawalRepairIdentity)({
            reconciliationReference,
            withdrawalReference: inspection.withdrawal.withdrawalReference,
            action, snapshotFingerprint: inspection.snapshotFingerprint,
        });
        const existing = await creatorWithdrawalRepairOperation_repository_1.creatorWithdrawalRepairOperationRepository
            .findByKey(identity.repairKey);
        if (existing?.status === "APPLIED")
            return {
                repairReference: existing.repairReference, reconciliationReference,
                withdrawalReference: inspection.withdrawal.withdrawalReference,
                action, repairedFields: existing.repairedFields,
                status: existing.status, replay: true,
            };
        const finalIdentity = inspection.expectedFinalizationIdentity;
        const completed = inspection.provider.providerStatus === "SUCCEEDED";
        const healthyClassification = completed
            ? creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.HEALTHY_COMPLETED : creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.HEALTHY_FAILED;
        const repairedFields = action === creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_FINALIZATION_LINKS
            ? inspection.missingFinalizationFields : ["terminalAudit"];
        const afterSnapshot = {
            ...inspection.snapshot,
            finalizationOutcome: completed ? "COMPLETED" : "FAILED",
            finalizationReference: finalIdentity.finalizationReference,
            finalizationTransactionReference: finalIdentity.finalizationTransactionId,
            finalizationProjectionReference: finalIdentity.projectionReference,
            terminalAuditCount: 1,
            classification: healthyClassification,
            issueCodes: [],
        };
        const afterFingerprint = (0, creatorWithdrawalOperationalIdentity_util_1.fingerprintWithdrawalOperationalSnapshot)(afterSnapshot);
        const session = await mongoose_1.default.startSession();
        try {
            let result = null;
            await session.withTransaction(async () => {
                const operation = await creatorWithdrawalRepairOperation_repository_1.creatorWithdrawalRepairOperationRepository.create({
                    repairReference: identity.repairReference,
                    repairKey: identity.repairKey,
                    reconciliationId: reconciliation._id,
                    reconciliationReference,
                    withdrawalRequestId: inspection.withdrawal._id,
                    withdrawalReference: inspection.withdrawal.withdrawalReference,
                    action, snapshotFingerprint: inspection.snapshotFingerprint,
                    performedBy: new mongoose_1.Types.ObjectId(adminUserId),
                }, session);
                await this.onStage("AFTER_REPAIR_OPERATION_CREATION");
                await this.onStage("BEFORE_GUARDED_METADATA_REPAIR");
                if (action === creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_FINALIZATION_LINKS) {
                    const restored = await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository
                        .restoreFinalizationLinks({
                        requestId: inspection.withdrawal._id,
                        withdrawalReference: inspection.withdrawal.withdrawalReference,
                        status: inspection.withdrawal.status,
                        providerRequestReference: inspection.provider.providerRequestReference,
                        providerTerminalStatus: inspection.provider.providerStatus,
                        missingFields: inspection.missingFinalizationFields,
                        values: {
                            finalizationOutcome: completed ? "COMPLETED" : "FAILED",
                            finalizationReference: finalIdentity.finalizationReference,
                            finalizationKey: finalIdentity.finalizationKey,
                            finalizationTransactionId: finalIdentity.finalizationTransactionId,
                            finalizationLedgerEntryIds: inspection.finalizationLedgerEntryIds,
                            finalizationProjectionOperationId: inspection.finalizationProjectionOperationId,
                            finalizationProjectionOperationReference: finalIdentity.projectionReference,
                            finalizationFingerprint: finalIdentity.finalizationFingerprint,
                            providerTerminalReference: inspection.provider.executionReference,
                        }, expectedVersion: inspection.withdrawal.version,
                    }, session);
                    if (!restored)
                        throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Guarded withdrawal metadata repair conflicted.", "CREATOR_WITHDRAWAL_OPERATIONAL_REPAIR_CONFLICT");
                }
                else {
                    await (0, auditLog_service_1.createFinancialAudit)({
                        action: completed ? auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_COMPLETED
                            : auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_FAILED,
                        actor: { type: "SYSTEM", reference: "CREATOR_WITHDRAWAL_FINALIZATION_AUDIT_REPAIR" },
                        entityType: "CREATOR_WITHDRAWAL_REQUEST",
                        entityId: inspection.withdrawal._id,
                        financialContext: { domain: "WITHDRAWAL",
                            primaryReference: inspection.withdrawal.withdrawalReference,
                            withdrawalReference: inspection.withdrawal.withdrawalReference,
                            provider: "INTERNAL",
                            providerReference: inspection.provider.providerReference,
                            amount: inspection.withdrawal.amount,
                            currency: inspection.withdrawal.currency,
                            ledgerTransactionReference: finalIdentity.finalizationTransactionId,
                            projectionOperationReference: finalIdentity.projectionReference },
                        transition: { fromStatus: creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.RESERVED,
                            toStatus: completed
                                ? creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.COMPLETED
                                : creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.FAILED,
                            outcome: "SUCCEEDED" },
                        metadata: {
                            creatorReference: inspection.provider.creatorReference,
                            creatorUserId: inspection.withdrawal.creatorUserId.toString(),
                            walletReference: inspection.provider.walletReference,
                            destinationReference: inspection.withdrawal.destinationReference,
                            providerRequestReference: inspection.provider.providerRequestReference,
                            providerExecutionReference: inspection.provider.executionReference,
                            finalizationReference: finalIdentity.finalizationReference,
                            finalizationOutcome: completed
                                ? creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
                                : creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.FAILED,
                            reasonCode: completed ? "WITHDRAWAL_RESERVATION_CONSUMED"
                                : "WITHDRAWAL_RESERVATION_RELEASED",
                            ...(!completed ? { failureCode: inspection.provider.terminalResult?.code ??
                                    "INTERNAL_PROVIDER_FAILED" } : {}),
                        }, session,
                    });
                }
                const completedOperation = await creatorWithdrawalRepairOperation_repository_1.creatorWithdrawalRepairOperationRepository
                    .complete(identity.repairKey, repairedFields, new Date(), session);
                const updated = await creatorWithdrawalReconciliation_repository_1.creatorWithdrawalReconciliationRepository
                    .updateAfterRepair({ reference: reconciliationReference,
                    expectedFingerprint: inspection.snapshotFingerprint,
                    classification: healthyClassification,
                    severity: creatorWithdrawalOperationalSeverity_enum_1.CreatorWithdrawalOperationalSeverity.INFO, snapshot: afterSnapshot,
                    snapshotFingerprint: afterFingerprint, issueCodes: [] }, session);
                if (!completedOperation || !updated) {
                    throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Withdrawal repair completion conflicted.", "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT");
                }
                await this.onStage("BEFORE_REPAIR_AUDIT");
                await (0, auditLog_service_1.createFinancialAudit)({
                    action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_METADATA_REPAIRED,
                    actor: { type: "ADMIN", id: new mongoose_1.Types.ObjectId(adminUserId) },
                    entityType: "CREATOR_WITHDRAWAL_REPAIR_OPERATION",
                    entityId: operation._id,
                    financialContext: { domain: "WITHDRAWAL",
                        primaryReference: identity.repairReference,
                        withdrawalReference: inspection.withdrawal.withdrawalReference,
                        amount: inspection.withdrawal.amount,
                        currency: inspection.withdrawal.currency },
                    transition: { fromStatus: inspection.classification,
                        toStatus: healthyClassification, outcome: "SUCCEEDED" },
                    metadata: { reconciliationReference,
                        repairReference: identity.repairReference,
                        operationalAction: action, operationalResult: "APPLIED",
                        classificationBefore: inspection.classification,
                        classificationAfter: healthyClassification,
                        reasonCode: "DETERMINISTIC_METADATA_RESTORED" },
                    session,
                });
                await this.onStage("BEFORE_OPERATIONAL_COMMIT");
                result = { repairReference: identity.repairReference,
                    reconciliationReference,
                    withdrawalReference: inspection.withdrawal.withdrawalReference,
                    action, repairedFields, status: completedOperation.status,
                    replay: false };
            });
            if (!result)
                throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Withdrawal repair returned no result.", "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT");
            await creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService.validateReplay(inspection.withdrawal.withdrawalReference);
            return result;
        }
        catch (error) {
            if (error instanceof CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError)
                throw error;
            throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Withdrawal repair transaction failed.", "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT", error);
        }
        finally {
            await session.endSession();
        }
    }
}
exports.CreatorWithdrawalRepairService = CreatorWithdrawalRepairService;
exports.creatorWithdrawalRepairService = new CreatorWithdrawalRepairService();
