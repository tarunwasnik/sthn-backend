import { Types } from "mongoose";
import { walletTopUpRequestRepository } from "../../repositories/walletTopUpRequest.repository";
import { internalTopUpFundingRepository } from "../../repositories/internalTopUpFunding.repository";
import { ledgerEntryRepository } from "../../repositories/ledgerEntry.repository";
import { walletProjectionOperationRepository } from "../../repositories/wallet/walletProjectionOperation.repository";
import { walletRepository } from "../../repositories/wallet/wallet.repository";
import {
  walletTopUpReconciliationRepository,
  ReconciliationListInput,
} from "../../repositories/walletTopUpReconciliation.repository";
import { IWalletTopUpRequest } from "../../models/walletTopUpRequest.model";
import { IInternalTopUpFunding } from "../../models/internalTopUpFunding.model";
import { ILedgerEntry } from "../../models/ledgerEntry.model";
import { WalletProjectionOperationDocument } from "../../models/walletProjectionOperation.model";
import { WalletDocument } from "../../models/wallet.model";
import { WalletTopUpReconciliationDocument } from "../../models/walletTopUpReconciliation.model";
import { WalletTopUpRequestStatus } from "../../enums/financial/walletTopUpRequestStatus.enum";
import { InternalTopUpFundingStatus } from "../../enums/financial/internalTopUpFundingStatus.enum";
import { WalletTopUpReconciliationClassification as Classification } from "../../enums/financial/walletTopUpReconciliationClassification.enum";
import { WalletTopUpReconciliationStatus as ReconciliationStatus } from "../../enums/financial/walletTopUpReconciliationStatus.enum";
import { WalletTopUpReconciliationSeverity as Severity } from "../../enums/financial/walletTopUpReconciliationSeverity.enum";
import { WalletTopUpOperationalAction as Action } from "../../enums/financial/walletTopUpOperationalAction.enum";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { LedgerAccount } from "../../enums/financial/ledgerAccount.enum";
import { MoneyDirection } from "../../enums/financial/moneyDirection.enum";
import { WALLET_TOP_UP_RETRY_POLICY } from "../../constants/financial/walletTopUpRetryPolicy";
import {
  deriveTopUpOperationalAccountingIdentity,
  deterministicOperationalReference,
  deterministicSnapshotFingerprint,
  topUpProjectionFingerprint,
  TopUpOperationalAccountingIdentity,
} from "../../utils/financial/topUpOperationalIdentity.util";
import {
  WalletTopUpReconciliationError,
  WalletTopUpReconciliationErrorCode as ErrorCode,
} from "../../errors/financial/WalletTopUpReconciliationError";
import { walletTopUpOperationalAuditService } from "./walletTopUpOperationalAudit.service";

export interface WalletTopUpInspection {
  request: IWalletTopUpRequest;
  funding: IInternalTopUpFunding | null;
  ledger: ILedgerEntry | null;
  operation: WalletProjectionOperationDocument | null;
  wallet: WalletDocument | null;
  identity: TopUpOperationalAccountingIdentity | null;
  classification: Classification;
  severity: Severity;
  issues: string[];
  allowedActions: Action[];
  recommendedAction?: Action;
  snapshot: Record<string, unknown>;
  fingerprint: string;
}

export interface ReconciliationInspectionResult {
  reconciliation: WalletTopUpReconciliationDocument;
  observation: WalletTopUpInspection;
}

const RETRYABLE = new Set<Classification>([
  Classification.ACCOUNTING_NOT_STARTED,
  Classification.LEDGER_ONLY,
  Classification.LEDGER_AND_PROJECTION,
  Classification.COMPLETION_PENDING,
]);

export class WalletTopUpReconciliationService {
  private error(message: string, code: keyof typeof ErrorCode, status = 409) {
    return new WalletTopUpReconciliationError(message, ErrorCode[code], status);
  }

