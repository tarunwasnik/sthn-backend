import { Types } from "mongoose";

import { LedgerAccount } from "../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../enums/financial/moneyDirection.enum";
import { WalletConversionAuditAction } from
  "../../enums/financial/walletConversionAuditAction.enum";
import { WalletConversionOperationalClassification as Classification } from
  "../../enums/financial/walletConversionOperationalClassification.enum";
import { WalletConversionOperationalIssue as Issue } from
  "../../enums/financial/walletConversionOperationalIssue.enum";
import { WalletConversionOperationalSeverity as Severity } from
  "../../enums/financial/walletConversionOperationalSeverity.enum";
import { WalletConversionProviderOutcome } from
  "../../enums/financial/walletConversionProviderOutcome.enum";
import { WalletConversionRequestStatus } from
  "../../enums/financial/walletConversionRequestStatus.enum";
import { WalletConversionOperationalError } from
  "../../errors/financial/WalletConversionOperationalError";
import { WalletConversionAudit } from
  "../../models/walletConversionAudit.model";
import { WalletConversionRequestDocument } from
  "../../models/walletConversionRequest.model";
import { ledgerEntryRepository } from
  "../../repositories/ledgerEntry.repository";
import { walletConversionRequestRepository } from
  "../../repositories/walletConversionRequest.repository";
import { walletRepository } from
  "../../repositories/wallet/wallet.repository";
import { walletProjectionOperationRepository } from
  "../../repositories/wallet/walletProjectionOperation.repository";
import { deriveWalletConversionAccountingIdentity } from
  "../../utils/financial/walletConversionAccountingIdentity.util";
import { hasReferenceType } from "../../utils/financial/reference.util";
import { walletConversionAccountingService } from
  "./walletConversionAccounting.service";
import { walletConversionProviderExecutionService } from
  "./walletConversionProviderExecution.service";
import { walletConversionRequestService } from
  "./walletConversionRequest.service";

type Identity = ReturnType<typeof deriveWalletConversionAccountingIdentity>;

export interface WalletConversionCommittedGraph {
  request: WalletConversionRequestDocument;
  identity: Identity;
  targetWalletId: Types.ObjectId;
  sourceWalletVersion: number;
  targetWalletVersion: number;
  completedAt?: Date;
}

export interface WalletConversionOperationalInspection {
  request: WalletConversionRequestDocument;
  classification: Classification;
  severity: Severity;
  issues: Issue[];
  graph?: WalletConversionCommittedGraph;
}

const codeOf = (error: unknown) => (error as { code?: string })?.code ?? "";

export class WalletConversionOperationalInspectionService {
  private result(request: WalletConversionRequestDocument,
    classification: Classification, issues: Issue[],
    graph?: WalletConversionCommittedGraph): WalletConversionOperationalInspection {
    const severity = classification === Classification.HEALTHY
      ? Severity.INFO : [Classification.PENDING,
        Classification.REPLAY_REQUIRED,
        Classification.MISSING_AUDIT].includes(classification)
        ? Severity.WARNING : Severity.CRITICAL;
    return { request, classification, severity, issues, graph };
  }

  private async request(reference: unknown) {
    if (typeof reference !== "string" ||
      !hasReferenceType(reference.trim(), "WALLET_CONVERSION")) {
      throw new WalletConversionOperationalError(
        "Wallet conversion operational input is invalid.",
        "WALLET_CONVERSION_OPERATIONAL_INVALID_INPUT");
    }
    const request = await walletConversionRequestRepository.findByReference(
      reference.trim());
    if (!request) throw new WalletConversionOperationalError(
      "Wallet conversion request was not found.",
      "WALLET_CONVERSION_OPERATIONAL_REQUEST_NOT_FOUND");
    return request;
  }

  private classifyRequestError(request: WalletConversionRequestDocument,
    error: unknown) {
    const code = codeOf(error);
    if (code.includes("SNAPSHOT") || code.includes("FX_")) {
      return this.result(request, Classification.CORRUPTED_SNAPSHOT,
        [Issue.SNAPSHOT_CONFLICT]);
    }
    if (code.includes("WALLET")) return this.result(request,
      Classification.INTEGRITY_FAILURE, [Issue.WALLET_INVARIANT_CONFLICT]);
    return this.result(request, Classification.CORRUPTED_REQUEST,
      [Issue.REQUEST_IDENTITY_CONFLICT]);
  }

