import { Types } from "mongoose";
import { WalletTopUpOperationalAction as Action } from "../../enums/financial/walletTopUpOperationalAction.enum";
import {
  WalletTopUpReconciliationError,
  WalletTopUpReconciliationErrorCode as ErrorCode,
} from "../../errors/financial/WalletTopUpReconciliationError";
import { deterministicOperationalReference } from "../../utils/financial/topUpOperationalIdentity.util";
import { walletTopUpRequestRepository } from "../../repositories/walletTopUpRequest.repository";
import { walletTopUpRepairOperationRepository } from "../../repositories/walletTopUpRepairOperation.repository";
import { walletTopUpReconciliationService } from "./walletTopUpReconciliation.service";
import { walletTopUpOperationalAuditService } from "./walletTopUpOperationalAudit.service";

const REPAIR_ACTIONS = new Set<Action>([
  Action.REPAIR_REQUEST_LINKS,
  Action.REPAIR_LEDGER_LINK,
  Action.REPAIR_PROJECTION_LINK,
]);

export class WalletTopUpRepairService {
  private error(message: string, code: keyof typeof ErrorCode) {
    return new WalletTopUpReconciliationError(message, ErrorCode[code]);
  }

  private duplicateKey(error: unknown): boolean {
    return typeof error === "object" && error !== null &&
      "code" in error && (error as { code?: unknown }).code === 11000;
  }

