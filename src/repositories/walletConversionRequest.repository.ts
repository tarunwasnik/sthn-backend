import { ClientSession, Types } from "mongoose";

import { WalletConversionRequestStatus } from
  "../enums/financial/walletConversionRequestStatus.enum";
import { WalletConversionRejectionCode } from
  "../enums/financial/walletConversionRejectionCode.enum";
import { SupportedCurrency } from
  "../constants/financial/supportedCurrencies";
import {
  WalletConversionRequest,
  WalletConversionRequestDocument,
} from "../models/walletConversionRequest.model";

type Creation = Pick<WalletConversionRequestDocument,
  "conversionReference" | "conversionKey" | "userId" | "sourceWalletId" |
  "targetWalletId" | "sourceCurrency" | "targetCurrency" | "sourceAmount" |
  "targetAmount" | "fxSnapshotId" | "fxSnapshotReference" | "fxProvider" |
  "fxEffectiveDate" | "rateValue" | "rateScale" | "inverseRateValue" |
  "inverseRateScale" | "sourceMinorUnits" | "targetMinorUnits" |
  "idempotencyKey" | "requestFingerprint" | "requestedAt">;

const authorityFields = "+conversionKey +userId +sourceWalletId +targetWalletId " +
  "+fxSnapshotId +rateValue +rateScale +inverseRateValue +inverseRateScale " +
  "+sourceMinorUnits +targetMinorUnits +idempotencyKey +requestFingerprint " +
  "+decidedBy +providerMetadata +accountingKey +accountingFingerprint " +
  "+accountingTransactionReference +accountingTargetWalletId " +
  "+sourceProjectionReference +targetProjectionReference " +
  "+sourceWalletVersion +targetWalletVersion";
const displayRateFields = "+rateValue +rateScale +inverseRateValue +inverseRateScale";

export class WalletConversionRequestRepository {
  findByReference(reference: string, session?: ClientSession) {
    return WalletConversionRequest.findOne({ conversionReference: reference })
      .select(authorityFields).session(session ?? null).exec();
  }

  findByUserAndReference(userId: Types.ObjectId, reference: string) {
    return WalletConversionRequest.findOne({ userId,
      conversionReference: reference }).select(authorityFields).exec();
  }

  findByUserAndIdempotencyKey(userId: Types.ObjectId, idempotencyKey: string,
    session?: ClientSession) {
    return WalletConversionRequest.findOne({ userId, idempotencyKey })
      .select(authorityFields).session(session ?? null).exec();
  }

  findByKey(conversionKey: string, session?: ClientSession) {
    return WalletConversionRequest.findOne({ conversionKey })
      .select(authorityFields).session(session ?? null).exec();
  }

  async createPending(data: Creation, session: ClientSession) {
    const [created] = await WalletConversionRequest.create([{
      ...data, status: WalletConversionRequestStatus.PENDING,
    }], { session });
    return created;
  }

  approvePending(input: { conversionReference: string; decidedBy: Types.ObjectId;
    decidedAt: Date; session: ClientSession }) {
    return WalletConversionRequest.findOneAndUpdate({
      conversionReference: input.conversionReference,
      status: WalletConversionRequestStatus.PENDING,
    }, { $set: { status: WalletConversionRequestStatus.APPROVED,
      decidedBy: input.decidedBy, decidedAt: input.decidedAt },
      $unset: { rejectionCode: 1, rejectionReason: 1 } },
    { new: true, session: input.session, runValidators: true })
      .select(authorityFields).exec();
  }

  rejectPending(input: { conversionReference: string; decidedBy: Types.ObjectId;
    decidedAt: Date; rejectionCode: WalletConversionRejectionCode;
    rejectionReason?: string; session: ClientSession }) {
    return WalletConversionRequest.findOneAndUpdate({
      conversionReference: input.conversionReference,
      status: WalletConversionRequestStatus.PENDING,
    }, { $set: { status: WalletConversionRequestStatus.REJECTED,
      decidedBy: input.decidedBy, decidedAt: input.decidedAt,
      rejectionCode: input.rejectionCode,
      ...(input.rejectionReason ? { rejectionReason: input.rejectionReason } : {}) },
      $unset: input.rejectionReason ? {} : { rejectionReason: 1 } },
    { new: true, session: input.session, runValidators: true })
      .select(authorityFields).exec();
  }

