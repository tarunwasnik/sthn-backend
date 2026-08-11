import mongoose, { Types } from "mongoose";

import { MAX_WITHDRAWAL_FINALIZATION_RETRIES } from
  "../../constants/financial/creatorWithdrawalRetryPolicy";
import { AuditAction } from "../../enums/financial/auditAction.enum";
import { CreatorWithdrawalOperationalAction as Action } from
  "../../enums/financial/creatorWithdrawalOperationalAction.enum";
import { CreatorWithdrawalReconciliationStatus as Status } from
  "../../enums/financial/creatorWithdrawalReconciliationStatus.enum";
import { CreatorWithdrawalOperationalError } from
  "../../errors/financial/CreatorWithdrawalOperationalError";
import { AuditLog } from "../../models/auditLog.model";
import { creatorWithdrawalReconciliationRepository } from
  "../../repositories/creatorWithdrawalReconciliation.repository";
import { createFinancialAudit } from "../auditLog.service";
import { creatorWithdrawalOperationalInspectionService } from
  "./creatorWithdrawalOperationalInspection.service";

export type CreatorWithdrawalReconciliationStage =
  | "AFTER_RECONCILIATION_AUTHORITY"
  | "BEFORE_RECONCILIATION_AUDIT"
  | "BEFORE_ACKNOWLEDGEMENT"
  | "BEFORE_RESOLUTION"
  | "BEFORE_OPERATIONAL_COMMIT";

