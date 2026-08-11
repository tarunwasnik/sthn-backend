import mongoose, { ClientSession, Types } from "mongoose";

import { toWalletConversionOperationalResponseDto,
  WalletConversionOperationalResponseDto } from
  "../../dtos/wallet/walletConversionOperational.response.dto";
import { WalletConversionAuditAction } from
  "../../enums/financial/walletConversionAuditAction.enum";
import { WalletConversionOperationalClassification as Classification } from
  "../../enums/financial/walletConversionOperationalClassification.enum";
import { WalletConversionOperationalIssue as Issue } from
  "../../enums/financial/walletConversionOperationalIssue.enum";
import { WalletConversionOperationalSeverity as Severity } from
  "../../enums/financial/walletConversionOperationalSeverity.enum";
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
import { walletConversionRepairOperationRepository } from
  "../../repositories/walletConversionRepairOperation.repository";
import { walletConversionRequestRepository } from
  "../../repositories/walletConversionRequest.repository";
import { createIdempotencyFingerprint } from
  "../../utils/financial/idempotency.util";
import { deriveWalletConversionRepairIdentity } from
  "../../utils/financial/walletConversionOperationalIdentity.util";
import { WalletConversionOperationalInspection,
  walletConversionOperationalInspectionService } from
  "./walletConversionOperationalInspection.service";

export type WalletConversionRepairStage =
  | "AFTER_REPAIR"
  | "BEFORE_AUDIT"
  | "BEFORE_COMMIT";

interface Options {
  now?: () => Date;
  failureInjector?: (stage: WalletConversionRepairStage) =>
    void | Promise<void>;
}

const issueFor = (action: WalletConversionRepairAction) => ({
  [WalletConversionRepairAction.RESTORE_MISSING_AUDIT]:
    Issue.TERMINAL_AUDIT_MISSING,
  [WalletConversionRepairAction.RESTORE_LEDGER_REFERENCES]:
    Issue.LEDGER_REFERENCES_MISSING,
  [WalletConversionRepairAction.RESTORE_PROJECTION_REFERENCES]:
    Issue.PROJECTION_REFERENCES_MISSING,
  [WalletConversionRepairAction.RESTORE_ACCOUNTING_REFERENCES]:
    Issue.ACCOUNTING_REFERENCES_MISSING,
})[action];

export class WalletConversionRepairService {
  private readonly now: () => Date;
  constructor(private readonly options: Options = {}) {
    this.now = options.now ?? (() => new Date());
  }
  private async inject(stage: WalletConversionRepairStage) {
    await this.options.failureInjector?.(stage);
  }