  private async proveSuccessGraph(request: WalletConversionRequestDocument):
    Promise<WalletConversionOperationalInspection> {
    try {
      await walletConversionProviderExecutionService.validateReplay(
        request.conversionReference, WalletConversionProviderOutcome.SUCCESS,
        { allowAccountingTerminal: true });
    } catch {
      return this.result(request, Classification.CORRUPTED_PROVIDER,
        [Issue.PROVIDER_CONFLICT]);
    }
    const targetWallet = request.accountingTargetWalletId
      ? await walletRepository.findById(request.accountingTargetWalletId)
      : request.targetWalletId
        ? await walletRepository.findById(request.targetWalletId)
        : await walletRepository.findByUserAndCurrency(request.userId,
          request.targetCurrency);
    const sourceWallet = await walletRepository.findById(request.sourceWalletId);
    if (!sourceWallet || !targetWallet ||
      !sourceWallet.userId.equals(request.userId) ||
      !targetWallet.userId.equals(request.userId) ||
      sourceWallet.currency !== request.sourceCurrency ||
      targetWallet.currency !== request.targetCurrency ||
      sourceWallet._id.equals(targetWallet._id) ||
      sourceWallet.currentBalance !== sourceWallet.availableBalance +
        sourceWallet.reservedBalance + sourceWallet.lockedBalance ||
      targetWallet.currentBalance !== targetWallet.availableBalance +
        targetWallet.reservedBalance + targetWallet.lockedBalance) {
      return this.result(request, Classification.INTEGRITY_FAILURE,
        [Issue.WALLET_INVARIANT_CONFLICT]);
    }
    if (!request.providerRequestReference ||
      !request.providerExecutionReference) return this.result(request,
      Classification.CORRUPTED_PROVIDER, [Issue.PROVIDER_CONFLICT]);
    const identity = deriveWalletConversionAccountingIdentity({
      conversionReference: request.conversionReference,
      conversionKey: request.conversionKey,
      providerRequestReference: request.providerRequestReference,
      providerExecutionReference: request.providerExecutionReference,
      fxSnapshotReference: request.fxSnapshotReference,
      userId: request.userId, sourceWalletId: request.sourceWalletId,
      targetWalletId: targetWallet._id as Types.ObjectId,
      sourceCurrency: request.sourceCurrency,
      targetCurrency: request.targetCurrency,
      sourceAmount: request.sourceAmount, targetAmount: request.targetAmount,
    });
    const entries = await ledgerEntryRepository.findManyWithPostingKeys({
      transactionId: identity.accountingTransactionReference,
    });
    const sourceEntry = entries.find((entry) =>
      entry.postingKey === identity.sourcePostingKey);
    const targetEntry = entries.find((entry) =>
      entry.postingKey === identity.targetPostingKey);
    const common = (entry: typeof sourceEntry) => entry &&
      entry.transactionId === identity.accountingTransactionReference &&
      entry.type === LedgerEntryType.WALLET_CONVERSION_COMPLETED &&
      entry.source === LedgerSource.WALLET_CONVERSION &&
      entry.account === LedgerAccount.WALLET_AVAILABLE &&
      entry.userId?.equals(request.userId) &&
      entry.metadata?.conversionReference === request.conversionReference &&
      entry.metadata?.accountingReference === identity.accountingReference &&
      entry.metadata?.providerExecutionReference ===
        request.providerExecutionReference &&
      entry.metadata?.fxSnapshotReference === request.fxSnapshotReference;
    if (entries.length !== 2 || !common(sourceEntry) || !common(targetEntry) ||
      sourceEntry!.direction !== MoneyDirection.DEBIT ||
      !sourceEntry!.walletId?.equals(request.sourceWalletId) ||
      sourceEntry!.amount !== request.sourceAmount ||
      sourceEntry!.currency !== request.sourceCurrency ||
      targetEntry!.direction !== MoneyDirection.CREDIT ||
      !targetEntry!.walletId?.equals(targetWallet._id) ||
      targetEntry!.amount !== request.targetAmount ||
      targetEntry!.currency !== request.targetCurrency) {
      return this.result(request, Classification.CORRUPTED_LEDGER,
        [Issue.LEDGER_CONFLICT]);
    }
    const [sourceProjection, targetProjection] = await Promise.all([
      walletProjectionOperationRepository.findByOperationKey(
        identity.sourceProjectionKey),
      walletProjectionOperationRepository.findByOperationKey(
        identity.targetProjectionKey),
    ]);
    if (!sourceProjection || !targetProjection ||
      sourceProjection.operationReference !==
        identity.sourceProjectionReference ||
      targetProjection.operationReference !==
        identity.targetProjectionReference ||
      !sourceProjection.walletId.equals(request.sourceWalletId) ||
      !targetProjection.walletId.equals(targetWallet._id) ||
      !sourceProjection.userId.equals(request.userId) ||
      !targetProjection.userId.equals(request.userId) ||
      sourceProjection.currency !== request.sourceCurrency ||
      targetProjection.currency !== request.targetCurrency ||
      sourceProjection.deltas.availableBalance !== -request.sourceAmount ||
      targetProjection.deltas.availableBalance !== request.targetAmount ||
      sourceProjection.deltas.reservedBalance !== 0 ||
      targetProjection.deltas.reservedBalance !== 0 ||
      sourceProjection.deltas.lockedBalance !== 0 ||
      targetProjection.deltas.lockedBalance !== 0 ||
      sourceProjection.ledgerEntryIds.length !== 1 ||
      targetProjection.ledgerEntryIds.length !== 1 ||
      !sourceProjection.ledgerEntryIds[0].equals(sourceEntry!._id) ||
      !targetProjection.ledgerEntryIds[0].equals(targetEntry!._id) ||
      sourceWallet.projectionVersion < sourceProjection.projectionVersion ||
      targetWallet.projectionVersion < targetProjection.projectionVersion) {
      return this.result(request, Classification.CORRUPTED_PROJECTION,
        [Issue.PROJECTION_CONFLICT]);
    }
    const audits = await WalletConversionAudit.find({
      conversionReference: request.conversionReference,
      action: WalletConversionAuditAction.COMPLETED,
    });
    const completedAt = request.completedAt ?? audits[0]?.completedAt;
    const graph: WalletConversionCommittedGraph = {
      request, identity, targetWalletId: targetWallet._id as Types.ObjectId,
      sourceWalletVersion: sourceProjection.projectionVersion,
      targetWalletVersion: targetProjection.projectionVersion, completedAt,
    };
    const accountingMissing = !request.accountingReference ||
      !request.accountingKey || !request.accountingFingerprint ||
      !request.accountingTargetWalletId || !request.sourceWalletVersion ||
      !request.targetWalletVersion || !request.completedAt;
    const ledgerMissing = !request.accountingTransactionReference;
    const projectionMissing = !request.sourceProjectionReference ||
      !request.targetProjectionReference;
    const existingConflict =
      (!!request.accountingReference &&
        request.accountingReference !== identity.accountingReference) ||
      (!!request.accountingKey && request.accountingKey !== identity.accountingKey) ||
      (!!request.accountingFingerprint && request.accountingFingerprint !==
        identity.accountingFingerprint) ||
      (!!request.accountingTransactionReference &&
        request.accountingTransactionReference !==
          identity.accountingTransactionReference) ||
      (!!request.accountingTargetWalletId &&
        !request.accountingTargetWalletId.equals(targetWallet._id)) ||
      (!!request.sourceProjectionReference &&
        request.sourceProjectionReference !== identity.sourceProjectionReference) ||
      (!!request.targetProjectionReference &&
        request.targetProjectionReference !== identity.targetProjectionReference) ||
      (!!request.sourceWalletVersion && request.sourceWalletVersion !==
        sourceProjection.projectionVersion) ||
      (!!request.targetWalletVersion && request.targetWalletVersion !==
        targetProjection.projectionVersion);
    if (existingConflict) return this.result(request,
      Classification.CORRUPTED_REQUEST, [Issue.REQUEST_IDENTITY_CONFLICT], graph);
    if (request.status === WalletConversionRequestStatus.APPROVED) {
      if (accountingMissing || ledgerMissing || projectionMissing ||
        audits.length !== 1) return this.result(request,
        Classification.INTEGRITY_FAILURE, [Issue.REQUEST_IDENTITY_CONFLICT],
        graph);
      return this.result(request, Classification.REPLAY_REQUIRED,
        [Issue.ACCOUNTING_COMPLETION_REPLAY_REQUIRED], graph);
    }
    if (request.status !== WalletConversionRequestStatus.COMPLETED) {
      return this.result(request, Classification.CORRUPTED_REQUEST,
        [Issue.REQUEST_IDENTITY_CONFLICT], graph);
    }
    const missingIssues: Issue[] = [];
    if (accountingMissing) missingIssues.push(Issue.ACCOUNTING_REFERENCES_MISSING);
    if (ledgerMissing) missingIssues.push(Issue.LEDGER_REFERENCES_MISSING);
    if (projectionMissing) missingIssues.push(Issue.PROJECTION_REFERENCES_MISSING);
    if (missingIssues.length) return this.result(request,
      Classification.REPLAY_REQUIRED, missingIssues, graph);
    if (audits.length === 0) return this.result(request,
      Classification.MISSING_AUDIT, [Issue.TERMINAL_AUDIT_MISSING], graph);
    if (audits.length !== 1 ||
      audits[0].accountingReference !== identity.accountingReference ||
      audits[0].transactionReference !== identity.accountingTransactionReference ||
      audits[0].sourceProjectionReference !== identity.sourceProjectionReference ||
      audits[0].targetProjectionReference !== identity.targetProjectionReference ||
      audits[0].sourceWalletVersion !== sourceProjection.projectionVersion ||
      audits[0].targetWalletVersion !== targetProjection.projectionVersion ||
      audits[0].completedAt?.getTime() !== request.completedAt?.getTime()) {
      return this.result(request, Classification.INTEGRITY_FAILURE,
        [Issue.AUDIT_CONFLICT], graph);
    }
    return this.result(request, Classification.HEALTHY, [], graph);
  }

