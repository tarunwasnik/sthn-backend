import mongoose, { Types } from "mongoose";

import { AuditAction } from "../../enums/financial/auditAction.enum";
import { CreatorWithdrawalFinalizationOutcome } from
  "../../enums/financial/creatorWithdrawalFinalizationOutcome.enum";
import { CreatorWithdrawalOperationalAction as Action } from
  "../../enums/financial/creatorWithdrawalOperationalAction.enum";
import { CreatorWithdrawalOperationalClassification as Classification } from
  "../../enums/financial/creatorWithdrawalOperationalClassification.enum";
import { CreatorWithdrawalOperationalSeverity as Severity } from
  "../../enums/financial/creatorWithdrawalOperationalSeverity.enum";
import { CreatorWithdrawalRequestStatus } from
  "../../enums/financial/creatorWithdrawalRequestStatus.enum";
import { CreatorWithdrawalOperationalError } from
  "../../errors/financial/CreatorWithdrawalOperationalError";
import { creatorWithdrawalReconciliationRepository } from
  "../../repositories/creatorWithdrawalReconciliation.repository";
import { creatorWithdrawalRepairOperationRepository } from
  "../../repositories/creatorWithdrawalRepairOperation.repository";
import { creatorWithdrawalRequestRepository } from
  "../../repositories/creatorWithdrawalRequest.repository";
import {
  deriveCreatorWithdrawalRepairIdentity,
  fingerprintWithdrawalOperationalSnapshot,
} from "../../utils/financial/creatorWithdrawalOperationalIdentity.util";
import { createFinancialAudit } from "../auditLog.service";
import { creatorWithdrawalFinalizationService } from
  "./creatorWithdrawalFinalization.service";
import { creatorWithdrawalOperationalInspectionService } from
  "./creatorWithdrawalOperationalInspection.service";

export type CreatorWithdrawalRepairStage =
  | "AFTER_REPAIR_OPERATION_CREATION"
  | "BEFORE_GUARDED_METADATA_REPAIR"
  | "BEFORE_REPAIR_AUDIT"
  | "BEFORE_OPERATIONAL_COMMIT";

export class CreatorWithdrawalRepairService {
  constructor(private readonly onStage: (
    stage: CreatorWithdrawalRepairStage,
  ) => void | Promise<void> = () => undefined) {}