  private async restore(inspection: WalletConversionOperationalInspection,
    action: WalletConversionRepairAction, session: ClientSession) {
    const request = inspection.request;
    const graph = inspection.graph!;
    if (action === WalletConversionRepairAction.RESTORE_MISSING_AUDIT) {
      if (!graph.completedAt) return null;
      await walletConversionAuditRepository.createOnce({
        auditKey: createIdempotencyFingerprint(
          WalletConversionAuditAction.COMPLETED, request.conversionKey),
        action: WalletConversionAuditAction.COMPLETED,
        conversionReference: request.conversionReference,
        sourceCurrency: request.sourceCurrency,
        targetCurrency: request.targetCurrency,
        sourceAmount: request.sourceAmount, targetAmount: request.targetAmount,
        fxSnapshotReference: request.fxSnapshotReference,
        fxEffectiveDate: request.fxEffectiveDate, requestedAt: request.requestedAt,
        providerRequestReference: request.providerRequestReference,
        providerExecutionReference: request.providerExecutionReference,
        providerStatus: request.providerStatus,
        providerOutcome: request.providerOutcome,
        processingAt: request.providerProcessingAt,
        accountingReference: graph.identity.accountingReference,
        transactionReference: graph.identity.accountingTransactionReference,
        sourceProjectionReference: graph.identity.sourceProjectionReference,
        targetProjectionReference: graph.identity.targetProjectionReference,
        sourceWalletVersion: graph.sourceWalletVersion,
        targetWalletVersion: graph.targetWalletVersion,
        completedAt: graph.completedAt,
      }, session);
      return ["terminalAudit"];
    }
    if (action === WalletConversionRepairAction.RESTORE_LEDGER_REFERENCES) {
      const restored = await walletConversionRequestRepository
        .restoreLedgerReferences({
          conversionReference: request.conversionReference,
          accountingReference: graph.identity.accountingReference,
          accountingTransactionReference:
            graph.identity.accountingTransactionReference, session,
        });
      return restored ? ["accountingTransactionReference"] : null;
    }
    if (action === WalletConversionRepairAction.RESTORE_PROJECTION_REFERENCES) {
      const restored = await walletConversionRequestRepository
        .restoreProjectionReferences({
          conversionReference: request.conversionReference,
          accountingReference: graph.identity.accountingReference,
          sourceProjectionReference: graph.identity.sourceProjectionReference,
          targetProjectionReference: graph.identity.targetProjectionReference,
          session,
        });
      return restored ? ["sourceProjectionReference",
        "targetProjectionReference"] : null;
    }
    if (!graph.completedAt) return null;
    const restored = await walletConversionRequestRepository
      .restoreAccountingReferences({
        conversionReference: request.conversionReference,
        accountingReference: graph.identity.accountingReference,
        accountingKey: graph.identity.accountingKey,
        accountingFingerprint: graph.identity.accountingFingerprint,
        accountingTargetWalletId: graph.targetWalletId,
        sourceWalletVersion: graph.sourceWalletVersion,
        targetWalletVersion: graph.targetWalletVersion,
        completedAt: graph.completedAt, session,
      });
    return restored ? ["accountingReference", "accountingKey",
      "accountingFingerprint", "accountingTargetWalletId",
      "sourceWalletVersion", "targetWalletVersion", "completedAt"] : null;
  }