  synchronizeProviderTerminal(input: { conversionReference: string;
    providerRequestReference: string; providerExecutionReference: string;
    providerStatus: "SUCCEEDED" | "FAILED";
    providerOutcome: "SUCCESS" | "FAILURE"; providerProcessingAt: Date;
    providerCompletedAt: Date; providerFailureCode?: string;
    providerMetadata: { provider: string; responseCode: string };
    session: ClientSession }) {
    return WalletConversionRequest.findOneAndUpdate({
      conversionReference: input.conversionReference,
      status: WalletConversionRequestStatus.APPROVED,
      providerRequestReference: { $exists: false },
      providerExecutionReference: { $exists: false },
      providerStatus: { $exists: false },
    }, { $set: {
      providerRequestReference: input.providerRequestReference,
      providerExecutionReference: input.providerExecutionReference,
      providerStatus: input.providerStatus,
      providerOutcome: input.providerOutcome,
      providerProcessingAt: input.providerProcessingAt,
      providerCompletedAt: input.providerCompletedAt,
      ...(input.providerFailureCode
        ? { providerFailureCode: input.providerFailureCode } : {}),
      providerMetadata: input.providerMetadata,
    } }, { new: true, runValidators: true, session: input.session })
      .select(authorityFields).exec();
  }

  completeApprovedWithAccounting(input: { conversionReference: string;
    providerExecutionReference: string; accountingReference: string;
    accountingKey: string; accountingFingerprint: string;
    accountingTransactionReference: string;
    accountingTargetWalletId: Types.ObjectId;
    sourceProjectionReference: string; targetProjectionReference: string;
    sourceWalletVersion: number; targetWalletVersion: number;
    completedAt: Date; session: ClientSession }) {
    return WalletConversionRequest.findOneAndUpdate({
      conversionReference: input.conversionReference,
      status: WalletConversionRequestStatus.APPROVED,
      providerExecutionReference: input.providerExecutionReference,
      providerStatus: "SUCCEEDED", providerOutcome: "SUCCESS",
      accountingReference: { $exists: false },
      accountingTransactionReference: { $exists: false },
      completedAt: { $exists: false }, failedAt: { $exists: false },
    }, { $set: {
      status: WalletConversionRequestStatus.COMPLETED,
      accountingReference: input.accountingReference,
      accountingKey: input.accountingKey,
      accountingFingerprint: input.accountingFingerprint,
      accountingTransactionReference: input.accountingTransactionReference,
      accountingTargetWalletId: input.accountingTargetWalletId,
      sourceProjectionReference: input.sourceProjectionReference,
      targetProjectionReference: input.targetProjectionReference,
      sourceWalletVersion: input.sourceWalletVersion,
      targetWalletVersion: input.targetWalletVersion,
      completedAt: input.completedAt,
    } }, { new: true, runValidators: true, session: input.session })
      .select(authorityFields).exec();
  }

  failApprovedFromProvider(input: { conversionReference: string;
    providerExecutionReference: string; failedAt: Date;
    session: ClientSession }) {
    return WalletConversionRequest.findOneAndUpdate({
      conversionReference: input.conversionReference,
      status: WalletConversionRequestStatus.APPROVED,
      providerExecutionReference: input.providerExecutionReference,
      providerStatus: "FAILED", providerOutcome: "FAILURE",
      accountingReference: { $exists: false },
      accountingTransactionReference: { $exists: false },
      completedAt: { $exists: false }, failedAt: { $exists: false },
    }, { $set: { status: WalletConversionRequestStatus.FAILED,
      failedAt: input.failedAt } },
    { new: true, runValidators: true, session: input.session })
      .select(authorityFields).exec();
  }

  retryCompleteCommittedAccounting(input: { conversionReference: string;
    providerExecutionReference: string; accountingReference: string;
    accountingTransactionReference: string; completedAt: Date;
    session: ClientSession }) {
    return WalletConversionRequest.findOneAndUpdate({
      conversionReference: input.conversionReference,
      status: WalletConversionRequestStatus.APPROVED,
      providerExecutionReference: input.providerExecutionReference,
      providerStatus: "SUCCEEDED", providerOutcome: "SUCCESS",
      accountingReference: input.accountingReference,
      accountingTransactionReference: input.accountingTransactionReference,
      completedAt: input.completedAt, failedAt: { $exists: false },
    }, { $set: { status: WalletConversionRequestStatus.COMPLETED } },
    { new: true, runValidators: true, session: input.session })
      .select(authorityFields).exec();
  }

