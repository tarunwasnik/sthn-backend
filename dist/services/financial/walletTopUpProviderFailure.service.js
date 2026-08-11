"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletTopUpProviderFailureService = exports.WalletTopUpProviderFailureService = void 0;
const mongoose_1 = require("mongoose");
const walletTopUpRequestStatus_enum_1 = require("../../enums/financial/walletTopUpRequestStatus.enum");
const internalTopUpFundingStatus_enum_1 = require("../../enums/financial/internalTopUpFundingStatus.enum");
const walletTopUpReconciliationClassification_enum_1 = require("../../enums/financial/walletTopUpReconciliationClassification.enum");
const walletTopUpOperationalAction_enum_1 = require("../../enums/financial/walletTopUpOperationalAction.enum");
const walletTopUpRequest_repository_1 = require("../../repositories/walletTopUpRequest.repository");
const walletTopUpReconciliation_service_1 = require("./walletTopUpReconciliation.service");
const walletTopUpOperationalAudit_service_1 = require("./walletTopUpOperationalAudit.service");
const topUpAccountingOrchestrator_service_1 = require("./topUpAccountingOrchestrator.service");
const WalletTopUpReconciliationError_1 = require("../../errors/financial/WalletTopUpReconciliationError");
class WalletTopUpProviderFailureService {
    conflict(message) {
        return new WalletTopUpReconciliationError_1.WalletTopUpReconciliationError(message, WalletTopUpReconciliationError_1.WalletTopUpReconciliationErrorCode.PROVIDER_FAILURE_CONFLICT);
    }
    async finalize(topUpReference, adminUserId) {
        const actorId = new mongoose_1.Types.ObjectId(adminUserId);
        const inspected = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspectForOperation(topUpReference);
        const { request, funding, ledger, operation } = inspected.observation;
        if (!funding || funding.status !== internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.FAILED ||
            inspected.observation.classification !== walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.PROVIDER_FAILED ||
            ledger || operation || !request.providerFundingId ||
            request.providerFundingReference !== funding.fundingReference) {
            await walletTopUpOperationalAudit_service_1.walletTopUpOperationalAuditService.record({
                topUpReference,
                reconciliationReference: inspected.reconciliation.reconciliationReference,
                action: walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.FINALIZE_PROVIDER_FAILURE,
                actorType: "ADMIN",
                actorId,
                result: "REJECTED",
                classificationBefore: inspected.observation.classification,
                reasonCode: "PROVIDER_FAILURE_NOT_FINALIZABLE",
            });
            throw this.conflict("Provider failure cannot be finalized from the persisted financial state.");
        }
        if (request.status === walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.FAILED) {
            return walletTopUpReconciliation_service_1.walletTopUpReconciliationService.toSafeResult(inspected.reconciliation);
        }
        if (request.status === walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.COMPLETED) {
            await topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.complete(topUpReference);
            throw this.conflict("A completed top-up cannot be finalized as failed.");
        }
        if (request.status !== walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.PROCESSING) {
            throw this.conflict("Top-up request is not processing.");
        }
        const failureCode = funding.failureCode ?? "PROVIDER_FAILED";
        const failureReason = funding.failureReason;
        const providerFailedAt = funding.failedAt ?? funding.updatedAt;
        const failureFinalizedAt = new Date();
        const updated = await walletTopUpRequest_repository_1.walletTopUpRequestRepository.finalizeProcessingAsFailed({
            topUpReference,
            providerFundingId: funding._id,
            providerFundingReference: funding.fundingReference,
            failureCode,
            failureReason,
            providerFailedAt,
            failureFinalizedAt,
            failureFinalizedBy: actorId,
        });
        if (!updated) {
            const current = await walletTopUpRequest_repository_1.walletTopUpRequestRepository.findByReferenceForAccounting(topUpReference);
            if (!current || current.status !== walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.FAILED ||
                !current.providerFundingId?.equals(funding._id) ||
                current.providerFundingReference !== funding.fundingReference ||
                current.failureCode !== failureCode ||
                (current.failureReason ?? undefined) !== (failureReason ?? undefined) ||
                current.providerFailedAt?.getTime() !== providerFailedAt.getTime()) {
                if (current?.status === walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.COMPLETED) {
                    await topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.complete(topUpReference);
                }
                throw this.conflict("Provider failure finalization conflicted with authoritative state.");
            }
        }
        const after = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspectForOperation(topUpReference);
        await walletTopUpOperationalAudit_service_1.walletTopUpOperationalAuditService.record({
            topUpReference,
            reconciliationReference: after.reconciliation.reconciliationReference,
            action: walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.FINALIZE_PROVIDER_FAILURE,
            actorType: "ADMIN",
            actorId,
            result: "SUCCEEDED",
            classificationBefore: inspected.observation.classification,
            classificationAfter: after.observation.classification,
            reasonCode: "PROVIDER_FAILURE_FINALIZED",
            metadata: { failureCode },
        });
        return walletTopUpReconciliation_service_1.walletTopUpReconciliationService.toSafeResult(after.reconciliation);
    }
}
exports.WalletTopUpProviderFailureService = WalletTopUpProviderFailureService;
exports.walletTopUpProviderFailureService = new WalletTopUpProviderFailureService();
