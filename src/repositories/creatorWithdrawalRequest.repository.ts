import { ClientSession, Types } from "mongoose";

import { CreatorWithdrawalRequestStatus } from "../enums/financial/creatorWithdrawalRequestStatus.enum";
import {
  CreatorWithdrawalRequest,
  CreatorWithdrawalRequestDocument,
} from "../models/creatorWithdrawalRequest.model";

const AUTHORITY_FIELDS =
  "+withdrawalKey +requestFingerprint +ledgerTransactionReference " +
  "+ledgerEntryIds +isActiveObligation +finalizationOutcome " +
  "+finalizationKey +finalizationTransactionId " +
  "+finalizationLedgerEntryIds +finalizationProjectionOperationId " +
  "+finalizationProjectionOperationReference +finalizationFingerprint " +
  "+providerTerminalReference +providerFailureCode";

export class CreatorWithdrawalRequestRepository {
  async createPending(
    data: Partial<CreatorWithdrawalRequestDocument>,
    session: ClientSession,
  ) {
    const [request] = await CreatorWithdrawalRequest.create([{
      ...data,
      status: CreatorWithdrawalRequestStatus.PENDING,
      reservedAmount: 0,
      isActiveObligation: true,
      version: 0,
    }], { session });
    return request;
  }

  findByKey(withdrawalKey: string, session?: ClientSession) {
    return CreatorWithdrawalRequest.findOne({ withdrawalKey })
      .select(AUTHORITY_FIELDS).session(session ?? null).exec();
  }

  findByReference(withdrawalReference: string, session?: ClientSession) {
    return CreatorWithdrawalRequest.findOne({ withdrawalReference })
      .select(AUTHORITY_FIELDS).session(session ?? null).exec();
  }

  findActiveByCreatorUser(
    creatorUserId: Types.ObjectId,
    session?: ClientSession,
  ) {
    return CreatorWithdrawalRequest.findOne({
      creatorUserId,
      isActiveObligation: true,
    }).select(AUTHORITY_FIELDS).session(session ?? null).exec();
  }

  reserve(
    input: {
      requestId: Types.ObjectId;
      withdrawalKey: string;
      requestFingerprint: string;
      amount: number;
      ledgerTransactionReference: string;
      ledgerEntryIds: Types.ObjectId[];
      projectionReference: string;
      reservedAt: Date;
      expectedVersion: number;
    },
    session: ClientSession,
  ) {
    return CreatorWithdrawalRequest.findOneAndUpdate({
      _id: input.requestId,
      withdrawalKey: input.withdrawalKey,
      requestFingerprint: input.requestFingerprint,
      amount: input.amount,
      reservedAmount: 0,
      status: CreatorWithdrawalRequestStatus.PENDING,
      ledgerTransactionReference: { $exists: false },
      projectionReference: { $exists: false },
      ledgerEntryIds: { $size: 0 },
      isActiveObligation: true,
      version: input.expectedVersion,
    }, {
      $set: {
        reservedAmount: input.amount,
        status: CreatorWithdrawalRequestStatus.RESERVED,
        ledgerTransactionReference: input.ledgerTransactionReference,
        ledgerEntryIds: input.ledgerEntryIds,
        projectionReference: input.projectionReference,
        reservedAt: input.reservedAt,
      },
      $inc: { version: 1 },
    }, { new: true, runValidators: true, session })
      .select(AUTHORITY_FIELDS).exec();
  }

  linkProviderInitialization(
    input: {
      requestId: Types.ObjectId;
      withdrawalReference: string;
      providerRequestReference: string;
      expectedVersion: number;
    },
    session: ClientSession,
  ) {
    return CreatorWithdrawalRequest.findOneAndUpdate({
      _id: input.requestId,
      withdrawalReference: input.withdrawalReference,
      status: CreatorWithdrawalRequestStatus.RESERVED,
      reservedAmount: { $gt: 0 },
      providerRequestReference: { $exists: false },
      version: input.expectedVersion,
    }, {
      $set: {
        providerRequestReference: input.providerRequestReference,
      },
      $inc: { version: 1 },
    }, { new: true, runValidators: true, session })
      .select(AUTHORITY_FIELDS).exec();
  }

  synchronizeProviderTerminal(
    input: {
      requestId: Types.ObjectId;
      withdrawalReference: string;
      providerRequestReference: string;
      providerTerminalStatus: "SUCCEEDED" | "FAILED";
      providerProcessingAt: Date;
      providerSucceededAt?: Date;
      providerFailedAt?: Date;
      providerExecutionMetadata: {
        provider: string;
        providerRequestReference: string;
        providerReference: string;
        executionReference: string;
        responseCode: string;
        failureCode?: string;
      };
      expectedVersion: number;
    },
    session: ClientSession,
  ) {
    return CreatorWithdrawalRequest.findOneAndUpdate({
      _id: input.requestId,
      withdrawalReference: input.withdrawalReference,
      status: CreatorWithdrawalRequestStatus.RESERVED,
      reservedAmount: { $gt: 0 },
      providerRequestReference: input.providerRequestReference,
      providerTerminalStatus: { $exists: false },
      version: input.expectedVersion,
    }, {
      $set: {
        providerTerminalStatus: input.providerTerminalStatus,
        providerProcessingAt: input.providerProcessingAt,
        providerSucceededAt: input.providerSucceededAt,
        providerFailedAt: input.providerFailedAt,
        providerExecutionMetadata: input.providerExecutionMetadata,
      },
      $inc: { version: 1 },
    }, { new: true, runValidators: true, session })
      .select(AUTHORITY_FIELDS).exec();
  }