interface CreatorWithdrawalReconciliationSafe {
  reconciliationReference: string;
  withdrawalReference: string;
  providerRequestReference?: string;
  classification: string;
  status: string;
  severity: string;
  issueCodes: string[];
  recommendedAction?: string;
  allowedActions: string[];
  retryCount: number;
  maxRetryCount: number;
  nextRetryAt?: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  resolutionCode?: string;
  resolutionNote?: string;
  detectedAt: Date;
  lastInspectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class CreatorWithdrawalReconciliationService {
  constructor(private readonly onStage: (
    stage: CreatorWithdrawalReconciliationStage,
  ) => void | Promise<void> = () => undefined) {}

  private safe(reconciliation: {
    reconciliationReference: string; withdrawalReference: string;
    providerRequestReference?: string; classification: string; status: string;
    severity: string; issueCodes: string[]; recommendedAction?: string;
    allowedActions: string[]; retryCount: number; maxRetryCount: number;
    nextRetryAt?: Date; acknowledgedAt?: Date; resolvedAt?: Date;
    resolutionCode?: string; resolutionNote?: string; detectedAt: Date;
    lastInspectedAt: Date; createdAt: Date; updatedAt: Date;
  }): CreatorWithdrawalReconciliationSafe {
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

  async inspect(withdrawalReference: string, adminUserId: string) {
    const inspection = await creatorWithdrawalOperationalInspectionService
      .inspect(withdrawalReference);
    const session = await mongoose.startSession();
    try {
      const result: { value: CreatorWithdrawalReconciliationSafe | null } = {
        value: null,
      };
      await session.withTransaction(async () => {
        const at = new Date();
        const reconciliation = await creatorWithdrawalReconciliationRepository
          .upsertObservation({
            ...inspection.reconciliationIdentity,
            withdrawalRequestId: inspection.withdrawal._id as Types.ObjectId,
            withdrawalReference: inspection.withdrawal.withdrawalReference,
            providerRequestId: inspection.provider?._id as Types.ObjectId | undefined,
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
            maxRetryCount: MAX_WITHDRAWAL_FINALIZATION_RETRIES,
            inspectedAt: at,
          }, session);
        await this.onStage("AFTER_RECONCILIATION_AUTHORITY");
        await this.onStage("BEFORE_RECONCILIATION_AUDIT");
        const auditExists = await AuditLog.exists({
          action: AuditAction.CREATOR_WITHDRAWAL_RECONCILIATION_CREATED,
          entityId: reconciliation._id,
        }).session(session);
        if (!auditExists) await createFinancialAudit({
          action: AuditAction.CREATOR_WITHDRAWAL_RECONCILIATION_CREATED,
          actor: { type: "ADMIN", id: new Types.ObjectId(adminUserId) },
          entityType: "CREATOR_WITHDRAWAL_RECONCILIATION",
          entityId: reconciliation._id as Types.ObjectId,
          financialContext: {
            domain: "WITHDRAWAL",
            primaryReference: reconciliation.reconciliationReference,
            withdrawalReference: reconciliation.withdrawalReference,
            providerReference: inspection.provider?.providerReference,
            amount: inspection.withdrawal.amount,
            currency: inspection.withdrawal.currency,
          },
          transition: { toStatus: reconciliation.status, outcome:
            inspection.issueCodes.length ? "CONFLICT" : "SUCCEEDED" },
          metadata: {
            reconciliationReference: reconciliation.reconciliationReference,
            classification: inspection.classification,
            operationalAction: Action.INSPECT,
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
      if (!result.value) throw new CreatorWithdrawalOperationalError(
        "Withdrawal reconciliation did not commit.",
        "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT",
      );
      return result.value;
    } catch (error) {
      if (error instanceof CreatorWithdrawalOperationalError) throw error;
      throw new CreatorWithdrawalOperationalError(
        "Withdrawal reconciliation transaction failed.",
        "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT", error,
      );
    } finally { await session.endSession(); }
  }

  async list(input: {
    page?: unknown; limit?: unknown; status?: Status;
    classification?: Parameters<typeof creatorWithdrawalReconciliationRepository.list>[0]["classification"];
    severity?: Parameters<typeof creatorWithdrawalReconciliationRepository.list>[0]["severity"];
    withdrawalReference?: string; providerRequestReference?: string;
    creatorId?: Types.ObjectId; dateFrom?: Date; dateTo?: Date;
    retryReady?: boolean;
  }) {
    const page = input.page === undefined ? 1 : Number(input.page);
    const limit = input.limit === undefined ? 25 : Number(input.limit);
    if (!Number.isSafeInteger(page) || page < 1 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new CreatorWithdrawalOperationalError(
        "Invalid reconciliation pagination.",
        "CREATOR_WITHDRAWAL_OPERATIONAL_INVALID_ACTION",
      );
    }
    const result = await creatorWithdrawalReconciliationRepository.list({
      ...input, page, limit,
    });
    return {
      items: result.items.map((item) => this.safe(item)),
      pagination: { page, limit, total: result.total },
    };
  }

  async updateStatus(input: {
    reconciliationReference: string; action: Action;
    resolutionCode: string; resolutionNote?: string; adminUserId: string;
  }) {
    const reconciliation = await creatorWithdrawalReconciliationRepository
      .findByReference(input.reconciliationReference);
    if (!reconciliation) throw new CreatorWithdrawalOperationalError(
      "Withdrawal reconciliation was not found.",
      "CREATOR_WITHDRAWAL_OPERATIONAL_RECONCILIATION_NOT_FOUND",
    );
    if (reconciliation.status === Status.RESOLVED) {
      throw new CreatorWithdrawalOperationalError(
        "Withdrawal reconciliation is already resolved.",
        "CREATOR_WITHDRAWAL_OPERATIONAL_ALREADY_RESOLVED",
      );
    }
    const acknowledge = input.action === Action.ACKNOWLEDGE;
    if (!acknowledge && input.action !== Action.RESOLVE) {
      throw new CreatorWithdrawalOperationalError(
        "Invalid reconciliation status action.",
        "CREATOR_WITHDRAWAL_OPERATIONAL_INVALID_ACTION",
      );
    }
    const session = await mongoose.startSession();
    try {
      const result: { value: CreatorWithdrawalReconciliationSafe | null } = {
        value: null,
      };
      await session.withTransaction(async () => {
        await this.onStage(acknowledge ? "BEFORE_ACKNOWLEDGEMENT" :
          "BEFORE_RESOLUTION");
        const updated = await creatorWithdrawalReconciliationRepository
          .transitionStatus({
            reference: input.reconciliationReference,
            expectedStatuses: acknowledge
              ? [Status.OPEN, Status.FAILED, Status.RETRY_SCHEDULED]
              : [Status.OPEN, Status.ACKNOWLEDGED, Status.FAILED,
                Status.RETRY_SCHEDULED],
            status: acknowledge ? Status.ACKNOWLEDGED : Status.RESOLVED,
            actorId: new Types.ObjectId(input.adminUserId),
            code: input.resolutionCode, note: input.resolutionNote,
            at: new Date(),
          }, session);
        if (!updated) throw new CreatorWithdrawalOperationalError(
          "Reconciliation lifecycle transition conflicted.",
          "CREATOR_WITHDRAWAL_OPERATIONAL_INVALID_STATUS",
        );
        await createFinancialAudit({
          action: acknowledge
            ? AuditAction.CREATOR_WITHDRAWAL_RECONCILIATION_ACKNOWLEDGED
            : AuditAction.CREATOR_WITHDRAWAL_RECONCILIATION_RESOLVED,
          actor: { type: "ADMIN", id: new Types.ObjectId(input.adminUserId) },
          entityType: "CREATOR_WITHDRAWAL_RECONCILIATION",
          entityId: updated._id as Types.ObjectId,
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
      if (!result.value) throw new CreatorWithdrawalOperationalError(
        "Reconciliation status update did not commit.",
        "CREATOR_WITHDRAWAL_OPERATIONAL_TRANSACTION_CONFLICT",
      );
      return result.value;
    } finally { await session.endSession(); }
  }
}

export const creatorWithdrawalReconciliationService =
  new CreatorWithdrawalReconciliationService();
