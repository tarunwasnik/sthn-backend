import { Types } from "mongoose";
import { FinancialError } from "../../errors/financial/FinancialError";
import {
  WalletTopUpReconciliationError,
  WalletTopUpReconciliationErrorCode as ErrorCode,
} from "../../errors/financial/WalletTopUpReconciliationError";
import { WalletTopUpOperationalAction as Action } from "../../enums/financial/walletTopUpOperationalAction.enum";
import { WalletTopUpReconciliationClassification as Classification } from "../../enums/financial/walletTopUpReconciliationClassification.enum";
import { WalletTopUpReconciliationStatus as Status } from "../../enums/financial/walletTopUpReconciliationStatus.enum";
import { InternalTopUpFundingStatus } from "../../enums/financial/internalTopUpFundingStatus.enum";
import { walletTopUpRetryDelay } from "../../constants/financial/walletTopUpRetryPolicy";
import { walletTopUpReconciliationRepository } from "../../repositories/walletTopUpReconciliation.repository";
import { walletTopUpRetryAttemptRepository } from "../../repositories/walletTopUpRetryAttempt.repository";
import { walletTopUpReconciliationService } from "./walletTopUpReconciliation.service";
import { walletTopUpOperationalAuditService } from "./walletTopUpOperationalAudit.service";
import { topUpAccountingOrchestratorService } from "./topUpAccountingOrchestrator.service";

const RETRYABLE = new Set<Classification>([
  Classification.ACCOUNTING_NOT_STARTED,
  Classification.LEDGER_ONLY,
  Classification.LEDGER_AND_PROJECTION,
  Classification.COMPLETION_PENDING,
]);

export class WalletTopUpRetryService {
  private error(message: string, code: keyof typeof ErrorCode) {
    return new WalletTopUpReconciliationError(message, ErrorCode[code]);
  }

  async retry(reconciliationReference: string, action: Action, adminUserId: string) {
    if (![Action.RETRY_ACCOUNTING, Action.RETRY_COMPLETION].includes(action)) {
      throw this.error("Invalid top-up retry action.", "INVALID_ACTION");
    }
    const actorId = new Types.ObjectId(adminUserId);
    const loaded = await walletTopUpReconciliationService.getByReference(reconciliationReference);
    if ([Status.RESOLVED, Status.ACKNOWLEDGED].includes(loaded.status)) {
      throw this.error("Top-up reconciliation is already resolved.", "ALREADY_RESOLVED");
    }
    if (loaded.retryCount >= loaded.maxRetryCount) {
      throw this.error("Top-up accounting retry limit was exceeded.", "RETRY_LIMIT_EXCEEDED");
    }

    const inspected = await walletTopUpReconciliationService.inspectForOperation(loaded.topUpReference);
    if (loaded.fingerprint !== inspected.observation.fingerprint ||
      loaded.classification !== inspected.observation.classification) {
      throw this.error("Top-up reconciliation classification changed.", "CLASSIFICATION_CHANGED");
    }
    if (!RETRYABLE.has(inspected.observation.classification) ||
      !inspected.observation.allowedActions.includes(action) ||
      (action === Action.RETRY_COMPLETION &&
        inspected.observation.classification !== Classification.COMPLETION_PENDING) ||
      inspected.observation.funding?.status !== InternalTopUpFundingStatus.SUCCEEDED) {
      throw this.error("Accounting retry is not allowed for this classification.", "RETRY_NOT_ALLOWED");
    }

    const startedAt = new Date();
    const claimed = await walletTopUpReconciliationRepository.beginRetry({
      reconciliationReference,
      fingerprint: inspected.observation.fingerprint,
      classification: inspected.observation.classification,
      retryCount: loaded.retryCount,
      at: startedAt,
      action,
    });
    if (!claimed) throw this.error("Accounting retry snapshot conflicted.", "SNAPSHOT_CONFLICT");
    const attemptNumber = claimed.retryCount;
    const operationKey = `${reconciliationReference}:${attemptNumber}:${action}`;
    await walletTopUpRetryAttemptRepository.create({
      operationKey,
      reconciliationReference,
      topUpReference: claimed.topUpReference,
      attemptNumber,
      action,
      actorId,
      startedAt,
    });
    await walletTopUpOperationalAuditService.record({
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
      await topUpAccountingOrchestratorService.complete(claimed.topUpReference);
      const after = await walletTopUpReconciliationService.inspectForOperation(claimed.topUpReference);
      if (after.observation.classification === Classification.COMPLETED_VALID) {
        await walletTopUpReconciliationRepository.updateResolution({
          reconciliationReference,
          fingerprint: after.observation.fingerprint,
          expectedStatuses: [Status.IN_PROGRESS, Status.RESOLVED],
          status: Status.RESOLVED,
          action: Action.RESOLVE_RECONCILIATION,
          code: "ACCOUNTING_RETRY_COMPLETED",
          at: new Date(),
          actorId,
        });
        await walletTopUpRetryAttemptRepository.complete(operationKey, {
          completedAt: new Date(),
          resultCode: "COMPLETED_VALID",
        });
        await walletTopUpOperationalAuditService.record({
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
        const resolved = await walletTopUpReconciliationService.getByReference(reconciliationReference);
        return walletTopUpReconciliationService.toSafeResult(resolved);
      }

      const stillRetryable = RETRYABLE.has(after.observation.classification);
      const nextRetryAt = stillRetryable && attemptNumber < claimed.maxRetryCount
        ? new Date(Date.now() + walletTopUpRetryDelay(attemptNumber)) : undefined;
      await walletTopUpReconciliationRepository.completeRetry({
        reconciliationReference,
        retryCount: attemptNumber,
        status: nextRetryAt ? Status.RETRY_SCHEDULED : Status.FAILED,
        resultCode: stillRetryable ? "RETRY_INCOMPLETE" : "RETRY_RECLASSIFIED",
        nextRetryAt,
      });
      await walletTopUpRetryAttemptRepository.complete(operationKey, {
        completedAt: new Date(),
        resultCode: stillRetryable ? "RETRY_INCOMPLETE" : "RETRY_RECLASSIFIED",
        nextRetryAt,
      });
      if (!stillRetryable) {
        throw this.error("Accounting retry produced a non-retryable classification.", "CLASSIFICATION_CHANGED");
      }
      return walletTopUpReconciliationService.toSafeResult(
        await walletTopUpReconciliationService.getByReference(reconciliationReference),
      );
    } catch (error) {
      const safeErrorCode = error instanceof FinancialError ? error.code : ErrorCode.INTEGRITY_ERROR;
      const nextRetryAt = attemptNumber < claimed.maxRetryCount
        ? new Date(Date.now() + walletTopUpRetryDelay(attemptNumber)) : undefined;
      await walletTopUpReconciliationRepository.completeRetry({
        reconciliationReference,
        retryCount: attemptNumber,
        status: nextRetryAt ? Status.RETRY_SCHEDULED : Status.FAILED,
        resultCode: "RETRY_FAILED",
        nextRetryAt,
      });
      await walletTopUpRetryAttemptRepository.complete(operationKey, {
        completedAt: new Date(),
        resultCode: "RETRY_FAILED",
        safeErrorCode,
        nextRetryAt,
      });
      await walletTopUpOperationalAuditService.record({
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

export const walletTopUpRetryService = new WalletTopUpRetryService();
