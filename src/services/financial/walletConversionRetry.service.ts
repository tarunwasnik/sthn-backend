import mongoose, { Types } from "mongoose";

import { toWalletConversionOperationalResponseDto,
  WalletConversionOperationalResponseDto } from
  "../../dtos/wallet/walletConversionOperational.response.dto";
import { WalletConversionAuditAction } from
  "../../enums/financial/walletConversionAuditAction.enum";
import { WalletConversionOperationalClassification as Classification } from
  "../../enums/financial/walletConversionOperationalClassification.enum";
import { WalletConversionOperationalSeverity as Severity } from
  "../../enums/financial/walletConversionOperationalSeverity.enum";
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
import { walletConversionRequestRepository } from
  "../../repositories/walletConversionRequest.repository";
import { walletConversionRetryAttemptRepository } from
  "../../repositories/walletConversionRetryAttempt.repository";
import { createIdempotencyFingerprint } from
  "../../utils/financial/idempotency.util";
import { deriveWalletConversionRetryIdentity } from
  "../../utils/financial/walletConversionOperationalIdentity.util";
import { walletConversionOperationalInspectionService } from
  "./walletConversionOperationalInspection.service";

export type WalletConversionRetryStage =
  | "AFTER_RETRY"
  | "BEFORE_AUDIT"
  | "BEFORE_COMMIT";

interface Options {
  now?: () => Date;
  failureInjector?: (stage: WalletConversionRetryStage) =>
    void | Promise<void>;
}

export class WalletConversionRetryService {
  private readonly now: () => Date;
  constructor(private readonly options: Options = {}) {
    this.now = options.now ?? (() => new Date());
  }
  private async inject(stage: WalletConversionRetryStage) {
    await this.options.failureInjector?.(stage);
  }

  async retry(conversionReference: unknown, adminUserId: string,
    transactionAttempt = 0): Promise<WalletConversionOperationalResponseDto> {
    const inspection = await walletConversionOperationalInspectionService
      .inspect(conversionReference);
    const reconciliation = await walletConversionReconciliationRepository
      .findByConversionReference(inspection.request.conversionReference);
    if (!reconciliation) throw new WalletConversionOperationalError(
      "Wallet conversion reconciliation was not found.",
      "WALLET_CONVERSION_OPERATIONAL_RECONCILIATION_NOT_FOUND");
    const retryIdentity = deriveWalletConversionRetryIdentity(
      inspection.request.conversionReference);
    const existing = await walletConversionRetryAttemptRepository.findByKey(
      retryIdentity.attemptKey);
    if (existing) return this.validateReplay(
      inspection.request.conversionReference);
    const graph = inspection.graph;
    if (inspection.classification !== Classification.REPLAY_REQUIRED ||
      inspection.request.status !== WalletConversionRequestStatus.APPROVED ||
      !graph || !inspection.request.accountingReference ||
      !inspection.request.accountingTransactionReference ||
      !inspection.request.completedAt) {
      throw new WalletConversionOperationalError(
        "Wallet conversion retry is not allowed.",
        "WALLET_CONVERSION_OPERATIONAL_RETRY_NOT_ALLOWED");
    }
    const session = await mongoose.startSession();
    try {
      let result: Awaited<ReturnType<typeof
        walletConversionReconciliationRepository.findByReference>> | null = null;
      await session.withTransaction(async () => {
        const at = this.now();
        const completed = await walletConversionRequestRepository
          .retryCompleteCommittedAccounting({
            conversionReference: inspection.request.conversionReference,
            providerExecutionReference:
              inspection.request.providerExecutionReference!,
            accountingReference: graph.identity.accountingReference,
            accountingTransactionReference:
              graph.identity.accountingTransactionReference,
            completedAt: inspection.request.completedAt!, session,
          });
        if (!completed) throw new WalletConversionOperationalError(
          "Wallet conversion retry guard conflicted.",
          "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT");
        await walletConversionRetryAttemptRepository.create({
          ...retryIdentity,
          reconciliationReference: reconciliation.reconciliationReference,
          conversionReference: inspection.request.conversionReference,
          performedBy: new Types.ObjectId(adminUserId), status: "APPLIED", at,
          performedAt: at,
        }, session);
        result = await walletConversionReconciliationRepository.markRetry({
          reference: reconciliation.reconciliationReference,
          expectedClassification: Classification.REPLAY_REQUIRED,
          classification: Classification.HEALTHY, severity: Severity.INFO,
          issues: [], inspectedAt: at,
        }, session);
        if (!result) throw new WalletConversionOperationalError(
          "Wallet conversion retry authority conflicted.",
          "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT");
        await this.inject("AFTER_RETRY");
        await this.inject("BEFORE_AUDIT");
        await walletConversionAuditRepository.createOnce({
          auditKey: createIdempotencyFingerprint(
            WalletConversionAuditAction.RETRY,
            inspection.request.conversionKey),
          action: WalletConversionAuditAction.RETRY,
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
          issues: [], retryPerformed: true, repairPerformed: false,
        }, session);
        await this.inject("BEFORE_COMMIT");
      });
      if (!result) throw new WalletConversionOperationalError(
        "Wallet conversion retry did not commit.",
        "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT");
      return toWalletConversionOperationalResponseDto(result);
    } catch (error: any) {
      if (([11000, 112, 251].includes(error?.code) || error?.code ===
        "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT") &&
        transactionAttempt < 5) {
        const winner = await walletConversionRetryAttemptRepository.findByKey(
          retryIdentity.attemptKey);
        if (winner) return this.validateReplay(
          inspection.request.conversionReference);
        return this.retry(conversionReference, adminUserId,
          transactionAttempt + 1);
      }
      if (error instanceof WalletConversionOperationalError) throw error;
      throw new WalletConversionOperationalError(
        "Wallet conversion retry transaction failed.",
        "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT", error);
    } finally { await session.endSession(); }
  }

  async validateReplay(conversionReference: unknown) {
    const inspection = await walletConversionOperationalInspectionService
      .inspect(conversionReference);
    const reconciliation = await walletConversionReconciliationRepository
      .findByConversionReference(inspection.request.conversionReference);
    const identity = deriveWalletConversionRetryIdentity(
      inspection.request.conversionReference);
    const [attempt, audits] = await Promise.all([
      walletConversionRetryAttemptRepository.findByKey(identity.attemptKey),
      WalletConversionAudit.find({
        conversionReference: inspection.request.conversionReference,
        action: WalletConversionAuditAction.RETRY,
      }).select("+adminActorId"),
    ]);
    if (!reconciliation || !attempt || audits.length !== 1 ||
      inspection.classification !== Classification.HEALTHY ||
      inspection.request.status !== WalletConversionRequestStatus.COMPLETED ||
      !reconciliation.retryPerformed ||
      attempt.attemptReference !== identity.attemptReference ||
      attempt.reconciliationReference !==
        reconciliation.reconciliationReference ||
      attempt.conversionReference !== inspection.request.conversionReference ||
      attempt.status !== "APPLIED" || audits[0].retryPerformed !== true ||
      !audits[0].adminActorId?.equals(attempt.performedBy) ||
      audits[0].reconciliationReference !==
        reconciliation.reconciliationReference) {
      throw new WalletConversionOperationalError(
        "Wallet conversion retry replay conflicts.",
        "WALLET_CONVERSION_OPERATIONAL_REPLAY_CONFLICT");
    }
    return toWalletConversionOperationalResponseDto(reconciliation);
  }
}

export const walletConversionRetryService =
  new WalletConversionRetryService();
