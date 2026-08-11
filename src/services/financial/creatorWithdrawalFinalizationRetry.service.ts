import mongoose, { Types } from "mongoose";
import { withdrawalRetryDelay } from
  "../../constants/financial/creatorWithdrawalRetryPolicy";

import { AuditAction } from "../../enums/financial/auditAction.enum";
import { CreatorWithdrawalOperationalAction as Action } from
  "../../enums/financial/creatorWithdrawalOperationalAction.enum";
import { CreatorWithdrawalOperationalClassification as Classification } from
  "../../enums/financial/creatorWithdrawalOperationalClassification.enum";
import { CreatorWithdrawalOperationalError } from
  "../../errors/financial/CreatorWithdrawalOperationalError";
import { creatorWithdrawalReconciliationRepository } from
  "../../repositories/creatorWithdrawalReconciliation.repository";
import { creatorWithdrawalRetryAttemptRepository } from
  "../../repositories/creatorWithdrawalRetryAttempt.repository";
import { deriveCreatorWithdrawalRetryIdentity } from
  "../../utils/financial/creatorWithdrawalOperationalIdentity.util";
import { createFinancialAudit } from "../auditLog.service";
import { creatorWithdrawalFinalizationService } from
  "./creatorWithdrawalFinalization.service";
import { creatorWithdrawalOperationalInspectionService } from
  "./creatorWithdrawalOperationalInspection.service";

export type CreatorWithdrawalRetryStage =
  | "AFTER_RETRY_ATTEMPT_CREATION"
  | "AFTER_PHASE9D_FINALIZATION"
  | "BEFORE_POST_FINALIZATION_UPDATE"
  | "BEFORE_RETRY_AUDIT"
  | "BEFORE_OPERATIONAL_COMMIT";

const pending = new Set<Classification>([
  Classification.FINALIZATION_PENDING_SUCCESS,
  Classification.FINALIZATION_PENDING_FAILURE,
]);

export class CreatorWithdrawalFinalizationRetryService {
  constructor(private readonly onStage: (
    stage: CreatorWithdrawalRetryStage,
  ) => void | Promise<void> = () => undefined) {}