  private classify(input: {
    request: IWalletTopUpRequest;
    funding: IInternalTopUpFunding | null;
    ledger: ILedgerEntry | null;
    operation: WalletProjectionOperationDocument | null;
    wallet: WalletDocument | null;
    identity: TopUpOperationalAccountingIdentity | null;
  }): { classification: Classification; severity: Severity; issues: string[] } {
    const { request, funding, ledger, operation, wallet, identity } = input;
    const issues: string[] = [];
    const add = (issue: string) => { if (!issues.includes(issue)) issues.push(issue); };

    if (!funding) add("PROVIDER_FUNDING_NOT_FOUND");
    if (funding && (!request.providerFundingId?.equals(funding._id as Types.ObjectId) ||
      request.providerFundingReference !== funding.fundingReference ||
      !funding.topUpRequestId.equals(request._id) ||
      funding.topUpReference !== request.topUpReference)) add("REQUEST_PROVIDER_LINK_CONFLICT");
    if (funding && funding.amount !== request.amount) add("AMOUNT_CONFLICT");
    if (funding && funding.currency !== request.currency) add("CURRENCY_CONFLICT");
    if (!wallet || !wallet._id.equals(request.walletId) || !wallet.userId.equals(request.userId)) add("WALLET_CONFLICT");
    else if (wallet.currency !== request.currency) add("CURRENCY_CONFLICT");
    if (identity && request.accountingTransactionId !== undefined &&
      request.accountingTransactionId !== identity.transactionId) add("TRANSACTION_CONFLICT");

    let ledgerValid = false;
    if (ledger && identity && funding) {
      const metadata = ledger.metadata ?? {};
      if (ledger.amount !== request.amount) add("AMOUNT_CONFLICT");
      if (ledger.currency !== request.currency) add("CURRENCY_CONFLICT");
      if (ledger.transactionId !== identity.transactionId ||
        ledger.type !== LedgerEntryType.WALLET_TOP_UP ||
        ledger.source !== LedgerSource.INTERNAL_TOP_UP_FUNDING ||
        ledger.direction !== MoneyDirection.CREDIT ||
        ledger.account !== LedgerAccount.CASH ||
        !ledger.userId?.equals(request.userId) ||
        metadata.topUpReference !== request.topUpReference ||
        metadata.providerFundingReference !== funding.fundingReference) add("LEDGER_CONFLICT");
      else ledgerValid = ledger.amount === request.amount && ledger.currency === request.currency;
      if ((request.ledgerEntryId && !request.ledgerEntryId.equals(ledger._id as Types.ObjectId)) ||
        (request.ledgerReference && request.ledgerReference !== ledger.ledgerReference)) add("REQUEST_LEDGER_LINK_CONFLICT");
    }

    let projectionValid = false;
    if (operation && !ledger) add("ORPHAN_PROJECTION");
    if (operation && ledger && identity) {
      if (operation.deltas.availableBalance !== request.amount) add("AMOUNT_CONFLICT");
      if (operation.currency !== request.currency) add("CURRENCY_CONFLICT");
      if (operation.operationKey !== identity.operationKey ||
        operation.operationReference !== identity.operationReference ||
        !operation.walletId.equals(request.walletId) ||
        !operation.userId.equals(request.userId) ||
        operation.deltas.reservedBalance !== 0 ||
        operation.deltas.lockedBalance !== 0 ||
        operation.ledgerEntryIds.length !== 1 ||
        !operation.ledgerEntryIds[0].equals(ledger._id as Types.ObjectId) ||
        operation.fingerprint !== topUpProjectionFingerprint(
          request, identity.operationKey, (ledger._id as Types.ObjectId).toString(),
        )) add("PROJECTION_CONFLICT");
      else projectionValid = operation.deltas.availableBalance === request.amount &&
        operation.currency === request.currency && ledgerValid;
      if ((request.walletProjectionOperationId &&
        !request.walletProjectionOperationId.equals(operation._id as Types.ObjectId)) ||
        (request.walletProjectionOperationReference &&
          request.walletProjectionOperationReference !== operation.operationReference)) {
        add("REQUEST_PROJECTION_LINK_CONFLICT");
      }
    }

    if (request.status === WalletTopUpRequestStatus.COMPLETED) {
      for (const field of [
        request.providerFundingId, request.providerFundingReference,
        request.ledgerEntryId, request.ledgerReference,
        request.walletProjectionOperationId, request.walletProjectionOperationReference,
        request.accountingTransactionId, request.completedAt ?? request.accountingCompletedAt,
      ]) if (!field) add("COMPLETED_LINK_MISSING");
      const valid = funding?.status === InternalTopUpFundingStatus.SUCCEEDED &&
        ledgerValid && projectionValid && wallet !== null && issues.length === 0;
      return valid
        ? { classification: Classification.COMPLETED_VALID, severity: Severity.INFO, issues }
        : { classification: Classification.COMPLETED_CORRUPTED, severity: Severity.CRITICAL, issues };
    }

    if (funding?.status === InternalTopUpFundingStatus.FAILED) {
      if (!ledger && !operation &&
        [WalletTopUpRequestStatus.PROCESSING, WalletTopUpRequestStatus.FAILED].includes(request.status)) {
        return { classification: Classification.PROVIDER_FAILED, severity: Severity.WARNING, issues };
      }
      add("FAILED_PROVIDER_HAS_ACCOUNTING_EFFECT");
      return { classification: Classification.UNKNOWN_INTEGRITY_FAILURE, severity: Severity.CRITICAL, issues };
    }
    if (funding && [InternalTopUpFundingStatus.CREATED, InternalTopUpFundingStatus.PROCESSING].includes(funding.status)) {
      return { classification: Classification.RETRYABLE_PROVIDER_PENDING, severity: Severity.WARNING, issues };
    }
    if (!funding || funding.status !== InternalTopUpFundingStatus.SUCCEEDED) {
      return { classification: Classification.UNKNOWN_INTEGRITY_FAILURE, severity: Severity.CRITICAL, issues };
    }
    if (issues.includes("AMOUNT_CONFLICT")) return { classification: Classification.AMOUNT_CONFLICT, severity: Severity.CRITICAL, issues };
    if (issues.includes("CURRENCY_CONFLICT")) return { classification: Classification.CURRENCY_CONFLICT, severity: Severity.CRITICAL, issues };
    if (issues.includes("TRANSACTION_CONFLICT")) return { classification: Classification.TRANSACTION_CONFLICT, severity: Severity.CRITICAL, issues };
    if (issues.includes("WALLET_CONFLICT")) return { classification: Classification.WALLET_CONFLICT, severity: Severity.CRITICAL, issues };
    if (issues.some((issue) => issue.startsWith("REQUEST_"))) return { classification: Classification.REQUEST_LINK_CONFLICT, severity: Severity.CRITICAL, issues };
    if (issues.includes("ORPHAN_PROJECTION")) return { classification: Classification.ORPHAN_PROJECTION, severity: Severity.CRITICAL, issues };
    if (issues.includes("LEDGER_CONFLICT")) return { classification: Classification.LEDGER_CONFLICT, severity: Severity.CRITICAL, issues };
    if (issues.includes("PROJECTION_CONFLICT")) return { classification: Classification.PROJECTION_CONFLICT, severity: Severity.CRITICAL, issues };
    if (!ledger && !operation) return { classification: Classification.ACCOUNTING_NOT_STARTED, severity: Severity.WARNING, issues };
    if (ledgerValid && !operation) return { classification: Classification.LEDGER_ONLY, severity: Severity.WARNING, issues };
    if (ledgerValid && projectionValid) return { classification: Classification.COMPLETION_PENDING, severity: Severity.WARNING, issues };
    return { classification: Classification.UNKNOWN_INTEGRITY_FAILURE, severity: Severity.CRITICAL, issues };
  }

