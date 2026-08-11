import mongoose, { Types } from "mongoose";

import { toWalletConversionOperationalResponseDto,
  WalletConversionOperationalAllowedAction,
  WalletConversionOperationalResponseDto } from
  "../../dtos/wallet/walletConversionOperational.response.dto";
import { WalletConversionAuditAction } from
  "../../enums/financial/walletConversionAuditAction.enum";
import { WalletConversionOperationalClassification as Classification } from
  "../../enums/financial/walletConversionOperationalClassification.enum";
import { WalletConversionOperationalIssue as Issue } from
  "../../enums/financial/walletConversionOperationalIssue.enum";
import { WalletConversionRepairAction } from
  "../../enums/financial/walletConversionRepairAction.enum";
import { WalletConversionRequestStatus } from
  "../../enums/financial/walletConversionRequestStatus.enum";
import { WalletConversionOperationalError } from
  "../../errors/financial/WalletConversionOperationalError";
import { WalletConversionAudit } from
  "../../models/walletConversionAudit.model";
import { walletConversionAuditRepository } from
  "../../repositories/walletConversionAudit.repository";
import { walletConversionReconciliationRepository } from
  "../../repositories/walletConversionReconciliation.repository";
import { createIdempotencyFingerprint } from
  "../../utils/financial/idempotency.util";
import { deriveWalletConversionReconciliationIdentity } from
  "../../utils/financial/walletConversionOperationalIdentity.util";
import { walletConversionOperationalInspectionService } from
  "./walletConversionOperationalInspection.service";

export type WalletConversionReconciliationStage =
  | "AFTER_RECONCILIATION"
  | "BEFORE_AUDIT"
  | "BEFORE_COMMIT";

interface Options {
  now?: () => Date;
  failureInjector?: (stage: WalletConversionReconciliationStage) =>
    void | Promise<void>;
}

export class WalletConversionReconciliationService {
  private readonly now: () => Date;

  constructor(private readonly options: Options = {}) {
    this.now = options.now ?? (() => new Date());
  }

  private async inject(stage: WalletConversionReconciliationStage) {
    await this.options.failureInjector?.(stage);
  }

  private allowedActions(inspection: Awaited<ReturnType<typeof
    walletConversionOperationalInspectionService.inspect>>, authority: {
      retryPerformed: boolean; repairPerformed: boolean;
    }): WalletConversionOperationalAllowedAction[] {
    if (authority.retryPerformed || authority.repairPerformed) return [];
    const only = (issue: Issue) => inspection.issues.length === 1 &&
      inspection.issues[0] === issue;
    if (inspection.classification === Classification.REPLAY_REQUIRED &&
      inspection.request.status === WalletConversionRequestStatus.APPROVED &&
      inspection.graph && inspection.request.accountingReference &&
      inspection.request.accountingTransactionReference &&
      inspection.request.completedAt &&
      only(Issue.ACCOUNTING_COMPLETION_REPLAY_REQUIRED)) return ["RETRY"];
    if (inspection.request.status !== WalletConversionRequestStatus.COMPLETED ||
      !inspection.graph) return [];
    if (inspection.classification === Classification.MISSING_AUDIT &&
      only(Issue.TERMINAL_AUDIT_MISSING)) {
      return [WalletConversionRepairAction.RESTORE_MISSING_AUDIT];
    }
    if (inspection.classification !== Classification.REPLAY_REQUIRED) return [];
    if (only(Issue.LEDGER_REFERENCES_MISSING)) {
      return [WalletConversionRepairAction.RESTORE_LEDGER_REFERENCES];
    }
    if (only(Issue.PROJECTION_REFERENCES_MISSING)) {
      return [WalletConversionRepairAction.RESTORE_PROJECTION_REFERENCES];
    }
    if (only(Issue.ACCOUNTING_REFERENCES_MISSING)) {
      return [WalletConversionRepairAction.RESTORE_ACCOUNTING_REFERENCES];
    }
    return [];
  }

