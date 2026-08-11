import { Types } from "mongoose";
import {
  WalletTopUpReconciliation,
  WalletTopUpReconciliationDocument,
} from "../models/walletTopUpReconciliation.model";
import { WalletTopUpReconciliationClassification } from "../enums/financial/walletTopUpReconciliationClassification.enum";
import { WalletTopUpReconciliationStatus } from "../enums/financial/walletTopUpReconciliationStatus.enum";
import { WalletTopUpReconciliationSeverity } from "../enums/financial/walletTopUpReconciliationSeverity.enum";
import { WalletTopUpOperationalAction } from "../enums/financial/walletTopUpOperationalAction.enum";

export interface ReconciliationObservationPersistence {
  reconciliationReference: string;
  reconciliationKey: string;
  topUpRequestId: Types.ObjectId;
  topUpReference: string;
  userId: Types.ObjectId;
  walletId: Types.ObjectId;
  providerFundingId?: Types.ObjectId;
  providerFundingReference?: string;
  classification: WalletTopUpReconciliationClassification;
  status: WalletTopUpReconciliationStatus;
  severity: WalletTopUpReconciliationSeverity;
  detectedIssues: string[];
  detectedAt: Date;
  lastInspectedAt: Date;
  recommendedAction?: WalletTopUpOperationalAction;
  allowedActions: WalletTopUpOperationalAction[];
  maxRetryCount: number;
  snapshot: Record<string, unknown>;
  fingerprint: string;
}

export interface ReconciliationListInput {
  page: number;
  limit: number;
  status?: WalletTopUpReconciliationStatus;
  classification?: WalletTopUpReconciliationClassification;
  severity?: WalletTopUpReconciliationSeverity;
  topUpReference?: string;
  providerFundingReference?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export class WalletTopUpReconciliationRepository {
  findByReference(reference: string) {
    return WalletTopUpReconciliation.findOne({ reconciliationReference: reference })
      .select("+snapshot +fingerprint +reconciliationKey +userId +walletId +providerFundingId +resolvedBy")
      .exec();
  }

  findByTopUpRequestId(topUpRequestId: Types.ObjectId) {
    return WalletTopUpReconciliation.findOne({ topUpRequestId })
      .select("+snapshot +fingerprint +reconciliationKey +userId +walletId +providerFundingId +resolvedBy")
      .exec();
  }

  async upsertObservation(input: ReconciliationObservationPersistence) {
    return WalletTopUpReconciliation.findOneAndUpdate(
      { topUpRequestId: input.topUpRequestId },
      {
        $set: {
          providerFundingId: input.providerFundingId,
          providerFundingReference: input.providerFundingReference,
          classification: input.classification,
          status: input.status,
          severity: input.severity,
          detectedIssues: input.detectedIssues,
          lastInspectedAt: input.lastInspectedAt,
          recommendedAction: input.recommendedAction,
          allowedActions: input.allowedActions,
          snapshot: input.snapshot,
          fingerprint: input.fingerprint,
        },
        $setOnInsert: {
          reconciliationReference: input.reconciliationReference,
          reconciliationKey: input.reconciliationKey,
          topUpRequestId: input.topUpRequestId,
          topUpReference: input.topUpReference,
          userId: input.userId,
          walletId: input.walletId,
          detectedAt: input.detectedAt,
          retryCount: 0,
          maxRetryCount: input.maxRetryCount,
        },
        $inc: { version: 1 },
      },
      { new: true, upsert: true, runValidators: true },
    ).select("+snapshot +fingerprint +reconciliationKey +userId +walletId +providerFundingId +resolvedBy").exec();
  }

  async list(input: ReconciliationListInput) {
    const filter: Record<string, unknown> = {};
    if (input.status) filter.status = input.status;
    if (input.classification) filter.classification = input.classification;
    if (input.severity) filter.severity = input.severity;
    if (input.topUpReference) filter.topUpReference = input.topUpReference;
    if (input.providerFundingReference) filter.providerFundingReference = input.providerFundingReference;
    if (input.dateFrom || input.dateTo) {
      filter.createdAt = {
        ...(input.dateFrom ? { $gte: input.dateFrom } : {}),
        ...(input.dateTo ? { $lte: input.dateTo } : {}),
      };
    }
    const [items, total] = await Promise.all([
      WalletTopUpReconciliation.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit)
        .exec(),
      WalletTopUpReconciliation.countDocuments(filter),
    ]);
    return { items, total };
  }

  beginRetry(input: {
    reconciliationReference: string;
    fingerprint: string;
    classification: WalletTopUpReconciliationClassification;
    retryCount: number;
    at: Date;
    action: WalletTopUpOperationalAction;
  }) {
    return WalletTopUpReconciliation.findOneAndUpdate(
      {
        reconciliationReference: input.reconciliationReference,
        fingerprint: input.fingerprint,
        classification: input.classification,
        retryCount: input.retryCount,
        status: { $in: [WalletTopUpReconciliationStatus.OPEN, WalletTopUpReconciliationStatus.RETRY_SCHEDULED] },
        $expr: { $lt: ["$retryCount", "$maxRetryCount"] },
      },
      {
        $set: {
          status: WalletTopUpReconciliationStatus.IN_PROGRESS,
          lastRetryAt: input.at,
          lastRetryCode: input.action,
        },
        $unset: { nextRetryAt: 1 },
        $inc: { retryCount: 1, version: 1 },
      },
      { new: true, runValidators: true },
    ).select("+snapshot +fingerprint +reconciliationKey +userId +walletId +providerFundingId +resolvedBy").exec();
  }

  completeRetry(input: {
    reconciliationReference: string;
    retryCount: number;
    status: WalletTopUpReconciliationStatus;
    resultCode: string;
    nextRetryAt?: Date;
  }) {
    return WalletTopUpReconciliation.findOneAndUpdate(
      {
        reconciliationReference: input.reconciliationReference,
        status: WalletTopUpReconciliationStatus.IN_PROGRESS,
        retryCount: input.retryCount,
      },
      {
        $set: {
          status: input.status,
          lastRetryCode: input.resultCode,
          ...(input.nextRetryAt ? { nextRetryAt: input.nextRetryAt } : {}),
        },
        $unset: input.nextRetryAt ? {} : { nextRetryAt: 1 },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true },
    ).exec();
  }

  updateResolution(input: {
    reconciliationReference: string;
    fingerprint: string;
    expectedStatuses: WalletTopUpReconciliationStatus[];
    status: WalletTopUpReconciliationStatus;
    action: WalletTopUpOperationalAction;
    code: string;
    note?: string;
    at: Date;
    actorId: Types.ObjectId;
  }) {
    return WalletTopUpReconciliation.findOneAndUpdate(
      {
        reconciliationReference: input.reconciliationReference,
        fingerprint: input.fingerprint,
        status: { $in: input.expectedStatuses },
      },
      {
        $set: {
          status: input.status,
          resolutionAction: input.action,
          resolutionCode: input.code,
          ...(input.note ? { resolutionNote: input.note } : {}),
          resolvedAt: input.at,
          resolvedBy: input.actorId,
        },
        $unset: { nextRetryAt: 1 },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true },
    ).exec();
  }
}

export const walletTopUpReconciliationRepository = new WalletTopUpReconciliationRepository();