  private actions(
    classification: Classification,
    requestStatus: WalletTopUpRequestStatus,
    issues: string[],
    ledger: ILedgerEntry | null,
    operation: WalletProjectionOperationDocument | null,
  ): { allowedActions: Action[]; recommendedAction?: Action } {
    const allowedActions = [Action.INSPECT];
    let recommendedAction: Action | undefined;
    if (classification === Classification.PROVIDER_FAILED &&
      requestStatus === WalletTopUpRequestStatus.PROCESSING) {
      allowedActions.push(Action.FINALIZE_PROVIDER_FAILURE);
      recommendedAction = Action.FINALIZE_PROVIDER_FAILURE;
    } else if (RETRYABLE.has(classification)) {
      const action = classification === Classification.COMPLETION_PENDING
        ? Action.RETRY_COMPLETION : Action.RETRY_ACCOUNTING;
      allowedActions.push(action);
      recommendedAction = action;
    } else if (classification === Classification.COMPLETED_VALID) {
      allowedActions.push(Action.RESOLVE_RECONCILIATION);
      recommendedAction = Action.RESOLVE_RECONCILIATION;
    } else if (classification === Classification.COMPLETED_CORRUPTED &&
      issues.length > 0 &&
      issues.every((issue) => issue === "COMPLETED_LINK_MISSING") &&
      ledger && operation) {
      allowedActions.push(
        Action.REPAIR_REQUEST_LINKS,
        Action.REPAIR_LEDGER_LINK,
        Action.REPAIR_PROJECTION_LINK,
        Action.ACKNOWLEDGE_CORRUPTION,
      );
      recommendedAction = Action.REPAIR_REQUEST_LINKS;
    } else if ([Severity.CRITICAL].includes(
      this.classifySeverity(classification),
    )) {
      allowedActions.push(Action.ACKNOWLEDGE_CORRUPTION);
      recommendedAction = Action.ACKNOWLEDGE_CORRUPTION;
    }
    return { allowedActions, recommendedAction };
  }