  async reconcile(conversionReference: unknown, adminUserId: string,
    transactionAttempt = 0): Promise<WalletConversionOperationalResponseDto> {
    const inspection = await walletConversionOperationalInspectionService
      .inspect(conversionReference);
    const identity = deriveWalletConversionReconciliationIdentity(
      inspection.request.conversionReference);
    const replay = await walletConversionReconciliationRepository
      .findByConversionReference(inspection.request.conversionReference);
    const replayAudit = replay ? await WalletConversionAudit.find({
      conversionReference: inspection.request.conversionReference,
      action: WalletConversionAuditAction.RECONCILED,
    }).select("+auditKey +adminActorId") : [];
    if (replay && replayAudit.length === 1 &&
      replayAudit[0].reconciliationReference === replay.reconciliationReference &&
      replayAudit[0].adminActorId?.equals(replay.inspectedBy) &&
      replay.classification === inspection.classification &&
      replay.severity === inspection.severity &&
      JSON.stringify(replay.issues) === JSON.stringify(inspection.issues)) {
      return toWalletConversionOperationalResponseDto(replay,
        this.allowedActions(inspection, replay));
    }
    const session = await mongoose.startSession();
    try {
      let result: Awaited<ReturnType<typeof
        walletConversionReconciliationRepository.findByReference>> | null = null;
      await session.withTransaction(async () => {
        const at = this.now();
        result = await walletConversionReconciliationRepository.upsertInspection({
          ...identity,
          conversionRequestId: inspection.request._id as Types.ObjectId,
          conversionReference: inspection.request.conversionReference,
          classification: inspection.classification,
          severity: inspection.severity, issues: inspection.issues,
          inspectedBy: new Types.ObjectId(adminUserId), inspectedAt: at,
        }, session);
        await this.inject("AFTER_RECONCILIATION");
        await this.inject("BEFORE_AUDIT");
        await walletConversionAuditRepository.createOnce({
          auditKey: createIdempotencyFingerprint(
            WalletConversionAuditAction.RECONCILED,
            inspection.request.conversionKey),
          action: WalletConversionAuditAction.RECONCILED,
          conversionReference: inspection.request.conversionReference,
          sourceCurrency: inspection.request.sourceCurrency,
          targetCurrency: inspection.request.targetCurrency,
          sourceAmount: inspection.request.sourceAmount,
          targetAmount: inspection.request.targetAmount,
          fxSnapshotReference: inspection.request.fxSnapshotReference,
          fxEffectiveDate: inspection.request.fxEffectiveDate,
          requestedAt: inspection.request.requestedAt,
          adminActorId: new Types.ObjectId(adminUserId),
          reconciliationReference: identity.reconciliationReference,
          classification: inspection.classification,
          severity: inspection.severity, issues: inspection.issues,
          retryPerformed: false, repairPerformed: false,
        }, session);
        await this.inject("BEFORE_COMMIT");
      });
      if (!result) throw new WalletConversionOperationalError(
        "Wallet conversion reconciliation did not commit.",
        "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT");
      return toWalletConversionOperationalResponseDto(result,
        this.allowedActions(inspection, result));
    } catch (error: any) {
      if (error instanceof WalletConversionOperationalError) throw error;
      if ([11000, 112, 251].includes(error?.code) && transactionAttempt < 5) {
        const winner = await walletConversionReconciliationRepository
          .findByConversionReference(inspection.request.conversionReference);
        if (winner) return toWalletConversionOperationalResponseDto(winner,
          this.allowedActions(inspection, winner));
        return this.reconcile(conversionReference, adminUserId,
          transactionAttempt + 1);
      }
      throw new WalletConversionOperationalError(
        "Wallet conversion reconciliation transaction failed.",
        "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT", error);
    } finally { await session.endSession(); }
  }

  async validateReplay(conversionReference: unknown) {
    const inspection = await walletConversionOperationalInspectionService
      .inspect(conversionReference);
    const authority = await walletConversionReconciliationRepository
      .findByConversionReference(inspection.request.conversionReference);
    if (!authority) throw new WalletConversionOperationalError(
      "Wallet conversion reconciliation was not found.",
      "WALLET_CONVERSION_OPERATIONAL_RECONCILIATION_NOT_FOUND");
    const identity = deriveWalletConversionReconciliationIdentity(
      inspection.request.conversionReference);
    const audits = await WalletConversionAudit.find({
      conversionReference: inspection.request.conversionReference,
      action: WalletConversionAuditAction.RECONCILED,
    }).select("+auditKey +adminActorId");
    if (authority.reconciliationReference !== identity.reconciliationReference ||
      authority.reconciliationKey !== identity.reconciliationKey ||
      !authority.conversionRequestId.equals(inspection.request._id) ||
      authority.conversionReference !== inspection.request.conversionReference ||
      authority.classification !== inspection.classification ||
      authority.severity !== inspection.severity ||
      JSON.stringify(authority.issues) !== JSON.stringify(inspection.issues) ||
      audits.length !== 1 || audits[0].auditKey !==
        createIdempotencyFingerprint(WalletConversionAuditAction.RECONCILED,
          inspection.request.conversionKey) ||
      audits[0].reconciliationReference !== authority.reconciliationReference ||
      !audits[0].adminActorId?.equals(authority.inspectedBy)) {
      throw new WalletConversionOperationalError(
        "Wallet conversion reconciliation replay conflicts.",
        "WALLET_CONVERSION_OPERATIONAL_REPLAY_CONFLICT");
    }
    return toWalletConversionOperationalResponseDto(authority,
      this.allowedActions(inspection, authority));
  }
}

export const walletConversionReconciliationService =
  new WalletConversionReconciliationService();
