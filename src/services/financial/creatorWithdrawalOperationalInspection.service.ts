import { ClientSession, Types } from "mongoose";

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
import { InternalWithdrawalProviderRequestStatus as ProviderStatus } from
  "../../enums/financial/internalWithdrawalProviderRequestStatus.enum";
import { LedgerAccount } from "../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../enums/financial/moneyDirection.enum";
import { CreatorWithdrawalOperationalError } from
  "../../errors/financial/CreatorWithdrawalOperationalError";
import { AuditLog } from "../../models/auditLog.model";
import { CreatorWithdrawalRequestDocument } from
  "../../models/creatorWithdrawalRequest.model";
import { InternalWithdrawalProviderRequestDocument } from
  "../../models/internalProvider/internalWithdrawalProviderRequest.model";
import { LedgerEntry } from "../../models/ledgerEntry.model";
import { Wallet } from "../../models/wallet.model";
import { WalletProjectionOperation } from
  "../../models/walletProjectionOperation.model";
import { creatorWithdrawalRequestRepository } from
  "../../repositories/creatorWithdrawalRequest.repository";
import { internalWithdrawalProviderRequestRepository } from
  "../../repositories/internalProvider/internalWithdrawalProviderRequest.repository";
import { deriveCreatorWithdrawalFinalizationIdentity } from
  "../../utils/financial/creatorWithdrawalFinalizationIdentity.util";
import {
  deriveCreatorWithdrawalReconciliationIdentity,
  fingerprintWithdrawalOperationalSnapshot,
} from "../../utils/financial/creatorWithdrawalOperationalIdentity.util";
import {
  deriveWithdrawalProviderExecutionIdentity,
  deriveWithdrawalProviderIdentity,
} from "../../utils/financial/withdrawalProviderIdentity.util";
import { creatorWithdrawalFinalizationService } from
  "./creatorWithdrawalFinalization.service";
import { withdrawalProviderInitializationService } from
  "./withdrawalProviderInitialization.service";
import { withdrawalProviderExecutionService } from
  "./withdrawalProviderExecution.service";

type FinalizationIdentity = ReturnType<
  typeof deriveCreatorWithdrawalFinalizationIdentity
>;

export interface CreatorWithdrawalOperationalInspection {
  withdrawal: CreatorWithdrawalRequestDocument;
  provider?: InternalWithdrawalProviderRequestDocument;
  classification: Classification;
  severity: Severity;
  issueCodes: string[];
  recommendedAction?: Action;
  allowedActions: Action[];
  snapshot: Record<string, unknown>;
  snapshotFingerprint: string;
  reconciliationIdentity: ReturnType<
    typeof deriveCreatorWithdrawalReconciliationIdentity
  >;
  expectedFinalizationIdentity?: FinalizationIdentity;
  finalizationLedgerEntryIds: Types.ObjectId[];
  finalizationProjectionOperationId?: Types.ObjectId;
  missingFinalizationFields: string[];
  terminalAuditCount: number;
}

const corruptSeverity = new Set<Classification>([
  Classification.CORRUPTED_RESERVATION_LEDGER,
  Classification.CORRUPTED_RESERVATION_PROJECTION,
  Classification.CORRUPTED_FINALIZATION_LEDGER,
  Classification.CORRUPTED_FINALIZATION_PROJECTION,
  Classification.CORRUPTED_WALLET,
  Classification.TRANSACTION_CONFLICT,
  Classification.OUTCOME_CONFLICT,
  Classification.INTEGRITY_FAILURE,
]);