  restoreLedgerReferences(input: { conversionReference: string;
    accountingReference: string; accountingTransactionReference: string;
    session: ClientSession }) {
    return WalletConversionRequest.findOneAndUpdate({
      conversionReference: input.conversionReference,
      status: WalletConversionRequestStatus.COMPLETED,
      accountingReference: input.accountingReference,
      accountingTransactionReference: { $exists: false },
    }, { $set: { accountingTransactionReference:
      input.accountingTransactionReference } },
    { new: true, runValidators: true, session: input.session })
      .select(authorityFields).exec();
  }

  restoreProjectionReferences(input: { conversionReference: string;
    accountingReference: string; sourceProjectionReference: string;
    targetProjectionReference: string; session: ClientSession }) {
    return WalletConversionRequest.findOneAndUpdate({
      conversionReference: input.conversionReference,
      status: WalletConversionRequestStatus.COMPLETED,
      accountingReference: input.accountingReference,
      $or: [{ sourceProjectionReference: { $exists: false } },
        { targetProjectionReference: { $exists: false } }],
    }, { $set: { sourceProjectionReference: input.sourceProjectionReference,
      targetProjectionReference: input.targetProjectionReference } },
    { new: true, runValidators: true, session: input.session })
      .select(authorityFields).exec();
  }

  restoreAccountingReferences(input: { conversionReference: string;
    accountingReference: string; accountingKey: string;
    accountingFingerprint: string; accountingTargetWalletId: Types.ObjectId;
    sourceWalletVersion: number; targetWalletVersion: number;
    completedAt: Date; session: ClientSession }) {
    return WalletConversionRequest.findOneAndUpdate({
      conversionReference: input.conversionReference,
      status: WalletConversionRequestStatus.COMPLETED,
      $or: [{ accountingReference: { $exists: false } },
        { accountingKey: { $exists: false } },
        { accountingFingerprint: { $exists: false } },
        { accountingTargetWalletId: { $exists: false } },
        { sourceWalletVersion: { $exists: false } },
        { targetWalletVersion: { $exists: false } },
        { completedAt: { $exists: false } }],
    }, { $set: { accountingReference: input.accountingReference,
      accountingKey: input.accountingKey,
      accountingFingerprint: input.accountingFingerprint,
      accountingTargetWalletId: input.accountingTargetWalletId,
      sourceWalletVersion: input.sourceWalletVersion,
      targetWalletVersion: input.targetWalletVersion,
      completedAt: input.completedAt } },
    { new: true, runValidators: true, session: input.session })
      .select(authorityFields).exec();
  }

  listByUser(userId: Types.ObjectId, page: number, limit: number) {
    return WalletConversionRequest.find({ userId }).select(displayRateFields)
      .sort({ requestedAt: -1, _id: -1 }).skip((page - 1) * limit)
      .limit(limit).exec();
  }

  findPendingByUser(userId: Types.ObjectId, limit = 100) {
    return WalletConversionRequest.find({ userId,
      status: WalletConversionRequestStatus.PENDING })
      .select(displayRateFields).sort({ requestedAt: -1, _id: -1 })
      .limit(limit).exec();
  }

  listForAdmin(filter: { status?: WalletConversionRequestStatus;
    sourceCurrency?: SupportedCurrency; targetCurrency?: SupportedCurrency;
    conversionReference?: string; requestedFrom?: Date; requestedTo?: Date },
    page: number, limit: number) {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.sourceCurrency) query.sourceCurrency = filter.sourceCurrency;
    if (filter.targetCurrency) query.targetCurrency = filter.targetCurrency;
    if (filter.conversionReference) {
      query.conversionReference = filter.conversionReference;
    }
    if (filter.requestedFrom || filter.requestedTo) {
      query.requestedAt = {
        ...(filter.requestedFrom ? { $gte: filter.requestedFrom } : {}),
        ...(filter.requestedTo ? { $lte: filter.requestedTo } : {}),
      };
    }
    return WalletConversionRequest.find(query).select(displayRateFields)
      .sort({ requestedAt: 1, _id: 1 }).skip((page - 1) * limit)
      .limit(limit).exec();
  }
}

export const walletConversionRequestRepository =
  new WalletConversionRequestRepository();