  async repair(conversionReference: unknown,
    action: WalletConversionRepairAction, adminUserId: string,
    transactionAttempt = 0): Promise<WalletConversionOperationalResponseDto> {
    if (!Object.values(WalletConversionRepairAction).includes(action)) {
      throw new WalletConversionOperationalError(
        "Wallet conversion repair action is invalid.",
        "WALLET_CONVERSION_OPERATIONAL_INVALID_INPUT");
    }
    const inspection = await walletConversionOperationalInspectionService
      .inspect(conversionReference);
    const reconciliation = await walletConversionReconciliationRepository
      .findByConversionReference(inspection.request.conversionReference);
    if (!reconciliation) throw new WalletConversionOperationalError(
      "Wallet conversion reconciliation was not found.",
      "WALLET_CONVERSION_OPERATIONAL_RECONCILIATION_NOT_FOUND");
    const identity = deriveWalletConversionRepairIdentity(
      inspection.request.conversionReference, action);
    const existing = await walletConversionRepairOperationRepository.findByKey(
      identity.repairKey);
    if (existing) return this.validateReplay(
      inspection.request.conversionReference, action);
    const expectedIssue = issueFor(action);
    const allowedClassification = action ===
      WalletConversionRepairAction.RESTORE_MISSING_AUDIT
      ? Classification.MISSING_AUDIT : Classification.REPLAY_REQUIRED;
    if (inspection.classification !== allowedClassification ||
      inspection.request.status !== WalletConversionRequestStatus.COMPLETED ||
      !inspection.graph || inspection.issues.length !== 1 ||
      inspection.issues[0] !== expectedIssue) {
      throw new WalletConversionOperationalError(
        "Wallet conversion repair is not allowed.",
        "WALLET_CONVERSION_OPERATIONAL_REPAIR_NOT_ALLOWED");
    }
    const session = await mongoose.startSession();
    try {
      let result: Awaited<ReturnType<typeof
        walletConversionReconciliationRepository.findByReference>> | null = null;
      await session.withTransaction(async () => {
        const restoredFields = await this.restore(inspection, action, session);
        if (!restoredFields) throw new WalletConversionOperationalError(
          "Wallet conversion repair guard conflicted.",
          "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT");
        const at = this.now();
        await walletConversionRepairOperationRepository.create({
          ...identity,
          reconciliationReference: reconciliation.reconciliationReference,
          conversionReference: inspection.request.conversionReference,
          action, restoredFields, performedBy: new Types.ObjectId(adminUserId),
          status: "APPLIED", performedAt: at,
        }, session);
        result = await walletConversionReconciliationRepository.markRepair({
          reference: reconciliation.reconciliationReference,
          expectedClassification: allowedClassification,
          classification: Classification.HEALTHY, severity: Severity.INFO,
          issues: [], inspectedAt: at,
        }, session);
        if (!result) throw new WalletConversionOperationalError(
          "Wallet conversion repair authority conflicted.",
          "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT");
        await this.inject("AFTER_REPAIR");
        await this.inject("BEFORE_AUDIT");
        await walletConversionAuditRepository.createOnce({
          auditKey: createIdempotencyFingerprint(
            WalletConversionAuditAction.REPAIRED,
            inspection.request.conversionKey),
          action: WalletConversionAuditAction.REPAIRED,
          conversionReference: inspection.request.conversionReference,
          sourceCurrency: inspection.request.sourceCurrency,
          targetCurrency: inspection.request.targetCurrency,
          sourceAmount: inspection.request.sourceAmount,
          targetAmount: inspection.request.targetAmount,
          fxSnapshotReference: inspection.request.fxSnapshotReference,
          fxEffectiveDate: inspection.request.fxEffectiveDate,
          requestedAt: inspection.request.requestedAt,
          adminActorId: new Types.ObjectId(adminUserId),
          reconciliationReference: reconciliation.reconciliationReference,
          classification: Classification.HEALTHY, severity: Severity.INFO,
          issues: [], retryPerformed: false, repairPerformed: true,
        }, session);
        await this.inject("BEFORE_COMMIT");
      });
      if (!result) throw new WalletConversionOperationalError(
        "Wallet conversion repair did not commit.",
        "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT");
      return toWalletConversionOperationalResponseDto(result);
    } catch (error: any) {
      if (([11000, 112, 251].includes(error?.code) || error?.code ===
        "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT") &&
        transactionAttempt < 5) {
        const winner = await walletConversionRepairOperationRepository.findByKey(
          identity.repairKey);
        if (winner) return this.validateReplay(
          inspection.request.conversionReference, action);
        return this.repair(conversionReference, action, adminUserId,
          transactionAttempt + 1);
      }
      if (error instanceof WalletConversionOperationalError) throw error;
      throw new WalletConversionOperationalError(
        "Wallet conversion repair transaction failed.",
        "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT", error);
    } finally { await session.endSession(); }
  }

  async validateReplay(conversionReference: unknown,
    action: WalletConversionRepairAction) {
    const inspection = await walletConversionOperationalInspectionService
      .inspect(conversionReference);
    const reconciliation = await walletConversionReconciliationRepository
      .findByConversionReference(inspection.request.conversionReference);
    const identity = deriveWalletConversionRepairIdentity(
      inspection.request.conversionReference, action);
    const [operation, audits] = await Promise.all([
      walletConversionRepairOperationRepository.findByKey(identity.repairKey),
      WalletConversionAudit.find({
        conversionReference: inspection.request.conversionReference,
        action: WalletConversionAuditAction.REPAIRED,
      }).select("+adminActorId"),
    ]);
    if (!reconciliation || !operation || audits.length !== 1 ||
      inspection.classification !== Classification.HEALTHY ||
      !reconciliation.repairPerformed ||
      operation.repairReference !== identity.repairReference ||
      operation.reconciliationReference !==
        reconciliation.reconciliationReference ||
      operation.conversionReference !== inspection.request.conversionReference ||
      operation.action !== action || operation.status !== "APPLIED" ||
      audits[0].repairPerformed !== true ||
      !audits[0].adminActorId?.equals(operation.performedBy) ||
      audits[0].reconciliationReference !==
        reconciliation.reconciliationReference) {
      throw new WalletConversionOperationalError(
        "Wallet conversion repair replay conflicts.",
        "WALLET_CONVERSION_OPERATIONAL_REPLAY_CONFLICT");
    }
    return toWalletConversionOperationalResponseDto(reconciliation);
  }
}

export const walletConversionRepairService =
  new WalletConversionRepairService();