  private classifySeverity(classification: Classification): Severity {
    if (classification === Classification.COMPLETED_VALID ||
      classification === Classification.HEALTHY_COMPLETED) return Severity.INFO;
    if (classification === Classification.PROVIDER_FAILED ||
      RETRYABLE.has(classification) ||
      classification === Classification.RETRYABLE_PROVIDER_PENDING) return Severity.WARNING;
    return Severity.CRITICAL;
  }

  private safeResult(reconciliation: WalletTopUpReconciliationDocument) {
    const snapshot = reconciliation.snapshot ?? {};
    return {
      reconciliationReference: reconciliation.reconciliationReference,
      topUpReference: reconciliation.topUpReference,
      classification: reconciliation.classification,
      status: reconciliation.status,
      severity: reconciliation.severity,
      providerFundingReference: reconciliation.providerFundingReference,
      requestStatus: snapshot.requestStatus,
      providerStatus: snapshot.providerStatus,
      ledgerReference: snapshot.discoveredLedgerReference,
      projectionOperationReference: snapshot.discoveredProjectionReference,
      accountingTransactionId: snapshot.derivedAccountingTransactionId,
      amount: snapshot.amount,
      currency: snapshot.currency,
      issueCodes: reconciliation.detectedIssues,
      recommendedAction: reconciliation.recommendedAction,
      allowedActions: reconciliation.allowedActions,
      retry: {
        count: reconciliation.retryCount,
        max: reconciliation.maxRetryCount,
        nextRetryAt: reconciliation.nextRetryAt,
        lastRetryAt: reconciliation.lastRetryAt,
        lastRetryCode: reconciliation.lastRetryCode,
      },
      resolution: reconciliation.resolvedAt ? {
        action: reconciliation.resolutionAction,
        code: reconciliation.resolutionCode,
        note: reconciliation.resolutionNote,
        resolvedAt: reconciliation.resolvedAt,
      } : undefined,
      detectedAt: reconciliation.detectedAt,
      lastInspectedAt: reconciliation.lastInspectedAt,
      createdAt: reconciliation.createdAt,
      updatedAt: reconciliation.updatedAt,
    };
  }