  claimFinalizationIdentity(
    input: {
      requestId: Types.ObjectId;
      withdrawalReference: string;
      providerRequestReference: string;
      providerTerminalStatus: "SUCCEEDED" | "FAILED";
      finalizationOutcome: "COMPLETED" | "FAILED";
      finalizationReference: string;
      finalizationKey: string;
      finalizationTransactionId: string;
      finalizationProjectionOperationReference: string;
      finalizationFingerprint: string;
      providerTerminalReference: string;
      providerFailureCode?: string;
      expectedVersion: number;
    },
    session: ClientSession,
  ) {
    return CreatorWithdrawalRequest.findOneAndUpdate({
      _id: input.requestId,
      withdrawalReference: input.withdrawalReference,
      status: CreatorWithdrawalRequestStatus.RESERVED,
      reservedAmount: { $gt: 0 },
      providerRequestReference: input.providerRequestReference,
      providerTerminalStatus: input.providerTerminalStatus,
      finalizationReference: { $exists: false },
      finalizationKey: { $exists: false },
      finalizationTransactionId: { $exists: false },
      finalizationLedgerEntryIds: { $size: 0 },
      finalizationProjectionOperationId: { $exists: false },
      finalizationFingerprint: { $exists: false },
      version: input.expectedVersion,
    }, {
      $set: {
        finalizationOutcome: input.finalizationOutcome,
        finalizationReference: input.finalizationReference,
        finalizationKey: input.finalizationKey,
        finalizationTransactionId: input.finalizationTransactionId,
        finalizationProjectionOperationReference:
          input.finalizationProjectionOperationReference,
        finalizationFingerprint: input.finalizationFingerprint,
        providerTerminalReference: input.providerTerminalReference,
        providerFailureCode: input.providerFailureCode,
      },
      $inc: { version: 1 },
    }, { new: true, runValidators: true, session })
      .select(AUTHORITY_FIELDS).exec();
  }

  finalizeClaimed(
    input: {
      requestId: Types.ObjectId;
      withdrawalReference: string;
      finalizationKey: string;
      finalizationFingerprint: string;
      finalizationOutcome: "COMPLETED" | "FAILED";
      finalizationLedgerEntryIds: Types.ObjectId[];
      finalizationProjectionOperationId: Types.ObjectId;
      finalizationProjectionOperationReference: string;
      terminalAt: Date;
      expectedVersion: number;
    },
    session: ClientSession,
  ) {
    const completed = input.finalizationOutcome === "COMPLETED";
    return CreatorWithdrawalRequest.findOneAndUpdate({
      _id: input.requestId,
      withdrawalReference: input.withdrawalReference,
      status: CreatorWithdrawalRequestStatus.RESERVED,
      reservedAmount: { $gt: 0 },
      finalizationKey: input.finalizationKey,
      finalizationFingerprint: input.finalizationFingerprint,
      finalizationOutcome: input.finalizationOutcome,
      finalizationLedgerEntryIds: { $size: 0 },
      finalizationProjectionOperationId: { $exists: false },
      version: input.expectedVersion,
    }, {
      $set: {
        status: completed
          ? CreatorWithdrawalRequestStatus.COMPLETED
          : CreatorWithdrawalRequestStatus.FAILED,
        reservedAmount: 0,
        isActiveObligation: false,
        finalizationLedgerEntryIds: input.finalizationLedgerEntryIds,
        finalizationProjectionOperationId:
          input.finalizationProjectionOperationId,
        finalizationProjectionOperationReference:
          input.finalizationProjectionOperationReference,
        ...(completed
          ? { completedAt: input.terminalAt }
          : { failedAt: input.terminalAt }),
      },
      $inc: { version: 1 },
    }, { new: true, runValidators: true, session })
      .select(AUTHORITY_FIELDS).exec();
  }

  restoreFinalizationLinks(
    input: {
      requestId: Types.ObjectId;
      withdrawalReference: string;
      status: "COMPLETED" | "FAILED";
      providerRequestReference: string;
      providerTerminalStatus: "SUCCEEDED" | "FAILED";
      missingFields: string[];
      values: {
        finalizationOutcome: "COMPLETED" | "FAILED";
        finalizationReference: string;
        finalizationKey: string;
        finalizationTransactionId: string;
        finalizationLedgerEntryIds: Types.ObjectId[];
        finalizationProjectionOperationId: Types.ObjectId;
        finalizationProjectionOperationReference: string;
        finalizationFingerprint: string;
        providerTerminalReference: string;
      };
      expectedVersion: number;
    },
    session: ClientSession,
  ) {
    const allowed = new Set(Object.keys(input.values));
    if (!input.missingFields.length ||
      input.missingFields.some((field) => !allowed.has(field))) return null;
    const filter: Record<string, unknown> = {
      _id: input.requestId,
      withdrawalReference: input.withdrawalReference,
      status: input.status,
      reservedAmount: 0,
      providerRequestReference: input.providerRequestReference,
      providerTerminalStatus: input.providerTerminalStatus,
      version: input.expectedVersion,
    };
    const set: Record<string, unknown> = {};
    for (const field of input.missingFields) {
      filter[field] = field === "finalizationLedgerEntryIds"
        ? { $size: 0 } : { $exists: false };
      set[field] = input.values[field as keyof typeof input.values];
    }
    return CreatorWithdrawalRequest.findOneAndUpdate(filter, {
      $set: set, $inc: { version: 1 },
    }, { new: true, runValidators: true, session })
      .select(AUTHORITY_FIELDS).exec();
  }
}

export const creatorWithdrawalRequestRepository =
  new CreatorWithdrawalRequestRepository();