export class CreatorWithdrawalOperationalInspectionService {
  private providerIdentityValid(
    withdrawal: CreatorWithdrawalRequestDocument,
    provider: InternalWithdrawalProviderRequestDocument,
  ) {
    try {
      const identity = deriveWithdrawalProviderIdentity({
        withdrawalReference: withdrawal.withdrawalReference,
        creatorId: withdrawal.creatorId,
        creatorReference: provider.creatorReference,
        walletId: withdrawal.walletId,
        destinationReference: withdrawal.destinationReference,
        currency: withdrawal.currency,
        amount: withdrawal.amount,
      });
      const execution = deriveWithdrawalProviderExecutionIdentity({
        providerRequestReference: provider.providerRequestReference,
        providerRequestKey: provider.providerRequestKey,
        providerReference: provider.providerReference,
        providerFingerprint: provider.providerFingerprint,
      });
      return withdrawal.providerRequestReference ===
          provider.providerRequestReference &&
        provider.providerRequestReference === identity.providerRequestReference &&
        provider.providerRequestKey === identity.providerRequestKey &&
        provider.providerReference === identity.providerReference &&
        provider.providerFingerprint === identity.providerFingerprint &&
        (!provider.executionReference ||
          provider.executionReference === execution.executionReference) &&
        (!provider.executionFingerprint ||
          provider.executionFingerprint === execution.executionFingerprint);
    } catch {
      return false;
    }
  }

  private expectedFinalization(
    withdrawal: CreatorWithdrawalRequestDocument,
    provider: InternalWithdrawalProviderRequestDocument,
  ) {
    if (!withdrawal.ledgerTransactionReference || !provider.executionReference ||
      !provider.executionFingerprint || ![
        ProviderStatus.SUCCEEDED, ProviderStatus.FAILED,
      ].includes(provider.providerStatus)) return undefined;
    const outcome = provider.providerStatus === ProviderStatus.SUCCEEDED
      ? CreatorWithdrawalFinalizationOutcome.COMPLETED
      : CreatorWithdrawalFinalizationOutcome.FAILED;
    return deriveCreatorWithdrawalFinalizationIdentity({
      withdrawalReference: withdrawal.withdrawalReference,
      withdrawalKey: withdrawal.withdrawalKey,
      creatorId: withdrawal.creatorId,
      creatorUserId: withdrawal.creatorUserId,
      walletId: withdrawal.walletId,
      destinationId: withdrawal.destinationId,
      destinationReference: withdrawal.destinationReference,
      amount: withdrawal.amount,
      currency: withdrawal.currency,
      providerRequestReference: provider.providerRequestReference,
      providerRequestKey: provider.providerRequestKey,
      providerFingerprint: provider.providerFingerprint,
      providerReference: provider.providerReference,
      providerExecutionReference: provider.executionReference,
      providerExecutionFingerprint: provider.executionFingerprint,
      providerTerminalStatus: provider.providerStatus as "SUCCEEDED" | "FAILED",
      reservationTransactionId: withdrawal.ledgerTransactionReference,
      outcome,
    });
  }

