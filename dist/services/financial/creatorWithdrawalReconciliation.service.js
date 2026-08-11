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
exports.creatorWithdrawalReconciliationService = exports.CreatorWithdrawalReconciliationService = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const creatorWithdrawalRetryPolicy_1 = require("../../constants/financial/creatorWithdrawalRetryPolicy");
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const creatorWithdrawalOperationalAction_enum_1 = require("../../enums/financial/creatorWithdrawalOperationalAction.enum");
const creatorWithdrawalReconciliationStatus_enum_1 = require("../../enums/financial/creatorWithdrawalReconciliationStatus.enum");
const CreatorWithdrawalOperationalError_1 = require("../../errors/financial/CreatorWithdrawalOperationalError");
const auditLog_model_1 = require("../../models/auditLog.model");
const creatorWithdrawalReconciliation_repository_1 = require("../../repositories/creatorWithdrawalReconciliation.repository");
const auditLog_service_1 = require("../auditLog.service");
const creatorWithdrawalOperationalInspection_service_1 = require("./creatorWithdrawalOperationalInspection.service");
class CreatorWithdrawalReconciliationService {
    constructor(onStage = () => undefined) {
        this.onStage = onStage;
    }
    safe(reconciliation) {
        return {
            reconciliationReference: reconciliation.reconciliationReference,
            withdrawalReference: reconciliation.withdrawalReference,
            providerRequestReference: reconciliation.providerRequestReference,
            classification: reconciliation.classification,
            status: reconciliation.status,
            severity: reconciliation.severity,
            issueCodes: reconciliation.issueCodes,
            recommendedAction: reconciliation.recommendedAction,
            allowedActions: reconciliation.allowedActions,
            retryCount: reconciliation.retryCount,
            maxRetryCount: reconciliation.maxRetryCount,
            nextRetryAt: reconciliation.nextRetryAt,
            acknowledgedAt: reconciliation.acknowledgedAt,
            resolvedAt: reconciliation.resolvedAt,
            resolutionCode: reconciliation.resolutionCode,
            resolutionNote: reconciliation.resolutionNote,
            detectedAt: reconciliation.detectedAt,
            lastInspectedAt: reconciliation.lastInspectedAt,
            createdAt: reconciliation.createdAt,
            updatedAt: reconciliation.updatedAt,
        };
    }
    async inspect(withdrawalReference, adminUserId) {
        const inspection = await creatorWithdrawalOperationalInspection_service_1.creatorWithdrawalOperationalInspectionService
            .inspect(withdrawalReference);
        const session = await mongoose_1.default.startSession();
        try {
            const result = {
                value: null,
            };
            await session.withTransaction(async () => {
                const at = new Date();
                const reconciliation = await creatorWithdrawalReconciliation_repository_1.creatorWithdrawalReconciliationRepository
                    .upsertObservation({
                    ...inspection.reconciliationIdentity,
                    withdrawalRequestId: inspection.withdrawal._id,
                    withdrawalReference: inspection.withdrawal.withdrawalReference,
                    providerRequestId: inspection.provider?._id,
                    providerRequestReference: inspection.provider?.providerRequestReference,
                    creatorId: inspection.withdrawal.creatorId,
                    creatorUserId: inspection.withdrawal.creatorUserId,
                    walletId: inspection.withdrawal.walletId,
                    destinationReference: inspection.withdrawal.destinationReference,
                    classification: inspection.classification,
                    severity: inspection.severity,
                    issueCodes: inspection.issueCodes,
                    recommendedAction: inspection.recommendedAction,
                    allowedActions: inspection.allowedActions,
                    snapshot: inspection.snapshot,
                    snapshotFingerprint: inspection.snapshotFingerprint,
                    maxRetryCount: creatorWithdrawalRetryPolicy_1.MAX_WITHDRAWAL_FINALIZATION_RETRIES,
                    inspectedAt: at,
                }, session);
                await this.onStage("AFTER_RECONCILIATION_AUTHORITY");
                await this.onStage("BEFORE_RECONCILIATION_AUDIT");
                const auditExists = await auditLog_model_1.AuditLog.exists({
                    action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_RECONCILIATION_CREATED,
                    entityId: reconciliation._id,
                }).session(session);
                if (!auditExists)
                    await (0, auditLog_service_1.createFinancialAudit)({
                        action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_RECONCILIATION_CREATED,
                        actor: { type: "ADMIN", id: new mongoose_1.Types.ObjectId(adminUserId) },
                        entityType: "CREATOR_WITHDRAWAL_RECONCILIATION",
                        entityId: reconciliation._id,
                        financialContext: {
                            domain: "WITHDRAWAL",
                            primaryReference: reconciliation.reconciliationReference,
                            withdrawalReference: reconciliation.withdrawalReference,
                            providerReference: inspection.provider?.providerReference,
                            amount: inspection.withdrawal.amount,
                            currency: inspection.withdrawal.currency,
                        },
                        transition: { toStatus: reconciliation.status, outcome: inspection.issueCodes.length ? "CONFLICT" : "SUCCEEDED" },
                        metadata: {
                            reconciliationReference: reconciliation.reconciliationReference,
                            classification: inspection.classification,
                            operationalAction: creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.INSPECT,
                            operationalResult: "INSPECTED",
                            destinationReference: inspection.withdrawal.destinationReference,
                            ...(inspection.provider ? {
                                providerRequestReference: inspection.provider.providerRequestReference,
                                walletReference: inspection.provider.walletReference,
                                creatorReference: inspection.provider.creatorReference,
                            } : {}),
                        },
                        session,
                    });
                await this.onStage("BEFORE_OPERATIONAL_COMMIT");
                result.value = this.safe(reconciliation);
            });
            if (!result.value)
                throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Withdrawal reconciliation did not commit.", "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT");
            return result.value;
        }
        catch (error) {
            if (error instanceof CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError)
                throw error;
            throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Withdrawal reconciliation transaction failed.", "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT", error);
        }
        finally {
            await session.endSession();
        }
    }
    async list(input) {
        const page = input.page === undefined ? 1 : Number(input.page);
        const limit = input.limit === undefined ? 25 : Number(input.limit);
        if (!Number.isSafeInteger(page) || page < 1 ||
            !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
            throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Invalid reconciliation pagination.", "CREATOR_WITHDRAWAL_OPERATIONAL_INVALID_ACTION");
        }
        const result = await creatorWithdrawalReconciliation_repository_1.creatorWithdrawalReconciliationRepository.list({
            ...input, page, limit,
        });
        return {
            items: result.items.map((item) => this.safe(item)),
            pagination: { page, limit, total: result.total },
        };
    }
    async updateStatus(input) {
        const reconciliation = await creatorWithdrawalReconciliation_repository_1.creatorWithdrawalReconciliationRepository
            .findByReference(input.reconciliationReference);
        if (!reconciliation)
            throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Withdrawal reconciliation was not found.", "CREATOR_WITHDRAWAL_OPERATIONAL_RECONCILIATION_NOT_FOUND");
        if (reconciliation.status === creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.RESOLVED) {
            throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Withdrawal reconciliation is already resolved.", "CREATOR_WITHDRAWAL_OPERATIONAL_ALREADY_RESOLVED");
        }
        const acknowledge = input.action === creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.ACKNOWLEDGE;
        if (!acknowledge && input.action !== creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESOLVE) {
            throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Invalid reconciliation status action.", "CREATOR_WITHDRAWAL_OPERATIONAL_INVALID_ACTION");
        }
        const session = await mongoose_1.default.startSession();
        try {
            const result = {
                value: null,
            };
            await session.withTransaction(async () => {
                await this.onStage(acknowledge ? "BEFORE_ACKNOWLEDGEMENT" :
                    "BEFORE_RESOLUTION");
                const updated = await creatorWithdrawalReconciliation_repository_1.creatorWithdrawalReconciliationRepository
                    .transitionStatus({
                    reference: input.reconciliationReference,
                    expectedStatuses: acknowledge
                        ? [creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.OPEN, creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.FAILED, creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.RETRY_SCHEDULED]
                        : [creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.OPEN, creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.ACKNOWLEDGED, creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.FAILED,
                            creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.RETRY_SCHEDULED],
                    status: acknowledge ? creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.ACKNOWLEDGED : creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.RESOLVED,
                    actorId: new mongoose_1.Types.ObjectId(input.adminUserId),
                    code: input.resolutionCode, note: input.resolutionNote,
                    at: new Date(),
                }, session);
                if (!updated)
                    throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Reconciliation lifecycle transition conflicted.", "CREATOR_WITHDRAWAL_OPERATIONAL_INVALID_STATUS");
                await (0, auditLog_service_1.createFinancialAudit)({
                    action: acknowledge
                        ? auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_RECONCILIATION_ACKNOWLEDGED
                        : auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_RECONCILIATION_RESOLVED,
                    actor: { type: "ADMIN", id: new mongoose_1.Types.ObjectId(input.adminUserId) },
                    entityType: "CREATOR_WITHDRAWAL_RECONCILIATION",
                    entityId: updated._id,
                    financialContext: { domain: "WITHDRAWAL",
                        primaryReference: updated.reconciliationReference,
                        withdrawalReference: updated.withdrawalReference },
                    transition: { fromStatus: reconciliation.status,
                        toStatus: updated.status, outcome: "SUCCEEDED" },
                    metadata: {
                        reconciliationReference: updated.reconciliationReference,
                        classification: updated.classification,
                        operationalAction: input.action,
                        operationalResult: updated.status,
                        reasonCode: input.resolutionCode,
                    }, session,
                });
                await this.onStage("BEFORE_OPERATIONAL_COMMIT");
                result.value = this.safe(updated);
            });
            if (!result.value)
                throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Reconciliation status update did not commit.", "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT");
            return result.value;
        }
        finally {
            await session.endSession();
        }
    }
}
exports.CreatorWithdrawalReconciliationService = CreatorWithdrawalReconciliationService;
exports.creatorWithdrawalReconciliationService = new CreatorWithdrawalReconciliationService();