  async inspect(reference: unknown): Promise<WalletConversionOperationalInspection> {
    const request = await this.request(reference);
    try {
      await walletConversionRequestService.validateStoredAuthority(request,
        { checkSourceBalance: false, requireSnapshotEligible: false });
    } catch (error) { return this.classifyRequestError(request, error); }
    if ([WalletConversionRequestStatus.PENDING,
      WalletConversionRequestStatus.REJECTED].includes(request.status) ||
      (request.status === WalletConversionRequestStatus.APPROVED &&
        request.providerOutcome !== WalletConversionProviderOutcome.SUCCESS)) {
      return this.result(request, Classification.PENDING, []);
    }
    if (request.status === WalletConversionRequestStatus.FAILED) {
      try {
        await walletConversionAccountingService.validateReplay(
          request.conversionReference);
        return this.result(request, Classification.HEALTHY, []);
      } catch (error) {
        const code = codeOf(error);
        if (code.includes("PROVIDER")) return this.result(request,
          Classification.CORRUPTED_PROVIDER, [Issue.PROVIDER_CONFLICT]);
        if (code.includes("AUDIT")) return this.result(request,
          Classification.MISSING_AUDIT, [Issue.TERMINAL_AUDIT_MISSING]);
        return this.result(request, Classification.INTEGRITY_FAILURE,
          [Issue.REQUEST_IDENTITY_CONFLICT]);
      }
    }
    if (request.providerOutcome === WalletConversionProviderOutcome.SUCCESS) {
      return this.proveSuccessGraph(request);
    }
    return this.result(request, Classification.UNKNOWN,
      [Issue.UNKNOWN_CONFLICT]);
  }
}

export const walletConversionOperationalInspectionService =
  new WalletConversionOperationalInspectionService();
