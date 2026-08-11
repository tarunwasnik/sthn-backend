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
exports.creatorWithdrawalFinalizationRetryService = exports.CreatorWithdrawalFinalizationRetryService = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const creatorWithdrawalRetryPolicy_1 = require("../../constants/financial/creatorWithdrawalRetryPolicy");
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const creatorWithdrawalOperationalAction_enum_1 = require("../../enums/financial/creatorWithdrawalOperationalAction.enum");
const creatorWithdrawalOperationalClassification_enum_1 = require("../../enums/financial/creatorWithdrawalOperationalClassification.enum");
const CreatorWithdrawalOperationalError_1 = require("../../errors/financial/CreatorWithdrawalOperationalError");
const creatorWithdrawalReconciliation_repository_1 = require("../../repositories/creatorWithdrawalReconciliation.repository");
const creatorWithdrawalRetryAttempt_repository_1 = require("../../repositories/creatorWithdrawalRetryAttempt.repository");
const creatorWithdrawalOperationalIdentity_util_1 = require("../../utils/financial/creatorWithdrawalOperationalIdentity.util");
const auditLog_service_1 = require("../auditLog.service");
const creatorWithdrawalFinalization_service_1 = require("./creatorWithdrawalFinalization.service");
const creatorWithdrawalOperationalInspection_service_1 = require("./creatorWithdrawalOperationalInspection.service");
const pending = new Set([
    creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.FINALIZATION_PENDING_SUCCESS,
    creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.FINALIZATION_PENDING_FAILURE,
]);
class CreatorWithdrawalFinalizationRetryService {
    constructor(onStage = () => undefined) {
        this.onStage = onStage;
    }
    async retry(reconciliationReference, adminUserId) {
        const reconciliation = await creatorWithdrawalReconciliation_repository_1.creatorWithdrawalReconciliationRepository
            .findByReference(reconciliationReference);
        if (!reconciliation)
            throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Withdrawal reconciliation was not found.", "CREATOR_WITHDRAWAL_OPERATIONAL_RECONCILIATION_NOT_FOUND");
        const inspection = await creatorWithdrawalOperationalInspection_service_1.creatorWithdrawalOperationalInspectionService
            .inspect(reconciliation.withdrawalReference);
        if (inspection.classification !== reconciliation.classification) {
            throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Withdrawal operational classification changed.", "CREATOR_WITHDRAWAL_OPERATIONAL_CLASSIFICATION_CHANGED");
        }
        if (inspection.snapshotFingerprint !== reconciliation.snapshotFingerprint) {
            throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Withdrawal operational snapshot changed.", "CREATOR_WITHDRAWAL_OPERATIONAL_SNAPSHOT_CONFLICT");
        }
        if (!pending.has(inspection.classification)) {
            throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Finalization retry is not allowed for this classification.", "CREATOR_WITHDRAWAL_OPERATIONAL_RETRY_NOT_ALLOWED");
        }
        if (reconciliation.retryCount >= reconciliation.maxRetryCount) {
            throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Withdrawal finalization retry limit was exceeded.", "CREATOR_WITHDRAWAL_OPERATIONAL_RETRY_LIMIT_EXCEEDED");
        }
        const attemptNumber = reconciliation.retryCount + 1;
        const identity = (0, creatorWithdrawalOperationalIdentity_util_1.deriveCreatorWithdrawalRetryIdentity)({
            reconciliationReference, withdrawalReference: reconciliation.withdrawalReference,
            attemptNumber, snapshotFingerprint: inspection.snapshotFingerprint,
        });
        const existing = await creatorWithdrawalRetryAttempt_repository_1.creatorWithdrawalRetryAttemptRepository
            .findByKey(identity.attemptKey);
        if (existing?.status === "APPLIED")
            return {
                attemptReference: existing.attemptReference,
                reconciliationReference, withdrawalReference: reconciliation.withdrawalReference, status: existing.status,
                classification: reconciliation.classification,
                resultCode: existing.safeErrorCode, replay: true,
            };
        const claimSession = await mongoose_1.default.startSession();
        try {
            await claimSession.withTransaction(async () => {
                const claimed = await creatorWithdrawalReconciliation_repository_1.creatorWithdrawalReconciliationRepository
                    .beginRetry({ reference: reconciliationReference,
                    fingerprint: inspection.snapshotFingerprint,
                    classification: inspection.classification,
                    expectedRetryCount: reconciliation.retryCount, at: new Date() }, claimSession);
                if (!claimed)
                    throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Withdrawal retry authority conflicted.", "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT");
                await creatorWithdrawalRetryAttempt_repository_1.creatorWithdrawalRetryAttemptRepository.create({
                    attemptReference: identity.attemptReference,
                    attemptKey: identity.attemptKey,
                    reconciliationId: claimed._id,
                    reconciliationReference,
                    withdrawalRequestId: inspection.withdrawal._id,
                    withdrawalReference: inspection.withdrawal.withdrawalReference,
                    attemptNumber,
                    action: "RETRY_FINALIZATION",
                    snapshotFingerprint: inspection.snapshotFingerprint,
                    actorType: "ADMIN", actorId: new mongoose_1.Types.ObjectId(adminUserId),
                    startedAt: new Date(),
                }, claimSession);
                await this.onStage("AFTER_RETRY_ATTEMPT_CREATION");
            });
        }
        finally {
            await claimSession.endSession();
        }
        try {
            await creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService.finalize(inspection.withdrawal.withdrawalReference);
        }
        catch (error) {
            const code = error.code ??
                "PHASE9D_FINALIZATION_FAILED";
            const nextRetryAt = attemptNumber < reconciliation.maxRetryCount
                ? new Date(Date.now() + (0, creatorWithdrawalRetryPolicy_1.withdrawalRetryDelay)(attemptNumber)) : undefined;
            const failureSession = await mongoose_1.default.startSession();
            try {
                await failureSession.withTransaction(async () => {
                    const [attempt, failed] = await Promise.all([
                        creatorWithdrawalRetryAttempt_repository_1.creatorWithdrawalRetryAttemptRepository.complete(identity.attemptKey, "FAILED", code, new Date(), nextRetryAt, failureSession),
                        creatorWithdrawalReconciliation_repository_1.creatorWithdrawalReconciliationRepository.failRetry({
                            reference: reconciliationReference, retryCount: attemptNumber,
                            resultCode: code, nextRetryAt,
                        }, failureSession),
                    ]);
                    if (!attempt || !failed)
                        throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Withdrawal retry failure persistence conflicted.", "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT");
                    await (0, auditLog_service_1.createFinancialAudit)({
                        action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_FINALIZATION_RETRIED,
                        actor: { type: "ADMIN", id: new mongoose_1.Types.ObjectId(adminUserId) },
                        entityType: "CREATOR_WITHDRAWAL_RETRY_ATTEMPT",
                        entityId: attempt._id,
                        financialContext: { domain: "WITHDRAWAL",
                            primaryReference: identity.attemptReference,
                            withdrawalReference: inspection.withdrawal.withdrawalReference,
                            providerReference: inspection.provider?.providerReference,
                            amount: inspection.withdrawal.amount,
                            currency: inspection.withdrawal.currency },
                        transition: { fromStatus: inspection.classification,
                            toStatus: inspection.classification, outcome: "FAILED" },
                        metadata: { reconciliationReference, attemptReference: identity.attemptReference, operationalAction: creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RETRY_FINALIZATION, operationalResult: "FAILED",
                            classificationBefore: inspection.classification,
                            classificationAfter: inspection.classification,
                            reasonCode: code },
                        session: failureSession,
                    });
                });
            }
            finally {
                await failureSession.endSession();
            }
            throw error;
        }
        await this.onStage("AFTER_PHASE9D_FINALIZATION");
        const after = await creatorWithdrawalOperationalInspection_service_1.creatorWithdrawalOperationalInspectionService.inspect(inspection.withdrawal.withdrawalReference);
        if (![creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.HEALTHY_COMPLETED,
            creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.HEALTHY_FAILED].includes(after.classification)) {
            throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Phase 9D retry did not produce a healthy terminal graph.", "CREATOR_WITHDRAWAL_OPERATIONAL_REPLAY_CONFLICT");
        }
        await this.onStage("BEFORE_POST_FINALIZATION_UPDATE");
        const updateSession = await mongoose_1.default.startSession();
        try {
            let result = null;
            await updateSession.withTransaction(async () => {
                const attempt = await creatorWithdrawalRetryAttempt_repository_1.creatorWithdrawalRetryAttemptRepository.complete(identity.attemptKey, "APPLIED", "PHASE9D_FINALIZATION_APPLIED", new Date(), undefined, updateSession);
                const updated = await creatorWithdrawalReconciliation_repository_1.creatorWithdrawalReconciliationRepository
                    .completeRetry({ reference: reconciliationReference,
                    retryCount: attemptNumber, classification: after.classification,
                    severity: after.severity, snapshot: after.snapshot,
                    snapshotFingerprint: after.snapshotFingerprint,
                    issueCodes: after.issueCodes,
                    resultCode: "PHASE9D_FINALIZATION_APPLIED" }, updateSession);
                if (!attempt || !updated)
                    throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Withdrawal retry operational update conflicted.", "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT");
                await this.onStage("BEFORE_RETRY_AUDIT");
                await (0, auditLog_service_1.createFinancialAudit)({
                    action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_FINALIZATION_RETRIED,
                    actor: { type: "ADMIN", id: new mongoose_1.Types.ObjectId(adminUserId) },
                    entityType: "CREATOR_WITHDRAWAL_RETRY_ATTEMPT",
                    entityId: attempt._id,
                    financialContext: { domain: "WITHDRAWAL",
                        primaryReference: identity.attemptReference,
                        withdrawalReference: inspection.withdrawal.withdrawalReference,
                        providerReference: inspection.provider?.providerReference,
                        amount: inspection.withdrawal.amount,
                        currency: inspection.withdrawal.currency },
                    transition: { fromStatus: inspection.classification,
                        toStatus: after.classification, outcome: "SUCCEEDED" },
                    metadata: { reconciliationReference, attemptReference: identity.attemptReference, operationalAction: creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RETRY_FINALIZATION, operationalResult: "APPLIED",
                        classificationBefore: inspection.classification,
                        classificationAfter: after.classification,
                        reasonCode: "PHASE9D_FINALIZATION_APPLIED" },
                    session: updateSession,
                });
                await this.onStage("BEFORE_OPERATIONAL_COMMIT");
                result = { attemptReference: attempt.attemptReference,
                    reconciliationReference, withdrawalReference: inspection.withdrawal.withdrawalReference,
                    classification: after.classification, status: attempt.status,
                    resultCode: attempt.safeErrorCode, replay: false };
            });
            if (!result)
                throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Withdrawal retry returned no result.", "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT");
            return result;
        }
        finally {
            await updateSession.endSession();
        }
    }
}
exports.CreatorWithdrawalFinalizationRetryService = CreatorWithdrawalFinalizationRetryService;
exports.creatorWithdrawalFinalizationRetryService = new CreatorWithdrawalFinalizationRetryService();
