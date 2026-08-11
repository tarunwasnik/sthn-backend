import { ClientSession } from "mongoose";

import { InternalWithdrawalProviderRequestStatus } from
  "../../enums/financial/internalWithdrawalProviderRequestStatus.enum";
import {
  InternalWithdrawalProviderRequest,
  InternalWithdrawalProviderRequestDocument,
} from "../../models/internalProvider/internalWithdrawalProviderRequest.model";

const AUTHORITY_FIELDS =
  "+providerRequestKey +providerFingerprint +executionFingerprint";

export class InternalWithdrawalProviderRequestRepository {
  async create(
    data: Partial<InternalWithdrawalProviderRequestDocument>,
    session: ClientSession,
  ) {
    const [request] = await InternalWithdrawalProviderRequest.create([{
      ...data,
      providerStatus: InternalWithdrawalProviderRequestStatus.CREATED,
      version: 0,
    }], { session });
    return request;
  }

  findByReference(
    providerRequestReference: string,
    session?: ClientSession,
  ) {
    return InternalWithdrawalProviderRequest.findOne({
      providerRequestReference,
    }).select(AUTHORITY_FIELDS).session(session ?? null).exec();
  }

  findByKey(providerRequestKey: string, session?: ClientSession) {
    return InternalWithdrawalProviderRequest.findOne({ providerRequestKey })
      .select(AUTHORITY_FIELDS).session(session ?? null).exec();
  }

  findByWithdrawal(withdrawalReference: string, session?: ClientSession) {
    return InternalWithdrawalProviderRequest.findOne({ withdrawalReference })
      .select(AUTHORITY_FIELDS).session(session ?? null).exec();
  }

  initialize(
    providerRequestReference: string,
    providerFingerprint: string,
    providerReference: string,
    expectedVersion: number,
    session: ClientSession,
  ) {
    return InternalWithdrawalProviderRequest.findOneAndUpdate({
      providerRequestReference,
      providerFingerprint,
      providerStatus: InternalWithdrawalProviderRequestStatus.CREATED,
      providerReference,
      version: expectedVersion,
    }, {
      $set: {
        providerStatus: InternalWithdrawalProviderRequestStatus.INITIALIZED,
      },
      $inc: { version: 1 },
    }, { new: true, runValidators: true, session })
      .select(AUTHORITY_FIELDS).exec();
  }

  markProcessing(
    input: {
      providerRequestReference: string;
      providerFingerprint: string;
      executionReference: string;
      executionFingerprint: string;
      processingAt: Date;
      providerMetadata: Record<string, unknown>;
      execution: Record<string, unknown>;
      requestPayload: Record<string, unknown>;
      expectedVersion: number;
    },
    session: ClientSession,
  ) {
    return InternalWithdrawalProviderRequest.findOneAndUpdate({
      providerRequestReference: input.providerRequestReference,
      providerFingerprint: input.providerFingerprint,
      providerStatus: InternalWithdrawalProviderRequestStatus.INITIALIZED,
      isTerminal: false,
      executionReference: { $exists: false },
      executionFingerprint: { $exists: false },
      version: input.expectedVersion,
    }, {
      $set: {
        providerStatus:
          InternalWithdrawalProviderRequestStatus.PROCESSING,
        executionReference: input.executionReference,
        executionFingerprint: input.executionFingerprint,
        providerMetadata: input.providerMetadata,
        execution: input.execution,
        payloads: { request: input.requestPayload, response: null },
        processingAt: input.processingAt,
        isTerminal: false,
      },
      $inc: { version: 1 },
    }, { new: true, runValidators: true, session })
      .select(AUTHORITY_FIELDS).exec();
  }

  markTerminal(
    input: {
      providerRequestReference: string;
      executionFingerprint: string;
      status:
        | InternalWithdrawalProviderRequestStatus.SUCCEEDED
        | InternalWithdrawalProviderRequestStatus.FAILED;
      terminalAt: Date;
      responseCode: string;
      responseMessage?: string;
      responsePayload: Record<string, unknown>;
      processingLatencyMs: number;
      expectedVersion: number;
    },
    session: ClientSession,
  ) {
    const succeeded = input.status ===
      InternalWithdrawalProviderRequestStatus.SUCCEEDED;
    return InternalWithdrawalProviderRequest.findOneAndUpdate({
      providerRequestReference: input.providerRequestReference,
      executionFingerprint: input.executionFingerprint,
      providerStatus: InternalWithdrawalProviderRequestStatus.PROCESSING,
      isTerminal: false,
      version: input.expectedVersion,
    }, {
      $set: {
        providerStatus: input.status,
        isTerminal: true,
        terminalResult: {
          outcome: input.status,
          code: input.responseCode,
          ...(input.responseMessage
            ? { message: input.responseMessage }
            : {}),
        },
        "payloads.response": input.responsePayload,
        "execution.processingLatencyMs": input.processingLatencyMs,
        ...(succeeded
          ? { succeededAt: input.terminalAt }
          : { failedAt: input.terminalAt }),
      },
      $inc: { version: 1 },
    }, { new: true, runValidators: true, session })
      .select(AUTHORITY_FIELDS).exec();
  }
}

export const internalWithdrawalProviderRequestRepository =
  new InternalWithdrawalProviderRequestRepository();
