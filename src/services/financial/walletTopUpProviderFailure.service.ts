import { Types } from "mongoose";
import { WalletTopUpRequestStatus } from "../../enums/financial/walletTopUpRequestStatus.enum";
import { InternalTopUpFundingStatus } from "../../enums/financial/internalTopUpFundingStatus.enum";
import { WalletTopUpReconciliationClassification as Classification } from "../../enums/financial/walletTopUpReconciliationClassification.enum";
import { WalletTopUpOperationalAction as Action } from "../../enums/financial/walletTopUpOperationalAction.enum";
import { walletTopUpRequestRepository } from "../../repositories/walletTopUpRequest.repository";
import { walletTopUpReconciliationService } from "./walletTopUpReconciliation.service";
import { walletTopUpOperationalAuditService } from "./walletTopUpOperationalAudit.service";
import { topUpAccountingOrchestratorService } from "./topUpAccountingOrchestrator.service";
import {
  WalletTopUpReconciliationError,
  WalletTopUpReconciliationErrorCode as ErrorCode,
} from "../../errors/financial/WalletTopUpReconciliationError";

export class WalletTopUpProviderFailureService {
  private conflict(message: string) {
    return new WalletTopUpReconciliationError(
      message,
      ErrorCode.PROVIDER_FAILURE_CONFLICT,
    );
  }

  async finalize(topUpReference: string, adminUserId: string) {
    const actorId = new Types.ObjectId(adminUserId);
    const inspected = await walletTopUpReconciliationService.inspectForOperation(topUpReference);
    const { request, funding, ledger, operation } = inspected.observation;
    if (!funding || funding.status !== InternalTopUpFundingStatus.FAILED ||
      inspected.observation.classification !== Classification.PROVIDER_FAILED ||
      ledger || operation || !request.providerFundingId ||
      request.providerFundingReference !== funding.fundingReference) {
      await walletTopUpOperationalAuditService.record({
        topUpReference,
        reconciliationReference: inspected.reconciliation.reconciliationReference,
        action: Action.FINALIZE_PROVIDER_FAILURE,
        actorType: "ADMIN",
        actorId,
        result: "REJECTED",
        classificationBefore: inspected.observation.classification,
        reasonCode: "PROVIDER_FAILURE_NOT_FINALIZABLE",
      });
      throw this.conflict("Provider failure cannot be finalized from the persisted financial state.");
    }
    if (request.status === WalletTopUpRequestStatus.FAILED) {
      return walletTopUpReconciliationService.toSafeResult(inspected.reconciliation);
    }
    if (request.status === WalletTopUpRequestStatus.COMPLETED) {
      await topUpAccountingOrchestratorService.complete(topUpReference);
      throw this.conflict("A completed top-up cannot be finalized as failed.");
    }
    if (request.status !== WalletTopUpRequestStatus.PROCESSING) {
      throw this.conflict("Top-up request is not processing.");
    }

    const failureCode = funding.failureCode ?? "PROVIDER_FAILED";
    const failureReason = funding.failureReason;
    const providerFailedAt = funding.failedAt ?? funding.updatedAt;
    const failureFinalizedAt = new Date();
    const updated = await walletTopUpRequestRepository.finalizeProcessingAsFailed({
      topUpReference,
      providerFundingId: funding._id as Types.ObjectId,
      providerFundingReference: funding.fundingReference,
      failureCode,
      failureReason,
      providerFailedAt,
      failureFinalizedAt,
      failureFinalizedBy: actorId,
    });
    if (!updated) {
      const current = await walletTopUpRequestRepository.findByReferenceForAccounting(topUpReference);
      if (!current || current.status !== WalletTopUpRequestStatus.FAILED ||
        !current.providerFundingId?.equals(funding._id as Types.ObjectId) ||
        current.providerFundingReference !== funding.fundingReference ||
        current.failureCode !== failureCode ||
        (current.failureReason ?? undefined) !== (failureReason ?? undefined) ||
        current.providerFailedAt?.getTime() !== providerFailedAt.getTime()) {
        if (current?.status === WalletTopUpRequestStatus.COMPLETED) {
          await topUpAccountingOrchestratorService.complete(topUpReference);
        }
        throw this.conflict("Provider failure finalization conflicted with authoritative state.");
      }
    }

    const after = await walletTopUpReconciliationService.inspectForOperation(topUpReference);
    await walletTopUpOperationalAuditService.record({
      topUpReference,
      reconciliationReference: after.reconciliation.reconciliationReference,
      action: Action.FINALIZE_PROVIDER_FAILURE,
      actorType: "ADMIN",
      actorId,
      result: "SUCCEEDED",
      classificationBefore: inspected.observation.classification,
      classificationAfter: after.observation.classification,
      reasonCode: "PROVIDER_FAILURE_FINALIZED",
      metadata: { failureCode },
    });
    return walletTopUpReconciliationService.toSafeResult(after.reconciliation);
  }
}

export const walletTopUpProviderFailureService = new WalletTopUpProviderFailureService();
