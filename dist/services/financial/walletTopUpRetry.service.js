"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletTopUpRetryService = exports.WalletTopUpRetryService = void 0;
const mongoose_1 = require("mongoose");
const FinancialError_1 = require("../../errors/financial/FinancialError");
const WalletTopUpReconciliationError_1 = require("../../errors/financial/WalletTopUpReconciliationError");
const walletTopUpOperationalAction_enum_1 = require("../../enums/financial/walletTopUpOperationalAction.enum");
const walletTopUpReconciliationClassification_enum_1 = require("../../enums/financial/walletTopUpReconciliationClassification.enum");
const walletTopUpReconciliationStatus_enum_1 = require("../../enums/financial/walletTopUpReconciliationStatus.enum");
const internalTopUpFundingStatus_enum_1 = require("../../enums/financial/internalTopUpFundingStatus.enum");
const walletTopUpRetryPolicy_1 = require("../../constants/financial/walletTopUpRetryPolicy");
const walletTopUpReconciliation_repository_1 = require("../../repositories/walletTopUpReconciliation.repository");
const walletTopUpRetryAttempt_repository_1 = require("../../repositories/walletTopUpRetryAttempt.repository");
const walletTopUpReconciliation_service_1 = require("./walletTopUpReconciliation.service");
const walletTopUpOperationalAudit_service_1 = require("./walletTopUpOperationalAudit.service");
const topUpAccountingOrchestrator_service_1 = require("./topUpAccountingOrchestrator.service");
const RETRYABLE = new Set([
    walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.ACCOUNTING_NOT_STARTED,
    walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.LEDGER_ONLY,
    walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.LEDGER_AND_PROJECTION,
    walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.COMPLETION_PENDING,
]);
class WalletTopUpRetryService {
    error(message, code) {
        return new WalletTopUpReconciliationError_1.WalletTopUpReconciliationError(message, WalletTopUpReconciliationError_1.WalletTopUpReconciliationErrorCode[code]);
    }
    async retry(reconciliationReference, action, adminUserId) {
        if (![walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RETRY_ACCOUNTING, walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RETRY_COMPLETION].includes(action)) {
            throw this.error("Invalid top-up retry action.", "INVALID_ACTION");
        }
        const actorId = new mongoose_1.Types.ObjectId(adminUserId);
        const loaded = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.getByReference(reconciliationReference);
        if ([walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.RESOLVED, walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.ACKNOWLEDGED].includes(loaded.status)) {
            throw this.error("Top-up reconciliation is already resolved.", "ALREADY_RESOLVED");
        }
        if (loaded.retryCount >= loaded.maxRetryCount) {
            throw this.error("Top-up accounting retry limit was exceeded.", "RETRY_LIMIT_EXCEEDED");
        }
        const inspected = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspectForOperation(loaded.topUpReference);
        if (loaded.fingerprint !== inspected.observation.fingerprint ||
            loaded.classification !== inspected.observation.classification) {
            throw this.error("Top-up reconciliation classification changed.", "CLASSIFICATION_CHANGED");
        }
        if (!RETRYABLE.has(inspected.observation.classification) ||
            !inspected.observation.allowedActions.includes(action) ||
            (action === walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RETRY_COMPLETION &&
                inspected.observation.classification !== walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.COMPLETION_PENDING) ||
            inspected.observation.funding?.status !== internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.SUCCEEDED) {
            throw this.error("Accounting retry is not allowed for this classification.", "RETRY_NOT_ALLOWED");
        }
        const startedAt = new Date();
        const claimed = await walletTopUpReconciliation_repository_1.walletTopUpReconciliationRepository.beginRetry({
            reconciliationReference,
            fingerprint: inspected.observation.fingerprint,
            classification: inspected.observation.classification,
            retryCount: loaded.retryCount,
            at: startedAt,
            action,
        });
        if (!claimed)
            throw this.error("Accounting retry snapshot conflicted.", "SNAPSHOT_CONFLICT");
        const attemptNumber = claimed.retryCount;
        const operationKey = `${reconciliationReference}:${attemptNumber}:${action}`;
        await walletTopUpRetryAttempt_repository_1.walletTopUpRetryAttemptRepository.create({
            operationKey,
            reconciliationReference,
            topUpReference: claimed.topUpReference,
            attemptNumber,
            action,
            actorId,
            startedAt,
        });
        await walletTopUpOperationalAudit_service_1.walletTopUpOperationalAuditService.record({
            topUpReference: claimed.topUpReference,
            reconciliationReference,
            action,
            actorType: "ADMIN",
            actorId,
            result: "SUCCEEDED",
            classificationBefore: claimed.classification,
            reasonCode: "RETRY_REQUESTED",
            metadata: { attemptNumber },
        });
        try {
            await topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.complete(claimed.topUpReference);
            const after = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspectForOperation(claimed.topUpReference);
            if (after.observation.classification === walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.COMPLETED_VALID) {
                await walletTopUpReconciliation_repository_1.walletTopUpReconciliationRepository.updateResolution({
                    reconciliationReference,
                    fingerprint: after.observation.fingerprint,
                    expectedStatuses: [walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.IN_PROGRESS, walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.RESOLVED],
                    status: walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.RESOLVED,
                    action: walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RESOLVE_RECONCILIATION,
                    code: "ACCOUNTING_RETRY_COMPLETED",
                    at: new Date(),
                    actorId,
                });
                await walletTopUpRetryAttempt_repository_1.walletTopUpRetryAttemptRepository.complete(operationKey, {
                    completedAt: new Date(),
                    resultCode: "COMPLETED_VALID",
                });
                await walletTopUpOperationalAudit_service_1.walletTopUpOperationalAuditService.record({
                    topUpReference: claimed.topUpReference,
                    reconciliationReference,
                    action,
                    actorType: "ADMIN",
                    actorId,
                    result: "SUCCEEDED",
                    classificationBefore: claimed.classification,
                    classificationAfter: after.observation.classification,
                    reasonCode: "RETRY_SUCCEEDED",
                    metadata: { attemptNumber },
                });
                const resolved = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.getByReference(reconciliationReference);
                return walletTopUpReconciliation_service_1.walletTopUpReconciliationService.toSafeResult(resolved);
            }
            const stillRetryable = RETRYABLE.has(after.observation.classification);
            const nextRetryAt = stillRetryable && attemptNumber < claimed.maxRetryCount
                ? new Date(Date.now() + (0, walletTopUpRetryPolicy_1.walletTopUpRetryDelay)(attemptNumber)) : undefined;
            await walletTopUpReconciliation_repository_1.walletTopUpReconciliationRepository.completeRetry({
                reconciliationReference,
                retryCount: attemptNumber,
                status: nextRetryAt ? walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.RETRY_SCHEDULED : walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.FAILED,
                resultCode: stillRetryable ? "RETRY_INCOMPLETE" : "RETRY_RECLASSIFIED",
                nextRetryAt,
            });
            await walletTopUpRetryAttempt_repository_1.walletTopUpRetryAttemptRepository.complete(operationKey, {
                completedAt: new Date(),
                resultCode: stillRetryable ? "RETRY_INCOMPLETE" : "RETRY_RECLASSIFIED",
                nextRetryAt,
            });
            if (!stillRetryable) {
                throw this.error("Accounting retry produced a non-retryable classification.", "CLASSIFICATION_CHANGED");
            }
            return walletTopUpReconciliation_service_1.walletTopUpReconciliationService.toSafeResult(await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.getByReference(reconciliationReference));
        }
        catch (error) {
            const safeErrorCode = error instanceof FinancialError_1.FinancialError ? error.code : WalletTopUpReconciliationError_1.WalletTopUpReconciliationErrorCode.INTEGRITY_ERROR;
            const nextRetryAt = attemptNumber < claimed.maxRetryCount
                ? new Date(Date.now() + (0, walletTopUpRetryPolicy_1.walletTopUpRetryDelay)(attemptNumber)) : undefined;
            await walletTopUpReconciliation_repository_1.walletTopUpReconciliationRepository.completeRetry({
                reconciliationReference,
                retryCount: attemptNumber,
                status: nextRetryAt ? walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.RETRY_SCHEDULED : walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.FAILED,
                resultCode: "RETRY_FAILED",
                nextRetryAt,
            });
            await walletTopUpRetryAttempt_repository_1.walletTopUpRetryAttemptRepository.complete(operationKey, {
                completedAt: new Date(),
                resultCode: "RETRY_FAILED",
                safeErrorCode,
                nextRetryAt,
            });
            await walletTopUpOperationalAudit_service_1.walletTopUpOperationalAuditService.record({
                topUpReference: claimed.topUpReference,
                reconciliationReference,
                action,
                actorType: "ADMIN",
                actorId,
                result: "FAILED",
                classificationBefore: claimed.classification,
                reasonCode: "RETRY_FAILED",
                metadata: { attemptNumber, failureCode: safeErrorCode },
            });
            throw error;
        }
    }
}
exports.WalletTopUpRetryService = WalletTopUpRetryService;
exports.walletTopUpRetryService = new WalletTopUpRetryService();