  async inspect(
    withdrawalReference: string,
    session?: ClientSession,
  ): Promise<CreatorWithdrawalOperationalInspection> {
    const withdrawal = await creatorWithdrawalRequestRepository.findByReference(
      withdrawalReference, session,
    );
    if (!withdrawal) throw new CreatorWithdrawalOperationalError(
      "Creator withdrawal was not found.",
      "CREATOR_WITHDRAWAL_OPERATIONAL_WITHDRAWAL_NOT_FOUND",
    );
    const provider = await internalWithdrawalProviderRequestRepository
      .findByWithdrawal(withdrawalReference, session) ?? undefined;
    const wallet = await Wallet.findById(withdrawal.walletId)
      .session(session ?? null);
    const issues: string[] = [];
    const add = (code: string) => {
      if (!issues.includes(code)) issues.push(code);
    };

    let reservationValid = true;
    try {
      await creatorWithdrawalFinalizationService
        .validateReservationAuthority(withdrawalReference);
    } catch (error) {
      reservationValid = false;
      const code = (error as { code?: string }).code ?? "RESERVATION_CONFLICT";
      add(code.includes("PROJECTION")
        ? "RESERVATION_PROJECTION_CONFLICT"
        : "RESERVATION_LEDGER_CONFLICT");
    }

    if (!provider) add("PROVIDER_NOT_FOUND");
    if (provider && withdrawal.providerRequestReference !==
      provider.providerRequestReference) add("REQUEST_LINK_CONFLICT");
    if (provider && provider.amount !== withdrawal.amount) add("AMOUNT_CONFLICT");
    if (provider && provider.currency !== withdrawal.currency) add("CURRENCY_CONFLICT");
    if (provider && provider.destinationReference !==
      withdrawal.destinationReference) add("DESTINATION_CONFLICT");
    if (provider && !this.providerIdentityValid(withdrawal, provider)) {
      add("PROVIDER_IDENTITY_CONFLICT");
    }
    let providerExecutionGraphValid = true;
    if (provider && [ProviderStatus.SUCCEEDED, ProviderStatus.FAILED]
      .includes(provider.providerStatus)) {
      try {
        await withdrawalProviderExecutionService.validateReplay(
          withdrawalReference,
        );
      } catch {
        providerExecutionGraphValid = false;
        add("PROVIDER_EXECUTION_CONFLICT");
      }
    }
    const walletValid = !!wallet &&
      wallet.userId.equals(withdrawal.creatorUserId) &&
      wallet.currency === withdrawal.currency &&
      wallet.currentBalance === wallet.availableBalance +
        wallet.reservedBalance + wallet.lockedBalance;
    if (!walletValid) add("WALLET_CONFLICT");
    const terminalOutcomeConflict = !!provider &&
      [CreatorWithdrawalRequestStatus.COMPLETED,
        CreatorWithdrawalRequestStatus.FAILED].includes(withdrawal.status) &&
      ((provider.providerStatus === ProviderStatus.SUCCEEDED &&
        withdrawal.status !== CreatorWithdrawalRequestStatus.COMPLETED) ||
        (provider.providerStatus === ProviderStatus.FAILED &&
          withdrawal.status !== CreatorWithdrawalRequestStatus.FAILED));

    const identity = provider
      ? this.expectedFinalization(withdrawal, provider) : undefined;
    const entries = identity ? await LedgerEntry.find({
      transactionId: identity.finalizationTransactionId,
    }).select("+postingKey").session(session ?? null) : [];
    const type = provider?.providerStatus === ProviderStatus.SUCCEEDED
      ? LedgerEntryType.CREATOR_WITHDRAWAL_COMPLETED
      : LedgerEntryType.CREATOR_WITHDRAWAL_FAILED_RELEASED;
    const outcome = provider?.providerStatus === ProviderStatus.SUCCEEDED
      ? CreatorWithdrawalFinalizationOutcome.COMPLETED
      : CreatorWithdrawalFinalizationOutcome.FAILED;
    const ledgerValid = !!identity && entries.length === 2 && entries.every(
      (entry) => entry.type === type &&
        entry.source === LedgerSource.WITHDRAWAL_PROVIDER_FINALIZATION &&
        entry.userId?.equals(withdrawal.creatorUserId) &&
        entry.amount === withdrawal.amount && entry.currency === withdrawal.currency,
    ) && !!entries.find((entry) =>
      entry.account === LedgerAccount.WITHDRAWAL_RESERVED &&
      entry.direction === MoneyDirection.DEBIT &&
      entry.walletId?.equals(withdrawal.walletId) &&
      entry.postingKey === identity.reservedDebitPostingKey) &&
      !!entries.find((entry) =>
        entry.account === (outcome === CreatorWithdrawalFinalizationOutcome.COMPLETED
          ? LedgerAccount.PAYOUT_CLEARING : LedgerAccount.WALLET_AVAILABLE) &&
        entry.direction === MoneyDirection.CREDIT &&
        entry.postingKey === identity.terminalCreditPostingKey);
    const projection = identity
      ? await WalletProjectionOperation.findOne({
        operationKey: identity.projectionOperationKey,
      }).select("+fingerprint").session(session ?? null) : null;
    const entryIds = entries.map((entry) => entry._id as Types.ObjectId);
    const entrySet = new Set(entryIds.map(String));
    const projectionValid = !!projection && ledgerValid &&
      projection.operationReference === identity?.projectionReference &&
      projection.walletId.equals(withdrawal.walletId) &&
      projection.userId.equals(withdrawal.creatorUserId) &&
      projection.currency === withdrawal.currency &&
      projection.deltas.availableBalance ===
        (outcome === CreatorWithdrawalFinalizationOutcome.FAILED
          ? withdrawal.amount : 0) &&
      projection.deltas.reservedBalance === -withdrawal.amount &&
      projection.deltas.lockedBalance === 0 &&
      projection.ledgerEntryIds.length === 2 &&
      projection.ledgerEntryIds.every((id) => entrySet.has(id.toString()));
    const auditAction = outcome === CreatorWithdrawalFinalizationOutcome.COMPLETED
      ? AuditAction.CREATOR_WITHDRAWAL_COMPLETED
      : AuditAction.CREATOR_WITHDRAWAL_FAILED;
    const auditCount = identity ? await AuditLog.countDocuments({
      action: auditAction,
      entityId: withdrawal._id,
      "financialContext.withdrawalReference": withdrawalReference,
      "financialContext.ledgerTransactionReference":
        identity.finalizationTransactionId,
    }).session(session ?? null) : 0;

    const missingFields: string[] = [];
    let finalizationLinkConflict = false;
    if (identity) {
      if (!withdrawal.finalizationOutcome) missingFields.push("finalizationOutcome");
      if (!withdrawal.finalizationReference) missingFields.push("finalizationReference");
      if (!withdrawal.finalizationKey) missingFields.push("finalizationKey");
      if (!withdrawal.finalizationTransactionId) missingFields.push("finalizationTransactionId");
      if (withdrawal.finalizationLedgerEntryIds.length === 0) {
        missingFields.push("finalizationLedgerEntryIds");
      }
      if (!withdrawal.finalizationProjectionOperationId) {
        missingFields.push("finalizationProjectionOperationId");
      }
      if (!withdrawal.finalizationProjectionOperationReference) {
        missingFields.push("finalizationProjectionOperationReference");
      }
      if (!withdrawal.finalizationFingerprint) missingFields.push("finalizationFingerprint");
      if (!withdrawal.providerTerminalReference) missingFields.push("providerTerminalReference");
      finalizationLinkConflict =
        (!!withdrawal.finalizationOutcome &&
          withdrawal.finalizationOutcome !== outcome) ||
        (!!withdrawal.finalizationReference &&
          withdrawal.finalizationReference !== identity.finalizationReference) ||
        (!!withdrawal.finalizationKey &&
          withdrawal.finalizationKey !== identity.finalizationKey) ||
        (!!withdrawal.finalizationTransactionId &&
          withdrawal.finalizationTransactionId !==
            identity.finalizationTransactionId) ||
        (!!withdrawal.finalizationProjectionOperationReference &&
          withdrawal.finalizationProjectionOperationReference !==
            identity.projectionReference) ||
        (!!withdrawal.finalizationFingerprint &&
          withdrawal.finalizationFingerprint !==
            identity.finalizationFingerprint) ||
        (!!withdrawal.providerTerminalReference &&
          withdrawal.providerTerminalReference !== provider?.executionReference);
      if (finalizationLinkConflict) add("FINALIZATION_LINK_CONFLICT");
    }

    let classification = Classification.UNKNOWN;
    if (!reservationValid) classification = issues.includes("RESERVATION_PROJECTION_CONFLICT")
      ? Classification.CORRUPTED_RESERVATION_PROJECTION
      : Classification.CORRUPTED_RESERVATION_LEDGER;
    else if (!provider) classification = Classification.CORRUPTED_PROVIDER;
    else if (issues.includes("REQUEST_LINK_CONFLICT")) classification = Classification.REQUEST_LINK_CONFLICT;
    else if (issues.includes("AMOUNT_CONFLICT")) classification = Classification.AMOUNT_CONFLICT;
    else if (issues.includes("CURRENCY_CONFLICT")) classification = Classification.CURRENCY_CONFLICT;
    else if (issues.includes("DESTINATION_CONFLICT")) classification = Classification.DESTINATION_CONFLICT;
    else if (issues.includes("PROVIDER_IDENTITY_CONFLICT")) classification = Classification.PROVIDER_IDENTITY_CONFLICT;
    else if (!walletValid) classification = Classification.CORRUPTED_WALLET;
    else if (terminalOutcomeConflict) classification = Classification.OUTCOME_CONFLICT;
    else if (!providerExecutionGraphValid) classification = Classification.CORRUPTED_PROVIDER;
    else if (withdrawal.status === CreatorWithdrawalRequestStatus.RESERVED &&
      provider.providerStatus === ProviderStatus.INITIALIZED) {
      try {
        await withdrawalProviderInitializationService.validateReplay(withdrawalReference);
        classification = Classification.PROVIDER_INITIALIZED;
      } catch { classification = Classification.CORRUPTED_PROVIDER; }
    } else if (withdrawal.status === CreatorWithdrawalRequestStatus.RESERVED &&
      provider.providerStatus === ProviderStatus.PROCESSING) {
      classification = Classification.PROVIDER_PROCESSING;
    } else if (withdrawal.status === CreatorWithdrawalRequestStatus.RESERVED &&
      [ProviderStatus.SUCCEEDED, ProviderStatus.FAILED].includes(provider.providerStatus)) {
      if (entries.length || projection || auditCount) {
        classification = Classification.TRANSACTION_CONFLICT;
      } else {
        classification = provider.providerStatus === ProviderStatus.SUCCEEDED
          ? Classification.FINALIZATION_PENDING_SUCCESS
          : Classification.FINALIZATION_PENDING_FAILURE;
      }
    } else if ([CreatorWithdrawalRequestStatus.COMPLETED,
      CreatorWithdrawalRequestStatus.FAILED].includes(withdrawal.status)) {
      const expectedStatus = provider.providerStatus === ProviderStatus.SUCCEEDED
        ? CreatorWithdrawalRequestStatus.COMPLETED
        : CreatorWithdrawalRequestStatus.FAILED;
      if (withdrawal.status !== expectedStatus) classification = Classification.OUTCOME_CONFLICT;
      else if (finalizationLinkConflict) classification = Classification.TRANSACTION_CONFLICT;
      else if (!ledgerValid) classification = Classification.CORRUPTED_FINALIZATION_LEDGER;
      else if (!projectionValid) classification = Classification.CORRUPTED_FINALIZATION_PROJECTION;
      else if (missingFields.length) classification = Classification.MISSING_FINALIZATION_LINKS;
      else if (auditCount === 0) classification = Classification.MISSING_AUDIT;
      else if (auditCount !== 1) classification = Classification.CORRUPTED_AUDIT;
      else {
        classification = provider.providerStatus === ProviderStatus.SUCCEEDED
          ? Classification.COMPLETED_REPLAY_REQUIRED
          : Classification.FAILED_REPLAY_REQUIRED;
        try {
          await creatorWithdrawalFinalizationService.validateReplay(withdrawalReference);
          classification = provider.providerStatus === ProviderStatus.SUCCEEDED
            ? Classification.HEALTHY_COMPLETED : Classification.HEALTHY_FAILED;
        } catch { add("FINALIZATION_REPLAY_CONFLICT"); }
      }
    } else classification = Classification.CORRUPTED_WITHDRAWAL;

    if (entries.length && !ledgerValid) add("FINALIZATION_LEDGER_CONFLICT");
    if (projection && !projectionValid) add("FINALIZATION_PROJECTION_CONFLICT");
    if ([CreatorWithdrawalRequestStatus.COMPLETED,
      CreatorWithdrawalRequestStatus.FAILED].includes(withdrawal.status) &&
      missingFields.length) add("MISSING_FINALIZATION_LINKS");
    if ([CreatorWithdrawalRequestStatus.COMPLETED,
      CreatorWithdrawalRequestStatus.FAILED].includes(withdrawal.status) &&
      identity && auditCount === 0) add("TERMINAL_AUDIT_MISSING");
    const healthy = [Classification.HEALTHY_COMPLETED,
      Classification.HEALTHY_FAILED].includes(classification);
    const pending = [Classification.FINALIZATION_PENDING_SUCCESS,
      Classification.FINALIZATION_PENDING_FAILURE].includes(classification);
    const repairLinks = classification === Classification.MISSING_FINALIZATION_LINKS;
    const repairAudit = classification === Classification.MISSING_AUDIT;
    const severity = healthy ? Severity.INFO
      : pending || classification === Classification.PROVIDER_INITIALIZED ||
        classification === Classification.PROVIDER_PROCESSING ? Severity.WARNING
        : repairLinks || repairAudit ? Severity.ERROR
          : corruptSeverity.has(classification) ? Severity.CRITICAL : Severity.ERROR;
    const allowedActions = [Action.INSPECT];
    if (pending) allowedActions.push(Action.RETRY_FINALIZATION);
    if (repairLinks) allowedActions.push(Action.RESTORE_FINALIZATION_LINKS);
    if (repairAudit) allowedActions.push(Action.RESTORE_TERMINAL_AUDIT);
    allowedActions.push(Action.ACKNOWLEDGE, Action.RESOLVE);
    const recommendedAction = pending ? Action.RETRY_FINALIZATION
      : repairLinks ? Action.RESTORE_FINALIZATION_LINKS
        : repairAudit ? Action.RESTORE_TERMINAL_AUDIT
          : healthy ? Action.RESOLVE : Action.ACKNOWLEDGE;
    const snapshot = {
      withdrawalReference: withdrawal.withdrawalReference,
      withdrawalStatus: withdrawal.status,
      providerRequestReference: provider?.providerRequestReference,
      providerStatus: provider?.providerStatus,
      providerOutcome: provider?.terminalResult?.outcome,
      reservationTransactionReference: withdrawal.ledgerTransactionReference,
      reservationProjectionReference: withdrawal.projectionReference,
      finalizationOutcome: withdrawal.finalizationOutcome,
      finalizationReference: withdrawal.finalizationReference,
      finalizationTransactionReference: withdrawal.finalizationTransactionId,
      finalizationProjectionReference:
        withdrawal.finalizationProjectionOperationReference,
      finalizationLedgerEntryCount: entries.length,
      terminalAuditCount: auditCount,
      amount: withdrawal.amount,
      currency: withdrawal.currency,
      destinationReference: withdrawal.destinationReference,
      walletReference: provider?.walletReference,
      classification,
      issueCodes: issues,
    };
    return {
      withdrawal, provider, classification, severity, issueCodes: issues,
      recommendedAction, allowedActions, snapshot,
      snapshotFingerprint: fingerprintWithdrawalOperationalSnapshot(snapshot),
      reconciliationIdentity: deriveCreatorWithdrawalReconciliationIdentity({
        withdrawalReference: withdrawal.withdrawalReference,
        providerRequestReference: provider?.providerRequestReference,
        creatorId: withdrawal.creatorId.toString(),
        creatorUserId: withdrawal.creatorUserId.toString(),
        walletId: withdrawal.walletId.toString(),
        destinationReference: withdrawal.destinationReference,
        amount: withdrawal.amount, currency: withdrawal.currency,
        providerTerminalStatus: withdrawal.providerTerminalStatus,
        finalizationOutcome: withdrawal.finalizationOutcome ??
          (provider?.providerStatus === ProviderStatus.SUCCEEDED
            ? CreatorWithdrawalFinalizationOutcome.COMPLETED
            : provider?.providerStatus === ProviderStatus.FAILED
              ? CreatorWithdrawalFinalizationOutcome.FAILED : undefined),
      }),
      expectedFinalizationIdentity: identity,
      finalizationLedgerEntryIds: entryIds,
      finalizationProjectionOperationId: projection?._id as Types.ObjectId | undefined,
      missingFinalizationFields: missingFields,
      terminalAuditCount: auditCount,
    };
  }
}

export const creatorWithdrawalOperationalInspectionService =
  new CreatorWithdrawalOperationalInspectionService();
