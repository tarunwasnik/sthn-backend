import { ClientSession } from "mongoose";

import { InternalWalletConversionProviderRequestStatus } from
  "../../enums/financial/internalWalletConversionProviderRequestStatus.enum";
import { WalletConversionProviderOutcome } from
  "../../enums/financial/walletConversionProviderOutcome.enum";
import { InternalWalletConversionProviderRequest,
  InternalWalletConversionProviderRequestDocument } from
  "../../models/internalProvider/internalWalletConversionProviderRequest.model";

type Creation = Pick<InternalWalletConversionProviderRequestDocument,
  "providerRequestReference" | "providerRequestKey" |
  "conversionReference" | "userId" | "sourceWalletId" | "targetWalletId" |
  "sourceCurrency" | "targetCurrency" | "sourceAmount" | "targetAmount" |
  "fxSnapshotReference" | "fxProvider" | "fxEffectiveDate" | "provider" |
  "providerExecutionReference" | "providerFingerprint" |
  "executionFingerprint">;

const AUTHORITY_FIELDS = "+providerRequestKey +userId +sourceWalletId " +
  "+targetWalletId +providerFingerprint +executionFingerprint " +
  "+providerMetadata +execution +payloads +failureReason";

export class InternalWalletConversionProviderRequestRepository {
  async createInitialized(data: Creation, session: ClientSession) {
    const [created] = await InternalWalletConversionProviderRequest.create([{
      ...data,
      providerStatus:
        InternalWalletConversionProviderRequestStatus.INITIALIZED,
      isTerminal: false, version: 0,
    }], { session });
    return created;
  }

  findByConversion(conversionReference: string, session?: ClientSession) {
    return InternalWalletConversionProviderRequest.findOne({
      conversionReference,
    }).select(AUTHORITY_FIELDS).session(session ?? null).exec();
  }

  findByReference(providerRequestReference: string,
    session?: ClientSession) {
    return InternalWalletConversionProviderRequest.findOne({
      providerRequestReference,
    }).select(AUTHORITY_FIELDS).session(session ?? null).exec();
  }

  findByKey(providerRequestKey: string, session?: ClientSession) {
    return InternalWalletConversionProviderRequest.findOne({
      providerRequestKey,
    }).select(AUTHORITY_FIELDS).session(session ?? null).exec();
  }

  markProcessing(input: { providerRequestReference: string;
    providerFingerprint: string; executionFingerprint: string;
    processingAt: Date; providerMetadata: Record<string, unknown>;
    execution: Record<string, unknown>; requestPayload: Record<string, unknown>;
    expectedVersion: number }, session: ClientSession) {
    return InternalWalletConversionProviderRequest.findOneAndUpdate({
      providerRequestReference: input.providerRequestReference,
      providerFingerprint: input.providerFingerprint,
      executionFingerprint: input.executionFingerprint,
      providerStatus:
        InternalWalletConversionProviderRequestStatus.INITIALIZED,
      isTerminal: false, version: input.expectedVersion,
    }, { $set: {
      providerStatus:
        InternalWalletConversionProviderRequestStatus.PROCESSING,
      processingAt: input.processingAt,
      providerMetadata: input.providerMetadata,
      execution: input.execution,
      payloads: { request: input.requestPayload, response: null },
    }, $inc: { version: 1 } },
    { new: true, runValidators: true, session })
      .select(AUTHORITY_FIELDS).exec();
  }

  markTerminal(input: { providerRequestReference: string;
    executionFingerprint: string;
    status: InternalWalletConversionProviderRequestStatus.SUCCEEDED |
      InternalWalletConversionProviderRequestStatus.FAILED;
    outcome: WalletConversionProviderOutcome; completedAt: Date;
    responseCode: string; failureCode?: string; failureReason?: string;
    responsePayload: Record<string, unknown>; processingLatencyMs: number;
    expectedVersion: number }, session: ClientSession) {
    return InternalWalletConversionProviderRequest.findOneAndUpdate({
      providerRequestReference: input.providerRequestReference,
      executionFingerprint: input.executionFingerprint,
      providerStatus:
        InternalWalletConversionProviderRequestStatus.PROCESSING,
      isTerminal: false, version: input.expectedVersion,
    }, { $set: {
      providerStatus: input.status, providerOutcome: input.outcome,
      completedAt: input.completedAt, responseCode: input.responseCode,
      ...(input.failureCode ? { failureCode: input.failureCode } : {}),
      ...(input.failureReason ? { failureReason: input.failureReason } : {}),
      "payloads.response": input.responsePayload,
      "execution.processingLatencyMs": input.processingLatencyMs,
      isTerminal: true,
    }, $inc: { version: 1 } },
    { new: true, runValidators: true, session })
      .select(AUTHORITY_FIELDS).exec();
  }
}

export const internalWalletConversionProviderRequestRepository =
  new InternalWalletConversionProviderRequestRepository();
