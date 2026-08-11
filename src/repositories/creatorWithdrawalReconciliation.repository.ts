import { ClientSession, Types } from "mongoose";
import { CreatorWithdrawalOperationalAction } from
  "../enums/financial/creatorWithdrawalOperationalAction.enum";
import { CreatorWithdrawalOperationalClassification } from
  "../enums/financial/creatorWithdrawalOperationalClassification.enum";
import { CreatorWithdrawalOperationalSeverity } from
  "../enums/financial/creatorWithdrawalOperationalSeverity.enum";
import { CreatorWithdrawalReconciliationStatus } from
  "../enums/financial/creatorWithdrawalReconciliationStatus.enum";
import {
  CreatorWithdrawalReconciliation,
  CreatorWithdrawalReconciliationDocument,
} from "../models/creatorWithdrawalReconciliation.model";

const AUTHORITY = "+reconciliationKey +withdrawalRequestId +providerRequestId " +
  "+creatorId +creatorUserId +walletId +snapshot +snapshotFingerprint " +
  "+acknowledgedBy +resolvedBy";

export interface CreatorWithdrawalObservation {
  reconciliationReference: string;
  reconciliationKey: string;
  withdrawalRequestId: Types.ObjectId;
  withdrawalReference: string;
  providerRequestId?: Types.ObjectId;
  providerRequestReference?: string;
  creatorId: Types.ObjectId;
  creatorUserId: Types.ObjectId;
  walletId: Types.ObjectId;
  destinationReference: string;
  classification: CreatorWithdrawalOperationalClassification;
  severity: CreatorWithdrawalOperationalSeverity;
  issueCodes: string[];
  recommendedAction?: CreatorWithdrawalOperationalAction;
  allowedActions: CreatorWithdrawalOperationalAction[];
  snapshot: Record<string, unknown>;
  snapshotFingerprint: string;
  maxRetryCount: number;
  inspectedAt: Date;
}

export class CreatorWithdrawalReconciliationRepository {
  findByReference(reference: string, session?: ClientSession) {
    return CreatorWithdrawalReconciliation.findOne({
      reconciliationReference: reference,
    }).select(AUTHORITY).session(session ?? null).exec();
  }

  findByWithdrawalReference(reference: string, session?: ClientSession) {
    return CreatorWithdrawalReconciliation.findOne({
      withdrawalReference: reference,
    }).select(AUTHORITY).session(session ?? null).exec();
  }

  upsertObservation(input: CreatorWithdrawalObservation, session: ClientSession) {
    return CreatorWithdrawalReconciliation.findOneAndUpdate({
      withdrawalRequestId: input.withdrawalRequestId,
    }, {
      $set: {
        providerRequestId: input.providerRequestId,
        providerRequestReference: input.providerRequestReference,
        classification: input.classification,
        severity: input.severity,
        issueCodes: input.issueCodes,
        recommendedAction: input.recommendedAction,
        allowedActions: input.allowedActions,
        snapshot: input.snapshot,
        snapshotFingerprint: input.snapshotFingerprint,
        lastInspectedAt: input.inspectedAt,
      },
      $setOnInsert: {
        reconciliationReference: input.reconciliationReference,
        reconciliationKey: input.reconciliationKey,
        withdrawalRequestId: input.withdrawalRequestId,
        withdrawalReference: input.withdrawalReference,
        creatorId: input.creatorId,
        creatorUserId: input.creatorUserId,
        walletId: input.walletId,
        destinationReference: input.destinationReference,
        status: CreatorWithdrawalReconciliationStatus.OPEN,
        retryCount: 0,
        maxRetryCount: input.maxRetryCount,
        detectedAt: input.inspectedAt,
      },
      $inc: { version: 1 },
    }, { new: true, upsert: true, runValidators: true, session })
      .select(AUTHORITY).exec();
  }

  async list(input: {
    page: number; limit: number;
    status?: CreatorWithdrawalReconciliationStatus;
    classification?: CreatorWithdrawalOperationalClassification;
    severity?: CreatorWithdrawalOperationalSeverity;
    withdrawalReference?: string; providerRequestReference?: string;
    creatorId?: Types.ObjectId; dateFrom?: Date; dateTo?: Date;
    retryReady?: boolean;
  }) {
    const filter: Record<string, unknown> = {};
    if (input.status) filter.status = input.status;
    if (input.classification) filter.classification = input.classification;
    if (input.severity) filter.severity = input.severity;
    if (input.withdrawalReference) filter.withdrawalReference = input.withdrawalReference;
    if (input.providerRequestReference) filter.providerRequestReference = input.providerRequestReference;
    if (input.creatorId) filter.creatorId = input.creatorId;
    if (input.retryReady) {
      filter.classification = { $in: [
        CreatorWithdrawalOperationalClassification.FINALIZATION_PENDING_SUCCESS,
        CreatorWithdrawalOperationalClassification.FINALIZATION_PENDING_FAILURE,
      ] };
      filter.status = { $in: [
        CreatorWithdrawalReconciliationStatus.OPEN,
        CreatorWithdrawalReconciliationStatus.RETRY_SCHEDULED,
      ] };
      filter.$expr = { $lt: ["$retryCount", "$maxRetryCount"] };
    }
    if (input.dateFrom || input.dateTo) filter.createdAt = {
      ...(input.dateFrom ? { $gte: input.dateFrom } : {}),
      ...(input.dateTo ? { $lte: input.dateTo } : {}),
    };
    const [items, total] = await Promise.all([
      CreatorWithdrawalReconciliation.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((input.page - 1) * input.limit).limit(input.limit).exec(),
      CreatorWithdrawalReconciliation.countDocuments(filter),
    ]);
    return { items, total };
  }