  async inspectForOperation(topUpReference: string): Promise<ReconciliationInspectionResult> {
    const request = await walletTopUpRequestRepository.findByReferenceForAccounting(topUpReference);
    if (!request) throw this.error("Top-up request was not found.", "REQUEST_NOT_FOUND", 404);
    const funding = await internalTopUpFundingRepository.findByTopUpRequestId(request._id);
    const identity = funding ? deriveTopUpOperationalAccountingIdentity(request, funding) : null;
    const [ledger, operation, wallet] = await Promise.all([
      identity ? ledgerEntryRepository.findByPostingKey(identity.postingKey) : Promise.resolve(null),
      identity ? walletProjectionOperationRepository.findByOperationKey(identity.operationKey) : Promise.resolve(null),
      walletRepository.findById(request.walletId),
    ]);
    const classified = this.classify({ request, funding, ledger, operation, wallet, identity });
    const actionData = this.actions(
      classified.classification, request.status, classified.issues, ledger, operation,
    );
    const snapshot: Record<string, unknown> = {
      requestStatus: request.status,
      providerStatus: funding?.status,
      requestProviderFundingReference: request.providerFundingReference,
      requestLedgerReference: request.ledgerReference,
      requestProjectionReference: request.walletProjectionOperationReference,
      requestAccountingTransactionId: request.accountingTransactionId,
      derivedAccountingTransactionId: identity?.transactionId,
      discoveredLedgerReference: ledger?.ledgerReference,
      discoveredProjectionReference: operation?.operationReference,
      amount: request.amount,
      currency: request.currency,
      walletReference: request.walletId.toString(),
      classification: classified.classification,
      issueCodes: classified.issues,
    };
    const fingerprint = deterministicSnapshotFingerprint(snapshot);
    const existing = await walletTopUpReconciliationRepository.findByTopUpRequestId(
      request._id as Types.ObjectId,
    );
    const status = existing?.status === ReconciliationStatus.IN_PROGRESS
      ? ReconciliationStatus.IN_PROGRESS
      : existing && existing.fingerprint === fingerprint &&
        [
          ReconciliationStatus.ACKNOWLEDGED,
          ReconciliationStatus.FAILED,
          ReconciliationStatus.RESOLVED,
        ].includes(existing.status)
        ? existing.status : ReconciliationStatus.OPEN;
    const now = new Date();
    const reconciliation = await walletTopUpReconciliationRepository.upsertObservation({
      reconciliationReference: deterministicOperationalReference("WTR", request.topUpReference),
      reconciliationKey: `wallet-top-up-reconciliation:${request.topUpReference}`,
      topUpRequestId: request._id as Types.ObjectId,
      topUpReference: request.topUpReference,
      userId: request.userId,
      walletId: request.walletId,
      providerFundingId: funding?._id as Types.ObjectId | undefined,
      providerFundingReference: funding?.fundingReference,
      classification: classified.classification,
      status,
      severity: classified.severity,
      detectedIssues: classified.issues,
      detectedAt: existing?.detectedAt ?? now,
      lastInspectedAt: now,
      recommendedAction: actionData.recommendedAction,
      allowedActions: actionData.allowedActions,
      maxRetryCount: WALLET_TOP_UP_RETRY_POLICY.MAX_ACCOUNTING_RETRIES,
      snapshot,
      fingerprint,
    });
    const observation: WalletTopUpInspection = {
      request, funding, ledger, operation, wallet, identity,
      classification: classified.classification,
      severity: classified.severity,
      issues: classified.issues,
      allowedActions: actionData.allowedActions,
      recommendedAction: actionData.recommendedAction,
      snapshot,
      fingerprint,
    };
    return { reconciliation, observation };
  }

  async inspect(topUpReference: string, adminUserId: string) {
    const result = await this.inspectForOperation(topUpReference);
    await walletTopUpOperationalAuditService.record({
      topUpReference,
      reconciliationReference: result.reconciliation.reconciliationReference,
      action: Action.INSPECT,
      actorType: "ADMIN",
      actorId: new Types.ObjectId(adminUserId),
      result: "SUCCEEDED",
      classificationAfter: result.observation.classification,
      reasonCode: "RECONCILIATION_INSPECTED",
    });
    return this.safeResult(result.reconciliation);
  }