  async retry(reconciliationReference: string, adminUserId: string) {
    const reconciliation = await creatorWithdrawalReconciliationRepository
      .findByReference(reconciliationReference);
    if (!reconciliation) throw new CreatorWithdrawalOperationalError(
      "Withdrawal reconciliation was not found.",
      "CREATOR_WITHDRAWAL_OPERATIONAL_RECONCILIATION_NOT_FOUND",
    );
    const inspection = await creatorWithdrawalOperationalInspectionService
      .inspect(reconciliation.withdrawalReference);
    if (inspection.classification !== reconciliation.classification) {
      throw new CreatorWithdrawalOperationalError(
        "Withdrawal operational classification changed.",
        "CREATOR_WITHDRAWAL_OPERATIONAL_CLASSIFICATION_CHANGED",
      );
    }
    if (inspection.snapshotFingerprint !== reconciliation.snapshotFingerprint) {
      throw new CreatorWithdrawalOperationalError(
        "Withdrawal operational snapshot changed.",
        "CREATOR_WITHDRAWAL_OPERATIONAL_SNAPSHOT_CONFLICT",
      );
    }
    if (!pending.has(inspection.classification)) {
      throw new CreatorWithdrawalOperationalError(
        "Finalization retry is not allowed for this classification.",
        "CREATOR_WITHDRAWAL_OPERATIONAL_RETRY_NOT_ALLOWED",
      );
    }
    if (reconciliation.retryCount >= reconciliation.maxRetryCount) {
      throw new CreatorWithdrawalOperationalError(
        "Withdrawal finalization retry limit was exceeded.",
        "CREATOR_WITHDRAWAL_OPERATIONAL_RETRY_LIMIT_EXCEEDED",
      );
    }
    const attemptNumber = reconciliation.retryCount + 1;
    const identity = deriveCreatorWithdrawalRetryIdentity({
      reconciliationReference, withdrawalReference: reconciliation.withdrawalReference,
      attemptNumber, snapshotFingerprint: inspection.snapshotFingerprint,
    });
    const existing = await creatorWithdrawalRetryAttemptRepository
      .findByKey(identity.attemptKey);
    if (existing?.status === "APPLIED") return {
      attemptReference: existing.attemptReference,
      reconciliationReference, withdrawalReference:
        reconciliation.withdrawalReference, status: existing.status,
      classification: reconciliation.classification,
      resultCode: existing.safeErrorCode, replay: true,
    };

    const claimSession = await mongoose.startSession();
    try {
      await claimSession.withTransaction(async () => {
        const claimed = await creatorWithdrawalReconciliationRepository
          .beginRetry({ reference: reconciliationReference,
            fingerprint: inspection.snapshotFingerprint,
            classification: inspection.classification,
            expectedRetryCount: reconciliation.retryCount, at: new Date() },
          claimSession);
        if (!claimed) throw new CreatorWithdrawalOperationalError(
          "Withdrawal retry authority conflicted.",
          "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT",
        );
        await creatorWithdrawalRetryAttemptRepository.create({
          attemptReference: identity.attemptReference,
          attemptKey: identity.attemptKey,
          reconciliationId: claimed._id as Types.ObjectId,
          reconciliationReference,
          withdrawalRequestId: inspection.withdrawal._id as Types.ObjectId,
          withdrawalReference: inspection.withdrawal.withdrawalReference,
          attemptNumber,
          action: "RETRY_FINALIZATION",
          snapshotFingerprint: inspection.snapshotFingerprint,
          actorType: "ADMIN", actorId: new Types.ObjectId(adminUserId),
          startedAt: new Date(),
        }, claimSession);
        await this.onStage("AFTER_RETRY_ATTEMPT_CREATION");
      });
    } finally { await claimSession.endSession(); }

    try {
      await creatorWithdrawalFinalizationService.finalize(
        inspection.withdrawal.withdrawalReference,
      );
    } catch (error) {
      const code = (error as { code?: string }).code ??
        "PHASE9D_FINALIZATION_FAILED";
      const nextRetryAt = attemptNumber < reconciliation.maxRetryCount
        ? new Date(Date.now() + withdrawalRetryDelay(attemptNumber)) : undefined;
      const failureSession = await mongoose.startSession();
      try {
        await failureSession.withTransaction(async () => {
          const [attempt, failed] = await Promise.all([
            creatorWithdrawalRetryAttemptRepository.complete(
              identity.attemptKey, "FAILED", code, new Date(), nextRetryAt,
              failureSession,
            ),
            creatorWithdrawalReconciliationRepository.failRetry({
              reference: reconciliationReference, retryCount: attemptNumber,
              resultCode: code, nextRetryAt,
            }, failureSession),
          ]);
          if (!attempt || !failed) throw new CreatorWithdrawalOperationalError(
            "Withdrawal retry failure persistence conflicted.",
            "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT",
          );
          await createFinancialAudit({
            action: AuditAction.CREATOR_WITHDRAWAL_FINALIZATION_RETRIED,
            actor: { type: "ADMIN", id: new Types.ObjectId(adminUserId) },
            entityType: "CREATOR_WITHDRAWAL_RETRY_ATTEMPT",
            entityId: attempt._id as Types.ObjectId,
            financialContext: { domain: "WITHDRAWAL",
              primaryReference: identity.attemptReference,
              withdrawalReference: inspection.withdrawal.withdrawalReference,
              providerReference: inspection.provider?.providerReference,
              amount: inspection.withdrawal.amount,
              currency: inspection.withdrawal.currency },
            transition: { fromStatus: inspection.classification,
              toStatus: inspection.classification, outcome: "FAILED" },
            metadata: { reconciliationReference, attemptReference:
              identity.attemptReference, operationalAction:
              Action.RETRY_FINALIZATION, operationalResult: "FAILED",
              classificationBefore: inspection.classification,
              classificationAfter: inspection.classification,
              reasonCode: code },
            session: failureSession,
          });
        });
      } finally { await failureSession.endSession(); }
      throw error;
    }
    await this.onStage("AFTER_PHASE9D_FINALIZATION");
    const after = await creatorWithdrawalOperationalInspectionService.inspect(
      inspection.withdrawal.withdrawalReference,
    );
    if (![Classification.HEALTHY_COMPLETED,
      Classification.HEALTHY_FAILED].includes(after.classification)) {
      throw new CreatorWithdrawalOperationalError(
        "Phase 9D retry did not produce a healthy terminal graph.",
        "CREATOR_WITHDRAWAL_OPERATIONAL_REPLAY_CONFLICT",
      );
    }
    await this.onStage("BEFORE_POST_FINALIZATION_UPDATE");
    const updateSession = await mongoose.startSession();
    try {
      let result: Record<string, unknown> | null = null;
      await updateSession.withTransaction(async () => {
        const attempt = await creatorWithdrawalRetryAttemptRepository.complete(
          identity.attemptKey, "APPLIED", "PHASE9D_FINALIZATION_APPLIED",
          new Date(), undefined, updateSession,
        );
        const updated = await creatorWithdrawalReconciliationRepository
          .completeRetry({ reference: reconciliationReference,
            retryCount: attemptNumber, classification: after.classification,
            severity: after.severity, snapshot: after.snapshot,
            snapshotFingerprint: after.snapshotFingerprint,
            issueCodes: after.issueCodes,
            resultCode: "PHASE9D_FINALIZATION_APPLIED" }, updateSession);
        if (!attempt || !updated) throw new CreatorWithdrawalOperationalError(
          "Withdrawal retry operational update conflicted.",
          "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT",
        );
        await this.onStage("BEFORE_RETRY_AUDIT");
        await createFinancialAudit({
          action: AuditAction.CREATOR_WITHDRAWAL_FINALIZATION_RETRIED,
          actor: { type: "ADMIN", id: new Types.ObjectId(adminUserId) },
          entityType: "CREATOR_WITHDRAWAL_RETRY_ATTEMPT",
          entityId: attempt._id as Types.ObjectId,
          financialContext: { domain: "WITHDRAWAL",
            primaryReference: identity.attemptReference,
            withdrawalReference: inspection.withdrawal.withdrawalReference,
            providerReference: inspection.provider?.providerReference,
            amount: inspection.withdrawal.amount,
            currency: inspection.withdrawal.currency },
          transition: { fromStatus: inspection.classification,
            toStatus: after.classification, outcome: "SUCCEEDED" },
          metadata: { reconciliationReference, attemptReference:
            identity.attemptReference, operationalAction:
            Action.RETRY_FINALIZATION, operationalResult: "APPLIED",
            classificationBefore: inspection.classification,
            classificationAfter: after.classification,
            reasonCode: "PHASE9D_FINALIZATION_APPLIED" },
          session: updateSession,
        });
        await this.onStage("BEFORE_OPERATIONAL_COMMIT");
        result = { attemptReference: attempt.attemptReference,
          reconciliationReference, withdrawalReference:
            inspection.withdrawal.withdrawalReference,
          classification: after.classification, status: attempt.status,
          resultCode: attempt.safeErrorCode, replay: false };
      });
      if (!result) throw new CreatorWithdrawalOperationalError(
        "Withdrawal retry returned no result.",
        "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT",
      );
      return result;
    } finally { await updateSession.endSession(); }
  }
}

export const creatorWithdrawalFinalizationRetryService =
  new CreatorWithdrawalFinalizationRetryService();