  async repair(reconciliationReference: string, action: Action, adminUserId: string) {
    if (!REPAIR_ACTIONS.has(action)) {
      throw this.error("Invalid top-up repair action.", "INVALID_ACTION");
    }
    const actorId = new Types.ObjectId(adminUserId);
    const loaded = await walletTopUpReconciliationService.getByReference(reconciliationReference);
    const appliedReplay = await walletTopUpRepairOperationRepository.findLatestApplied(
      reconciliationReference,
      action,
    );
    if (appliedReplay) {
      return {
        reconciliation: walletTopUpReconciliationService.toSafeResult(loaded),
        repair: {
          operationReference: appliedReplay.operationReference,
          action: appliedReplay.action,
          status: appliedReplay.status,
          repairedFields: appliedReplay.repairedFields,
          appliedAt: appliedReplay.appliedAt,
        },
      };
    }
    const inspected = await walletTopUpReconciliationService.inspectForOperation(loaded.topUpReference);
    if (loaded.fingerprint !== inspected.observation.fingerprint ||
      loaded.classification !== inspected.observation.classification) {
      throw this.error("Repair snapshot changed before execution.", "SNAPSHOT_CONFLICT");
    }
    if (!inspected.observation.allowedActions.includes(action)) {
      throw this.error("Repair is not allowed for this classification.", "REPAIR_NOT_ALLOWED");
    }
    const { request, funding, ledger, operation, identity } = inspected.observation;
    if (!funding || !request.providerFundingId || !identity) {
      throw this.error("Repair authority is ambiguous.", "REPAIR_AMBIGUOUS");
    }
    if ((action === Action.REPAIR_LEDGER_LINK || action === Action.REPAIR_REQUEST_LINKS) && !ledger) {
      throw this.error("A unique valid Ledger entry is required.", "REPAIR_AMBIGUOUS");
    }
    if ((action === Action.REPAIR_PROJECTION_LINK || action === Action.REPAIR_REQUEST_LINKS) &&
      (!ledger || !operation)) {
      throw this.error("A unique valid projection operation is required.", "REPAIR_AMBIGUOUS");
    }

    const operationKey = `${reconciliationReference}:${action}:${request.topUpReference}:${inspected.observation.fingerprint}`;
    const operationReference = deterministicOperationalReference("WTRP", operationKey);
    const existing = await walletTopUpRepairOperationRepository.findByOperationKey(operationKey);
    if (existing) {
      if (existing.action !== action ||
        existing.snapshotFingerprint !== inspected.observation.fingerprint) {
        throw this.error("Repair idempotency identity conflicts.", "REPAIR_CONFLICT");
      }
      return {
        reconciliation: walletTopUpReconciliationService.toSafeResult(inspected.reconciliation),
        repair: {
          operationReference: existing.operationReference,
          action: existing.action,
          status: existing.status,
          repairedFields: existing.repairedFields,
          appliedAt: existing.appliedAt,
        },
      };
    }

    try {
      await walletTopUpRepairOperationRepository.create({
        operationReference,
        operationKey,
        reconciliationReference,
        topUpReference: request.topUpReference,
        action,
        snapshotFingerprint: inspected.observation.fingerprint,
        actorId,
      });
    } catch (error) {
      if (!this.duplicateKey(error)) throw error;
      const replay = await walletTopUpRepairOperationRepository.findByOperationKey(operationKey);
      if (!replay) throw this.error("Repair operation could not be recovered.", "INTEGRITY_ERROR");
      return {
        reconciliation: walletTopUpReconciliationService.toSafeResult(inspected.reconciliation),
        repair: {
          operationReference: replay.operationReference,
          action: replay.action,
          status: replay.status,
          repairedFields: replay.repairedFields,
          appliedAt: replay.appliedAt,
        },
      };
    }
    await walletTopUpOperationalAuditService.record({
      topUpReference: request.topUpReference,
      reconciliationReference,
      action,
      actorType: "ADMIN",
      actorId,
      result: "SUCCEEDED",
      classificationBefore: inspected.observation.classification,
      reasonCode: "REPAIR_ATTEMPTED",
      metadata: { operationReference },
    });

    const fields: {
      ledgerEntryId?: Types.ObjectId;
      ledgerReference?: string;
      walletProjectionOperationId?: Types.ObjectId;
      walletProjectionOperationReference?: string;
      accountingTransactionId?: string;
    } = {};
    if ((action === Action.REPAIR_LEDGER_LINK || action === Action.REPAIR_REQUEST_LINKS) && ledger) {
      if (!request.ledgerEntryId) fields.ledgerEntryId = ledger._id as Types.ObjectId;
      if (!request.ledgerReference) fields.ledgerReference = ledger.ledgerReference;
    }
    if ((action === Action.REPAIR_PROJECTION_LINK || action === Action.REPAIR_REQUEST_LINKS) && operation) {
      if (!request.walletProjectionOperationId) {
        fields.walletProjectionOperationId = operation._id as Types.ObjectId;
      }
      if (!request.walletProjectionOperationReference) {
        fields.walletProjectionOperationReference = operation.operationReference;
      }
    }
    if (!request.accountingTransactionId) fields.accountingTransactionId = identity.transactionId;
    const repairedFields = Object.keys(fields);
    const updated = repairedFields.length
      ? await walletTopUpRequestRepository.repairMissingAccountingLinks({
        topUpReference: request.topUpReference,
        expectedStatus: request.status,
        providerFundingId: funding._id as Types.ObjectId,
        providerFundingReference: funding.fundingReference,
        fields,
      }) : request;
    if (!updated) {
      await walletTopUpRepairOperationRepository.reject(operationKey, "REPAIR_GUARD_CONFLICT");
      await walletTopUpOperationalAuditService.record({
        topUpReference: request.topUpReference,
        reconciliationReference,
        action,
        actorType: "ADMIN",
        actorId,
        result: "REJECTED",
        classificationBefore: inspected.observation.classification,
        reasonCode: "REPAIR_GUARD_CONFLICT",
      });
      throw this.error("Repair guard conflicted with authoritative state.", "REPAIR_CONFLICT");
    }

    const appliedAt = new Date();
    const completedRepair = await walletTopUpRepairOperationRepository.complete(
      operationKey, repairedFields, appliedAt,
    );
    if (!completedRepair) throw this.error("Repair completion state is invalid.", "INTEGRITY_ERROR");
    const after = await walletTopUpReconciliationService.inspectForOperation(request.topUpReference);
    await walletTopUpOperationalAuditService.record({
      topUpReference: request.topUpReference,
      reconciliationReference,
      action,
      actorType: "ADMIN",
      actorId,
      result: "SUCCEEDED",
      classificationBefore: inspected.observation.classification,
      classificationAfter: after.observation.classification,
      reasonCode: "REPAIR_APPLIED",
      metadata: { operationReference, repairedFieldCount: repairedFields.length },
    });
    return {
      reconciliation: walletTopUpReconciliationService.toSafeResult(after.reconciliation),
      repair: {
        operationReference,
        action,
        status: completedRepair.status,
        repairedFields,
        appliedAt,
      },
    };
  }
}

export const walletTopUpRepairService = new WalletTopUpRepairService();