  async getByReference(reference: string) {
    const reconciliation = await walletTopUpReconciliationRepository.findByReference(reference);
    if (!reconciliation) throw this.error("Top-up reconciliation was not found.", "NOT_FOUND", 404);
    return reconciliation;
  }

  toSafeResult(reconciliation: WalletTopUpReconciliationDocument) {
    return this.safeResult(reconciliation);
  }

  async list(input: Omit<ReconciliationListInput, "page" | "limit"> & {
    page?: unknown;
    limit?: unknown;
  }) {
    const page = input.page === undefined ? 1 : Number(input.page);
    const limit = input.limit === undefined ? 25 : Number(input.limit);
    if (!Number.isSafeInteger(page) || page < 1 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw this.error("Invalid reconciliation pagination.", "INVALID_ACTION", 400);
    }
    const result = await walletTopUpReconciliationRepository.list({ ...input, page, limit });
    return {
      items: result.items.map((item) => this.safeResult(item)),
      pagination: { page, limit, total: result.total },
    };
  }

  async updateStatus(input: {
    reconciliationReference: string;
    action: Action;
    resolutionCode: string;
    resolutionNote?: string;
    adminUserId: string;
  }) {
    if (![Action.ACKNOWLEDGE_CORRUPTION, Action.RESOLVE_RECONCILIATION].includes(input.action)) {
      throw this.error("Invalid reconciliation status action.", "INVALID_ACTION");
    }
    const loaded = await this.getByReference(input.reconciliationReference);
    if (loaded.status === ReconciliationStatus.RESOLVED ||
      loaded.status === ReconciliationStatus.ACKNOWLEDGED) {
      if (loaded.resolutionAction === input.action &&
        loaded.resolutionCode === input.resolutionCode &&
        (loaded.resolutionNote ?? undefined) === (input.resolutionNote ?? undefined)) {
        return this.safeResult(loaded);
      }
      throw this.error("Reconciliation is already resolved.", "ALREADY_RESOLVED");
    }
    const inspected = await this.inspectForOperation(loaded.topUpReference);
    if (loaded.fingerprint !== inspected.observation.fingerprint ||
      loaded.classification !== inspected.observation.classification) {
      throw this.error("Reconciliation changed before status update.", "SNAPSHOT_CONFLICT");
    }
    if (!inspected.observation.allowedActions.includes(input.action)) {
      throw this.error("Status action is not allowed for this classification.", "INVALID_ACTION");
    }
    const actorId = new Types.ObjectId(input.adminUserId);
    const updated = await walletTopUpReconciliationRepository.updateResolution({
      reconciliationReference: input.reconciliationReference,
      fingerprint: inspected.observation.fingerprint,
      expectedStatuses: [
        ReconciliationStatus.OPEN,
        ReconciliationStatus.RETRY_SCHEDULED,
        ReconciliationStatus.FAILED,
      ],
      status: input.action === Action.RESOLVE_RECONCILIATION
        ? ReconciliationStatus.RESOLVED : ReconciliationStatus.ACKNOWLEDGED,
      action: input.action,
      code: input.resolutionCode,
      note: input.resolutionNote,
      at: new Date(),
      actorId,
    });
    if (!updated) throw this.error("Reconciliation status guard conflicted.", "SNAPSHOT_CONFLICT");
    await walletTopUpOperationalAuditService.record({
      topUpReference: loaded.topUpReference,
      reconciliationReference: input.reconciliationReference,
      action: input.action,
      actorType: "ADMIN",
      actorId,
      result: "SUCCEEDED",
      classificationBefore: loaded.classification,
      classificationAfter: inspected.observation.classification,
      reasonCode: input.resolutionCode,
    });
    return this.safeResult(await this.getByReference(input.reconciliationReference));
  }
}

export const walletTopUpReconciliationService = new WalletTopUpReconciliationService();