  async repair(
    reconciliationReference: string,
    action: Action,
    adminUserId: string,
  ) {
    if (![Action.RESTORE_FINALIZATION_LINKS,
      Action.RESTORE_TERMINAL_AUDIT].includes(action)) {
      throw new CreatorWithdrawalOperationalError(
        "Invalid withdrawal repair action.",
        "CREATOR_WITHDRAWAL_OPERATIONAL_INVALID_ACTION",
      );
    }
    const reconciliation = await creatorWithdrawalReconciliationRepository
      .findByReference(reconciliationReference);
    if (!reconciliation) throw new CreatorWithdrawalOperationalError(
      "Withdrawal reconciliation was not found.",
      "CREATOR_WITHDRAWAL_OPERATIONAL_RECONCILIATION_NOT_FOUND",
    );
    const applied = await creatorWithdrawalRepairOperationRepository
      .findApplied(reconciliationReference, action);
    if (applied && [Classification.HEALTHY_COMPLETED,
      Classification.HEALTHY_FAILED].includes(reconciliation.classification)) {
      await creatorWithdrawalFinalizationService.validateReplay(
        reconciliation.withdrawalReference,
      );
      return { repairReference: applied.repairReference,
        reconciliationReference,
        withdrawalReference: reconciliation.withdrawalReference,
        action, repairedFields: applied.repairedFields,
        status: applied.status, replay: true };
    }
    const inspection = await creatorWithdrawalOperationalInspectionService
      .inspect(reconciliation.withdrawalReference);
    if (inspection.snapshotFingerprint !== reconciliation.snapshotFingerprint) {
      throw new CreatorWithdrawalOperationalError(
        "Withdrawal repair snapshot changed.",
        "CREATOR_WITHDRAWAL_OPERATIONAL_SNAPSHOT_CONFLICT",
      );
    }
    const allowed = action === Action.RESTORE_FINALIZATION_LINKS
      ? inspection.classification === Classification.MISSING_FINALIZATION_LINKS &&
        inspection.missingFinalizationFields.length > 0
      : inspection.classification === Classification.MISSING_AUDIT &&
        inspection.terminalAuditCount === 0;
    if (!allowed || !inspection.provider ||
      !inspection.expectedFinalizationIdentity ||
      inspection.finalizationLedgerEntryIds.length !== 2 ||
      !inspection.finalizationProjectionOperationId) {
      throw new CreatorWithdrawalOperationalError(
        "Repair is not allowed for this withdrawal graph.",
        "CREATOR_WITHDRAWAL_OPERATIONAL_REPAIR_NOT_ALLOWED",
      );
    }
    const identity = deriveCreatorWithdrawalRepairIdentity({
      reconciliationReference,
      withdrawalReference: inspection.withdrawal.withdrawalReference,
      action, snapshotFingerprint: inspection.snapshotFingerprint,
    });
    const existing = await creatorWithdrawalRepairOperationRepository
      .findByKey(identity.repairKey);
    if (existing?.status === "APPLIED") return {
      repairReference: existing.repairReference, reconciliationReference,
      withdrawalReference: inspection.withdrawal.withdrawalReference,
      action, repairedFields: existing.repairedFields,
      status: existing.status, replay: true,
    };
    const finalIdentity = inspection.expectedFinalizationIdentity;
    const completed = inspection.provider.providerStatus === "SUCCEEDED";
    const healthyClassification = completed
      ? Classification.HEALTHY_COMPLETED : Classification.HEALTHY_FAILED;
    const repairedFields = action === Action.RESTORE_FINALIZATION_LINKS
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
    const afterFingerprint = fingerprintWithdrawalOperationalSnapshot(afterSnapshot);
    const session = await mongoose.startSession();
    try {
      let result: Record<string, unknown> | null = null;
      await session.withTransaction(async () => {
        const operation = await creatorWithdrawalRepairOperationRepository.create({
          repairReference: identity.repairReference,
          repairKey: identity.repairKey,
          reconciliationId: reconciliation._id as Types.ObjectId,
          reconciliationReference,
          withdrawalRequestId: inspection.withdrawal._id as Types.ObjectId,
          withdrawalReference: inspection.withdrawal.withdrawalReference,
          action, snapshotFingerprint: inspection.snapshotFingerprint,
          performedBy: new Types.ObjectId(adminUserId),
        }, session);
        await this.onStage("AFTER_REPAIR_OPERATION_CREATION");
        await this.onStage("BEFORE_GUARDED_METADATA_REPAIR");
        if (action === Action.RESTORE_FINALIZATION_LINKS) {
          const restored = await creatorWithdrawalRequestRepository
            .restoreFinalizationLinks({
              requestId: inspection.withdrawal._id as Types.ObjectId,
              withdrawalReference: inspection.withdrawal.withdrawalReference,
              status: inspection.withdrawal.status as "COMPLETED" | "FAILED",
              providerRequestReference:
                inspection.provider!.providerRequestReference,
              providerTerminalStatus:
                inspection.provider!.providerStatus as "SUCCEEDED" | "FAILED",
              missingFields: inspection.missingFinalizationFields,
              values: {
                finalizationOutcome: completed ? "COMPLETED" : "FAILED",
                finalizationReference: finalIdentity.finalizationReference,
                finalizationKey: finalIdentity.finalizationKey,
                finalizationTransactionId: finalIdentity.finalizationTransactionId,
                finalizationLedgerEntryIds:
                  inspection.finalizationLedgerEntryIds,
                finalizationProjectionOperationId:
                  inspection.finalizationProjectionOperationId!,
                finalizationProjectionOperationReference:
                  finalIdentity.projectionReference,
                finalizationFingerprint: finalIdentity.finalizationFingerprint,
                providerTerminalReference:
                  inspection.provider!.executionReference!,
              }, expectedVersion: inspection.withdrawal.version,
            }, session);
          if (!restored) throw new CreatorWithdrawalOperationalError(
            "Guarded withdrawal metadata repair conflicted.",
            "CREATOR_WITHDRAWAL_OPERATIONAL_REPAIR_CONFLICT",
          );
        } else {
          await createFinancialAudit({
            action: completed ? AuditAction.CREATOR_WITHDRAWAL_COMPLETED
              : AuditAction.CREATOR_WITHDRAWAL_FAILED,
            actor: { type: "SYSTEM", reference:
              "CREATOR_WITHDRAWAL_FINALIZATION_AUDIT_REPAIR" },
            entityType: "CREATOR_WITHDRAWAL_REQUEST",
            entityId: inspection.withdrawal._id as Types.ObjectId,
            financialContext: { domain: "WITHDRAWAL",
              primaryReference: inspection.withdrawal.withdrawalReference,
              withdrawalReference: inspection.withdrawal.withdrawalReference,
              provider: "INTERNAL",
              providerReference: inspection.provider!.providerReference,
              amount: inspection.withdrawal.amount,
              currency: inspection.withdrawal.currency,
              ledgerTransactionReference: finalIdentity.finalizationTransactionId,
              projectionOperationReference: finalIdentity.projectionReference },
            transition: { fromStatus: CreatorWithdrawalRequestStatus.RESERVED,
              toStatus: completed
                ? CreatorWithdrawalRequestStatus.COMPLETED
                : CreatorWithdrawalRequestStatus.FAILED,
              outcome: "SUCCEEDED" },
            metadata: {
              creatorReference: inspection.provider!.creatorReference,
              creatorUserId: inspection.withdrawal.creatorUserId.toString(),
              walletReference: inspection.provider!.walletReference,
              destinationReference: inspection.withdrawal.destinationReference,
              providerRequestReference:
                inspection.provider!.providerRequestReference,
              providerExecutionReference:
                inspection.provider!.executionReference!,
              finalizationReference: finalIdentity.finalizationReference,
              finalizationOutcome: completed
                ? CreatorWithdrawalFinalizationOutcome.COMPLETED
                : CreatorWithdrawalFinalizationOutcome.FAILED,
              reasonCode: completed ? "WITHDRAWAL_RESERVATION_CONSUMED"
                : "WITHDRAWAL_RESERVATION_RELEASED",
              ...(!completed ? { failureCode:
                inspection.provider!.terminalResult?.code ??
                  "INTERNAL_PROVIDER_FAILED" } : {}),
            }, session,
          });
        }
        const completedOperation = await creatorWithdrawalRepairOperationRepository
          .complete(identity.repairKey, repairedFields, new Date(), session);
        const updated = await creatorWithdrawalReconciliationRepository
          .updateAfterRepair({ reference: reconciliationReference,
            expectedFingerprint: inspection.snapshotFingerprint,
            classification: healthyClassification,
            severity: Severity.INFO, snapshot: afterSnapshot,
            snapshotFingerprint: afterFingerprint, issueCodes: [] }, session);
        if (!completedOperation || !updated) {
          throw new CreatorWithdrawalOperationalError(
            "Withdrawal repair completion conflicted.",
            "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT",
          );
        }
        await this.onStage("BEFORE_REPAIR_AUDIT");
        await createFinancialAudit({
          action: AuditAction.CREATOR_WITHDRAWAL_METADATA_REPAIRED,
          actor: { type: "ADMIN", id: new Types.ObjectId(adminUserId) },
          entityType: "CREATOR_WITHDRAWAL_REPAIR_OPERATION",
          entityId: operation._id as Types.ObjectId,
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
      if (!result) throw new CreatorWithdrawalOperationalError(
        "Withdrawal repair returned no result.",
        "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT",
      );
      await creatorWithdrawalFinalizationService.validateReplay(
        inspection.withdrawal.withdrawalReference,
      );
      return result;
    } catch (error) {
      if (error instanceof CreatorWithdrawalOperationalError) throw error;
      throw new CreatorWithdrawalOperationalError(
        "Withdrawal repair transaction failed.",
        "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT", error,
      );
    } finally { await session.endSession(); }
  }
}

export const creatorWithdrawalRepairService =
  new CreatorWithdrawalRepairService();