  beginRetry(input: {
    reference: string; fingerprint: string;
    classification: CreatorWithdrawalOperationalClassification;
    expectedRetryCount: number; at: Date;
  }, session: ClientSession) {
    return CreatorWithdrawalReconciliation.findOneAndUpdate({
      reconciliationReference: input.reference,
      snapshotFingerprint: input.fingerprint,
      classification: input.classification,
      retryCount: input.expectedRetryCount,
      status: { $in: [CreatorWithdrawalReconciliationStatus.OPEN,
        CreatorWithdrawalReconciliationStatus.RETRY_SCHEDULED] },
      $expr: { $lt: ["$retryCount", "$maxRetryCount"] },
    }, { $set: {
      status: CreatorWithdrawalReconciliationStatus.IN_PROGRESS,
      lastRetryAt: input.at,
      lastRetryCode: CreatorWithdrawalOperationalAction.RETRY_FINALIZATION,
    }, $unset: { nextRetryAt: 1 }, $inc: { retryCount: 1, version: 1 } },
    { new: true, runValidators: true, session }).select(AUTHORITY).exec();
  }

  completeRetry(input: {
    reference: string; retryCount: number;
    classification: CreatorWithdrawalOperationalClassification;
    severity: CreatorWithdrawalOperationalSeverity;
    snapshot: Record<string, unknown>; snapshotFingerprint: string;
    issueCodes: string[]; resultCode: string;
  }, session: ClientSession) {
    return CreatorWithdrawalReconciliation.findOneAndUpdate({
      reconciliationReference: input.reference,
      status: CreatorWithdrawalReconciliationStatus.IN_PROGRESS,
      retryCount: input.retryCount,
    }, { $set: {
      status: CreatorWithdrawalReconciliationStatus.OPEN,
      classification: input.classification,
      severity: input.severity,
      snapshot: input.snapshot,
      snapshotFingerprint: input.snapshotFingerprint,
      issueCodes: input.issueCodes,
      allowedActions: [CreatorWithdrawalOperationalAction.INSPECT,
        CreatorWithdrawalOperationalAction.ACKNOWLEDGE,
        CreatorWithdrawalOperationalAction.RESOLVE],
      recommendedAction: CreatorWithdrawalOperationalAction.RESOLVE,
      lastRetryCode: input.resultCode,
      lastInspectedAt: new Date(),
    }, $inc: { version: 1 } }, { new: true, runValidators: true, session })
      .select(AUTHORITY).exec();
  }

  failRetry(input: {
    reference: string; retryCount: number; resultCode: string;
    nextRetryAt?: Date;
  }, session: ClientSession) {
    return CreatorWithdrawalReconciliation.findOneAndUpdate({
      reconciliationReference: input.reference,
      status: CreatorWithdrawalReconciliationStatus.IN_PROGRESS,
      retryCount: input.retryCount,
    }, { $set: {
      status: input.nextRetryAt
        ? CreatorWithdrawalReconciliationStatus.RETRY_SCHEDULED
        : CreatorWithdrawalReconciliationStatus.FAILED,
      lastRetryCode: input.resultCode,
      ...(input.nextRetryAt ? { nextRetryAt: input.nextRetryAt } : {}),
    }, $inc: { version: 1 } }, { new: true, runValidators: true, session })
      .select(AUTHORITY).exec();
  }

  updateAfterRepair(input: {
    reference: string; expectedFingerprint: string;
    classification: CreatorWithdrawalOperationalClassification;
    severity: CreatorWithdrawalOperationalSeverity;
    snapshot: Record<string, unknown>; snapshotFingerprint: string;
    issueCodes: string[];
  }, session: ClientSession) {
    return CreatorWithdrawalReconciliation.findOneAndUpdate({
      reconciliationReference: input.reference,
      snapshotFingerprint: input.expectedFingerprint,
      status: { $ne: CreatorWithdrawalReconciliationStatus.RESOLVED },
    }, { $set: {
      classification: input.classification, severity: input.severity,
      snapshot: input.snapshot, snapshotFingerprint: input.snapshotFingerprint,
      issueCodes: input.issueCodes, lastInspectedAt: new Date(),
      allowedActions: [CreatorWithdrawalOperationalAction.INSPECT,
        CreatorWithdrawalOperationalAction.ACKNOWLEDGE,
        CreatorWithdrawalOperationalAction.RESOLVE],
      recommendedAction: CreatorWithdrawalOperationalAction.RESOLVE,
    }, $inc: { version: 1 } }, { new: true, runValidators: true, session })
      .select(AUTHORITY).exec();
  }

  transitionStatus(input: {
    reference: string; expectedStatuses: CreatorWithdrawalReconciliationStatus[];
    status: CreatorWithdrawalReconciliationStatus; actorId: Types.ObjectId;
    code: string; note?: string; at: Date;
  }, session: ClientSession) {
    const acknowledged = input.status ===
      CreatorWithdrawalReconciliationStatus.ACKNOWLEDGED;
    return CreatorWithdrawalReconciliation.findOneAndUpdate({
      reconciliationReference: input.reference,
      status: { $in: input.expectedStatuses },
    }, { $set: acknowledged ? {
      status: input.status, acknowledgedAt: input.at,
      acknowledgedBy: input.actorId,
    } : {
      status: input.status, resolvedAt: input.at, resolvedBy: input.actorId,
      resolutionCode: input.code, ...(input.note ? { resolutionNote: input.note } : {}),
    }, $unset: { nextRetryAt: 1 }, $inc: { version: 1 } },
    { new: true, runValidators: true, session }).select(AUTHORITY).exec();
  }
}

export const creatorWithdrawalReconciliationRepository =
  new CreatorWithdrawalReconciliationRepository();
