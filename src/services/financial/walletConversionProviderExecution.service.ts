import mongoose, { ClientSession, Types } from "mongoose";

import { ProviderEntityType, ProviderEventType, ProviderOperation,
  ProviderSimulationMode } from "../../constants/internalProvider";
import { toWalletConversionProviderExecutionResponseDto } from
  "../../dtos/wallet/walletConversionProviderExecution.response.dto";
import { InternalWalletConversionProviderRequestStatus } from
  "../../enums/financial/internalWalletConversionProviderRequestStatus.enum";
import { WalletConversionAuditAction } from
  "../../enums/financial/walletConversionAuditAction.enum";
import { WalletConversionDecision } from
  "../../enums/financial/walletConversionDecision.enum";
import { WalletConversionProviderOutcome } from
  "../../enums/financial/walletConversionProviderOutcome.enum";
import { WalletConversionRequestStatus } from
  "../../enums/financial/walletConversionRequestStatus.enum";
import { WalletConversionProviderExecutionError,
  WalletConversionProviderExecutionErrorCode } from
  "../../errors/financial/WalletConversionProviderExecutionError";
import { InternalWalletConversionProviderRequestDocument } from
  "../../models/internalProvider/internalWalletConversionProviderRequest.model";
import { WalletConversionAudit } from
  "../../models/walletConversionAudit.model";
import { WalletConversionRequestDocument } from
  "../../models/walletConversionRequest.model";
import InternalProviderEventRepository from
  "../../repositories/internalProvider/internalProviderEvent.repository";
import { internalWalletConversionProviderRequestRepository } from
  "../../repositories/internalProvider/internalWalletConversionProviderRequest.repository";
import { walletConversionAuditRepository } from
  "../../repositories/walletConversionAudit.repository";
import { walletConversionRequestRepository } from
  "../../repositories/walletConversionRequest.repository";
import { createIdempotencyFingerprint } from
  "../../utils/financial/idempotency.util";
import { hasReferenceType } from "../../utils/financial/reference.util";
import { deriveWalletConversionProviderIdentity,
  INTERNAL_WALLET_CONVERSION_PROVIDER } from
  "../../utils/financial/walletConversionProviderIdentity.util";
import ProviderEventService from
  "../internalProvider/events/providerEvent.service";
import { providerSimulatorService, SimulateWalletConversionProviderInput,
  SimulateWalletConversionProviderResult } from
  "../providerSimulator/providerSimulator.service";
import { WalletConversionRequestService, walletConversionRequestService } from
  "./walletConversionRequest.service";

export type WalletConversionProviderExecutionStage =
  | "AFTER_AUTHORITY"
  | "AFTER_PROCESSING"
  | "AFTER_EVENT_CREATION"
  | "AFTER_TERMINAL_STATE"
  | "BEFORE_REQUEST_SYNCHRONIZATION"
  | "BEFORE_AUDIT"
  | "BEFORE_COMMIT";

export interface ExecuteWalletConversionProviderInput {
  adminUserId: string;
  conversionReference: string;
  outcome: unknown;
  failureCode?: unknown;
  failureReason?: unknown;
}

type Identity = ReturnType<typeof deriveWalletConversionProviderIdentity>;
type Executor = (input: SimulateWalletConversionProviderInput) =>
  SimulateWalletConversionProviderResult;

interface Options {
  now?: () => Date;
  failureInjector?: (stage: WalletConversionProviderExecutionStage) =>
    void | Promise<void>;
  executor?: Executor;
}

const isTransient = (error: unknown) => {
  const value = error as { code?: number;
    hasErrorLabel?: (label: string) => boolean };
  return value?.code === 112 || value?.code === 251 ||
    value?.hasErrorLabel?.("TransientTransactionError") === true ||
    value?.hasErrorLabel?.("UnknownTransactionCommitResult") === true;
};

export class WalletConversionProviderExecutionService {
  private readonly now: () => Date;
  private readonly executeProvider: Executor;

  constructor(
    private readonly requestService: WalletConversionRequestService =
      walletConversionRequestService,
    private readonly options: Options = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.executeProvider = options.executor ?? ((input) =>
      providerSimulatorService.simulateWalletConversionProvider(input));
  }

  private fail(message: string,
    code: WalletConversionProviderExecutionErrorCode,
    cause?: unknown): never {
    throw new WalletConversionProviderExecutionError(message, code, { cause });
  }

  private async inject(stage: WalletConversionProviderExecutionStage) {
    await this.options.failureInjector?.(stage);
  }

  private normalize(input: ExecuteWalletConversionProviderInput) {
    if (!Types.ObjectId.isValid(input.adminUserId)) {
      this.fail("Admin identity is invalid.",
        "WALLET_CONVERSION_PROVIDER_UNAUTHORIZED");
    }
    if (typeof input.conversionReference !== "string" ||
      !hasReferenceType(input.conversionReference,
        "WALLET_CONVERSION") ||
      !Object.values(WalletConversionProviderOutcome).includes(
        input.outcome as WalletConversionProviderOutcome)) {
      this.fail("Wallet conversion provider execution input is invalid.",
        "WALLET_CONVERSION_PROVIDER_INVALID_INPUT");
    }
    const outcome = input.outcome as WalletConversionProviderOutcome;
    const failureCode = input.failureCode === undefined ? undefined :
      typeof input.failureCode === "string" ? input.failureCode.trim() : "";
    const failureReason = input.failureReason === undefined ? undefined :
      typeof input.failureReason === "string" ? input.failureReason.trim() : "";
    if ((failureCode !== undefined &&
      !/^[A-Z][A-Z0-9_]{0,63}$/.test(failureCode)) ||
      (failureReason !== undefined &&
        (!failureReason || failureReason.length > 500)) ||
      (outcome === WalletConversionProviderOutcome.SUCCESS &&
        (failureCode !== undefined || failureReason !== undefined))) {
      this.fail("Wallet conversion provider failure input is invalid.",
        "WALLET_CONVERSION_PROVIDER_INVALID_INPUT");
    }
    return { adminUserId: new Types.ObjectId(input.adminUserId),
      conversionReference: input.conversionReference.trim(), outcome,
      failureCode, failureReason };
  }

  private identity(request: WalletConversionRequestDocument) {
    return deriveWalletConversionProviderIdentity({
      conversionReference: request.conversionReference,
      userId: request.userId, sourceWalletId: request.sourceWalletId,
      targetWalletId: request.targetWalletId,
      sourceCurrency: request.sourceCurrency,
      targetCurrency: request.targetCurrency,
      sourceAmount: request.sourceAmount, targetAmount: request.targetAmount,
      fxSnapshotReference: request.fxSnapshotReference,
      fxProvider: request.fxProvider, fxEffectiveDate: request.fxEffectiveDate,
    });
  }

  private async resolveApproved(conversionReference: string,
    session?: ClientSession, allowAccountingTerminal = false) {
    const request = await walletConversionRequestRepository.findByReference(
      conversionReference, session);
    if (!request) this.fail("Wallet conversion request was not found.",
      "WALLET_CONVERSION_PROVIDER_REQUEST_NOT_FOUND");
    const allowedStatuses = allowAccountingTerminal
      ? [WalletConversionRequestStatus.APPROVED,
        WalletConversionRequestStatus.COMPLETED,
        WalletConversionRequestStatus.FAILED]
      : [WalletConversionRequestStatus.APPROVED];
    if (!allowedStatuses.includes(request.status)) {
      this.fail("Only an approved Wallet conversion request may execute.",
        "WALLET_CONVERSION_PROVIDER_REQUEST_NOT_APPROVED");
    }
    try {
      await this.requestService.validateStoredAuthority(request, {
        checkSourceBalance: false, requireSnapshotEligible: false,
      });
    } catch (error) {
      this.fail("Approved Wallet conversion identity conflicts.",
        "WALLET_CONVERSION_PROVIDER_IDENTITY_CONFLICT", error);
    }
    if (!request.decidedAt || !request.decidedBy || request.rejectionCode ||
      request.rejectionReason !== undefined) {
      this.fail("Approved decision authority is incomplete.",
        "WALLET_CONVERSION_PROVIDER_IDENTITY_CONFLICT");
    }
    const decisionAudit = await walletConversionAuditRepository.findByAuditKey(
      createIdempotencyFingerprint(WalletConversionAuditAction.APPROVED,
        request.conversionKey), session);
    if (!decisionAudit ||
      decisionAudit.action !== WalletConversionAuditAction.APPROVED ||
      decisionAudit.decision !== WalletConversionDecision.APPROVE ||
      !decisionAudit.adminActorId?.equals(request.decidedBy) ||
      decisionAudit.decidedAt?.getTime() !== request.decidedAt.getTime()) {
      this.fail("Approved decision audit authority conflicts.",
        "WALLET_CONVERSION_PROVIDER_IDENTITY_CONFLICT");
    }
    return request;
  }

  private ensureIdentity(authority:
    InternalWalletConversionProviderRequestDocument,
    request: WalletConversionRequestDocument, identity: Identity) {
    if (authority.providerRequestReference !==
      identity.providerRequestReference ||
      authority.providerRequestKey !== identity.providerRequestKey ||
      authority.conversionReference !== request.conversionReference ||
      !authority.userId.equals(request.userId) ||
      !authority.sourceWalletId.equals(request.sourceWalletId) ||
      String(authority.targetWalletId ?? "") !==
        String(request.targetWalletId ?? "") ||
      authority.sourceCurrency !== request.sourceCurrency ||
      authority.targetCurrency !== request.targetCurrency ||
      authority.sourceAmount !== request.sourceAmount ||
      authority.targetAmount !== request.targetAmount ||
      authority.fxSnapshotReference !== request.fxSnapshotReference ||
      authority.fxProvider !== request.fxProvider ||
      authority.fxEffectiveDate.getTime() !== request.fxEffectiveDate.getTime() ||
      authority.provider !== INTERNAL_WALLET_CONVERSION_PROVIDER ||
      authority.providerExecutionReference !==
        identity.providerExecutionReference ||
      authority.providerFingerprint !== identity.providerFingerprint ||
      authority.executionFingerprint !== identity.executionFingerprint) {
      this.fail("Wallet conversion provider identity conflicts.",
        "WALLET_CONVERSION_PROVIDER_IDENTITY_CONFLICT");
    }
  }

  private metadata(requestReference: string, executionReference: string) {
    return {
      provider: INTERNAL_WALLET_CONVERSION_PROVIDER,
      environment: process.env.NODE_ENV ?? "development",
      simulationMode: ProviderSimulationMode.NORMAL,
      correlationId: requestReference, requestId: executionReference,
    };
  }

  private async recordEvent(authority:
    InternalWalletConversionProviderRequestDocument,
    eventType: ProviderEventType, operation: ProviderOperation,
    transitionKey: string, occurredAt: Date, session: ClientSession,
    payloads?: { request: unknown; response: unknown }) {
    await ProviderEventService.recordEvent({
      entityType: ProviderEntityType.WALLET_CONVERSION_PROVIDER_REQUEST,
      entityId: authority._id as Types.ObjectId,
      eventType, operation, transitionKey,
      providerEntityId: authority.providerRequestReference,
      providerReference: authority.providerExecutionReference,
      providerMetadata: authority.providerMetadata ?? this.metadata(
        authority.conversionReference, authority.providerExecutionReference),
      execution: authority.execution ?? { attemptNumber: 1, retryCount: 0,
        isTestMode: process.env.NODE_ENV === "test" },
      audit: { createdBy: INTERNAL_WALLET_CONVERSION_PROVIDER,
        lastStatusChangedAt: occurredAt },
      payloads: payloads ?? authority.payloads ?? { request: null, response: null },
      occurredAt,
    }, session);
  }

  private auditData(request: WalletConversionRequestDocument,
    authority: InternalWalletConversionProviderRequestDocument,
    action: WalletConversionAuditAction, status:
      InternalWalletConversionProviderRequestStatus) {
    return {
      auditKey: createIdempotencyFingerprint(action, request.conversionKey),
      action, conversionReference: request.conversionReference,
      sourceCurrency: request.sourceCurrency,
      targetCurrency: request.targetCurrency,
      sourceAmount: request.sourceAmount, targetAmount: request.targetAmount,
      fxSnapshotReference: request.fxSnapshotReference,
      fxEffectiveDate: request.fxEffectiveDate,
      requestedAt: request.requestedAt,
      providerRequestReference: authority.providerRequestReference,
      providerExecutionReference: authority.providerExecutionReference,
      providerStatus: status, providerOutcome: authority.providerOutcome,
      processingAt: authority.processingAt,
      completedAt: authority.completedAt,
      failureCode: authority.failureCode,
    };
  }

  private async ensureInitialized(conversionReference: string) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const session = await mongoose.startSession();
      try {
        let result: InternalWalletConversionProviderRequestDocument | null = null;
        await session.withTransaction(async () => {
          const request = await this.resolveApproved(conversionReference, session);
          const identity = this.identity(request);
          const existing = await
            internalWalletConversionProviderRequestRepository.findByConversion(
              conversionReference, session);
          if (existing) {
            this.ensureIdentity(existing, request, identity);
            result = existing;
            return;
          }
          const created = await
            internalWalletConversionProviderRequestRepository.createInitialized({
              ...identity, conversionReference: request.conversionReference,
              userId: request.userId, sourceWalletId: request.sourceWalletId,
              targetWalletId: request.targetWalletId,
              sourceCurrency: request.sourceCurrency,
              targetCurrency: request.targetCurrency,
              sourceAmount: request.sourceAmount, targetAmount: request.targetAmount,
              fxSnapshotReference: request.fxSnapshotReference,
              fxProvider: request.fxProvider,
              fxEffectiveDate: request.fxEffectiveDate,
              provider: INTERNAL_WALLET_CONVERSION_PROVIDER,
            }, session);
          const at = this.now();
          const initPayload = { request: {
            conversionReference: request.conversionReference,
            providerRequestReference: created.providerRequestReference,
          }, response: { providerStatus:
            InternalWalletConversionProviderRequestStatus.INITIALIZED } };
          await this.recordEvent(created,
            ProviderEventType.CONVERSION_PROVIDER_CREATED,
            ProviderOperation.CREATE_CONVERSION_PROVIDER_REQUEST,
            identity.createdTransitionKey, at, session, initPayload);
          await this.recordEvent(created,
            ProviderEventType.CONVERSION_PROVIDER_INITIALIZED,
            ProviderOperation.INITIALIZE_CONVERSION_PROVIDER_REQUEST,
            identity.initializedTransitionKey, at, session, initPayload);
          result = created;
        });
        if (result) return result;
      } catch (error: any) {
        const winner = await
          internalWalletConversionProviderRequestRepository.findByConversion(
            conversionReference);
        if (winner) return winner;
        if (error?.code !== 11000 && !isTransient(error)) throw error;
      } finally { await session.endSession(); }
    }
    this.fail("Provider authority initialization conflicted.",
      "WALLET_CONVERSION_PROVIDER_TRANSACTION_CONFLICT");
  }

  private terminalStatus(outcome: WalletConversionProviderOutcome) {
    return outcome === WalletConversionProviderOutcome.SUCCESS
      ? InternalWalletConversionProviderRequestStatus.SUCCEEDED
      : InternalWalletConversionProviderRequestStatus.FAILED;
  }

  private async executeTransaction(input: ReturnType<
    WalletConversionProviderExecutionService["normalize"]>) {
    const session = await mongoose.startSession();
    let executed = false;
    try {
      await session.withTransaction(async () => {
        const request = await this.resolveApproved(
          input.conversionReference, session);
        const identity = this.identity(request);
        let authority = await
          internalWalletConversionProviderRequestRepository.findByConversion(
            input.conversionReference, session);
        if (!authority) this.fail("Provider authority was not found.",
          "WALLET_CONVERSION_PROVIDER_REQUEST_NOT_FOUND");
        this.ensureIdentity(authority, request, identity);
        if (authority.isTerminal) return;
        if (authority.providerStatus !==
          InternalWalletConversionProviderRequestStatus.INITIALIZED ||
          authority.version !== 0) {
          this.fail("Provider authority is not initialized.",
            "WALLET_CONVERSION_PROVIDER_STATE_CONFLICT");
        }
        const processingAt = this.now();
        const providerMetadata = this.metadata(request.conversionReference,
          identity.providerExecutionReference);
        const execution = { attemptNumber: 1, retryCount: 0,
          isTestMode: process.env.NODE_ENV === "test" };
        const requestPayload = {
          conversionReference: request.conversionReference,
          providerRequestReference: identity.providerRequestReference,
          providerExecutionReference: identity.providerExecutionReference,
          sourceCurrency: request.sourceCurrency,
          targetCurrency: request.targetCurrency,
          sourceAmount: request.sourceAmount, targetAmount: request.targetAmount,
          fxSnapshotReference: request.fxSnapshotReference,
        };
        authority = await
          internalWalletConversionProviderRequestRepository.markProcessing({
            providerRequestReference: authority.providerRequestReference,
            providerFingerprint: authority.providerFingerprint,
            executionFingerprint: authority.executionFingerprint,
            processingAt, providerMetadata, execution, requestPayload,
            expectedVersion: authority.version,
          }, session) ?? this.fail("PROCESSING transition conflicted.",
            "WALLET_CONVERSION_PROVIDER_TRANSACTION_CONFLICT");
        await this.inject("AFTER_PROCESSING");
        await this.recordEvent(authority,
          ProviderEventType.CONVERSION_PROVIDER_PROCESSING,
          ProviderOperation.PROCESS_CONVERSION_PROVIDER_REQUEST,
          identity.processingTransitionKey, processingAt, session);
        await this.inject("AFTER_EVENT_CREATION");
        await walletConversionAuditRepository.createOnce(
          this.auditData(request, authority,
            WalletConversionAuditAction.PROVIDER_STARTED,
            InternalWalletConversionProviderRequestStatus.PROCESSING), session);
        let providerResult: SimulateWalletConversionProviderResult;
        try {
          providerResult = this.executeProvider({
            providerRequestReference: identity.providerRequestReference,
            providerExecutionReference: identity.providerExecutionReference,
            conversionReference: request.conversionReference,
            outcome: input.outcome, failureCode: input.failureCode,
            failureReason: input.failureReason,
          });
        } catch (error) {
          this.fail("Internal Provider conversion execution failed.",
            "WALLET_CONVERSION_PROVIDER_FAILURE", error);
        }
        if (providerResult.status !== this.terminalStatus(input.outcome) ||
          providerResult.outcome !== input.outcome) {
          this.fail("Provider terminal result conflicts with execution intent.",
            "WALLET_CONVERSION_PROVIDER_TERMINAL_MISMATCH");
        }
        const completedAt = this.now();
        authority = await
          internalWalletConversionProviderRequestRepository.markTerminal({
            providerRequestReference: authority.providerRequestReference,
            executionFingerprint: authority.executionFingerprint,
            status: providerResult.status, outcome: providerResult.outcome,
            completedAt, responseCode: providerResult.responseCode,
            failureCode: providerResult.failureCode,
            failureReason: providerResult.failureReason,
            responsePayload: providerResult.responsePayload,
            processingLatencyMs: Math.max(0,
              completedAt.getTime() - processingAt.getTime()),
            expectedVersion: authority.version,
          }, session) ?? this.fail("Terminal transition conflicted.",
            "WALLET_CONVERSION_PROVIDER_TRANSACTION_CONFLICT");
        await this.inject("AFTER_TERMINAL_STATE");
        const succeeded = authority.providerStatus ===
          InternalWalletConversionProviderRequestStatus.SUCCEEDED;
        await this.recordEvent(authority,
          succeeded ? ProviderEventType.CONVERSION_PROVIDER_SUCCEEDED :
            ProviderEventType.CONVERSION_PROVIDER_FAILED,
          succeeded ? ProviderOperation.SUCCEED_CONVERSION_PROVIDER_REQUEST :
            ProviderOperation.FAIL_CONVERSION_PROVIDER_REQUEST,
          succeeded ? identity.succeededTransitionKey :
            identity.failedTransitionKey, completedAt, session);
        await this.inject("BEFORE_REQUEST_SYNCHRONIZATION");
        const synchronized = await
          walletConversionRequestRepository.synchronizeProviderTerminal({
            conversionReference: request.conversionReference,
            providerRequestReference: authority.providerRequestReference,
            providerExecutionReference: authority.providerExecutionReference,
            providerStatus: authority.providerStatus as "SUCCEEDED" | "FAILED",
            providerOutcome: authority.providerOutcome as "SUCCESS" | "FAILURE",
            providerProcessingAt: processingAt,
            providerCompletedAt: completedAt,
            providerFailureCode: authority.failureCode,
            providerMetadata: { provider: INTERNAL_WALLET_CONVERSION_PROVIDER,
              responseCode: authority.responseCode! }, session,
          });
        if (!synchronized) this.fail("Request synchronization conflicted.",
          "WALLET_CONVERSION_PROVIDER_SYNCHRONIZATION_CONFLICT");
        await this.inject("BEFORE_AUDIT");
        await walletConversionAuditRepository.createOnce(
          this.auditData(request, authority,
            succeeded ? WalletConversionAuditAction.PROVIDER_SUCCEEDED :
              WalletConversionAuditAction.PROVIDER_FAILED,
            authority.providerStatus), session);
        await this.inject("BEFORE_COMMIT");
        executed = true;
      });
      return executed;
    } finally { await session.endSession(); }
  }

  async validateReplay(conversionReference: string,
    expectedOutcome?: WalletConversionProviderOutcome,
    options?: { allowAccountingTerminal?: boolean }) {
    const allowAccountingTerminal = options?.allowAccountingTerminal === true;
    const request = await this.resolveApproved(conversionReference, undefined,
      allowAccountingTerminal);
    const identity = this.identity(request);
    const authority = await
      internalWalletConversionProviderRequestRepository.findByConversion(
        conversionReference);
    if (!authority) this.fail("Provider authority was not found.",
      "WALLET_CONVERSION_PROVIDER_REQUEST_NOT_FOUND");
    this.ensureIdentity(authority, request, identity);
    if (expectedOutcome !== undefined && authority.providerStatus !==
      this.terminalStatus(expectedOutcome)) {
      this.fail("Provider terminal result conflicts with execution intent.",
        "WALLET_CONVERSION_PROVIDER_TERMINAL_MISMATCH");
    }
    const expectedStatus = expectedOutcome === undefined
      ? authority.providerStatus : this.terminalStatus(expectedOutcome);
    if (!authority.isTerminal || authority.version !== 2 ||
      authority.providerStatus !== expectedStatus ||
      ![InternalWalletConversionProviderRequestStatus.SUCCEEDED,
        InternalWalletConversionProviderRequestStatus.FAILED]
        .includes(authority.providerStatus) ||
      !authority.providerOutcome || !authority.processingAt ||
      !authority.completedAt || authority.completedAt < authority.processingAt ||
      !authority.providerMetadata || !authority.execution ||
      !authority.payloads || !authority.responseCode ||
      (authority.providerStatus ===
        InternalWalletConversionProviderRequestStatus.SUCCEEDED &&
        (authority.providerOutcome !== WalletConversionProviderOutcome.SUCCESS ||
          authority.failureCode || authority.failureReason)) ||
      (authority.providerStatus ===
        InternalWalletConversionProviderRequestStatus.FAILED &&
        (authority.providerOutcome !== WalletConversionProviderOutcome.FAILURE ||
          !authority.failureCode))) {
      this.fail("Provider terminal replay conflicts.",
        "WALLET_CONVERSION_PROVIDER_REPLAY_CONFLICT");
    }
    if ((!allowAccountingTerminal &&
      request.status !== WalletConversionRequestStatus.APPROVED) ||
      (allowAccountingTerminal && ![
        WalletConversionRequestStatus.APPROVED,
        WalletConversionRequestStatus.COMPLETED,
        WalletConversionRequestStatus.FAILED,
      ].includes(request.status)) ||
      request.providerRequestReference !== authority.providerRequestReference ||
      request.providerExecutionReference !==
        authority.providerExecutionReference ||
      request.providerStatus !== authority.providerStatus ||
      request.providerOutcome !== authority.providerOutcome ||
      request.providerProcessingAt?.getTime() !==
        authority.processingAt.getTime() ||
      request.providerCompletedAt?.getTime() !==
        authority.completedAt.getTime() ||
      request.providerFailureCode !== authority.failureCode ||
      request.providerMetadata?.provider !==
        INTERNAL_WALLET_CONVERSION_PROVIDER ||
      request.providerMetadata?.responseCode !== authority.responseCode) {
      this.fail("Provider request synchronization conflicts.",
        "WALLET_CONVERSION_PROVIDER_SYNCHRONIZATION_CONFLICT");
    }
    const terminalEvent = authority.providerStatus ===
      InternalWalletConversionProviderRequestStatus.SUCCEEDED
      ? ProviderEventType.CONVERSION_PROVIDER_SUCCEEDED
      : ProviderEventType.CONVERSION_PROVIDER_FAILED;
    const terminalOperation = authority.providerStatus ===
      InternalWalletConversionProviderRequestStatus.SUCCEEDED
      ? ProviderOperation.SUCCEED_CONVERSION_PROVIDER_REQUEST
      : ProviderOperation.FAIL_CONVERSION_PROVIDER_REQUEST;
    const terminalTransition = authority.providerStatus ===
      InternalWalletConversionProviderRequestStatus.SUCCEEDED
      ? identity.succeededTransitionKey : identity.failedTransitionKey;
    const events = await InternalProviderEventRepository.findMany({
      entityType: ProviderEntityType.WALLET_CONVERSION_PROVIDER_REQUEST,
      entityId: authority._id,
    });
    const requiredEvents = [
      [ProviderEventType.CONVERSION_PROVIDER_CREATED,
        ProviderOperation.CREATE_CONVERSION_PROVIDER_REQUEST,
        identity.createdTransitionKey],
      [ProviderEventType.CONVERSION_PROVIDER_INITIALIZED,
        ProviderOperation.INITIALIZE_CONVERSION_PROVIDER_REQUEST,
        identity.initializedTransitionKey],
      [ProviderEventType.CONVERSION_PROVIDER_PROCESSING,
        ProviderOperation.PROCESS_CONVERSION_PROVIDER_REQUEST,
        identity.processingTransitionKey],
      [terminalEvent, terminalOperation, terminalTransition],
    ];
    if (events.length !== 4 || !requiredEvents.every(([event, operation, key]) =>
      events.some((candidate) => candidate.eventType === event &&
        candidate.operation === operation && candidate.transitionKey === key &&
        candidate.providerEntityId === authority.providerRequestReference &&
        candidate.providerReference ===
          authority.providerExecutionReference))) {
      this.fail("Provider event chain conflicts.",
        "WALLET_CONVERSION_PROVIDER_EVENT_CONFLICT");
    }
    const terminalAction = authority.providerStatus ===
      InternalWalletConversionProviderRequestStatus.SUCCEEDED
      ? WalletConversionAuditAction.PROVIDER_SUCCEEDED
      : WalletConversionAuditAction.PROVIDER_FAILED;
    const audits = await WalletConversionAudit.find({
      conversionReference, action: { $in: [
        WalletConversionAuditAction.PROVIDER_STARTED, terminalAction,
      ] },
    });
    if (audits.length !== 2 || !audits.some((audit) =>
      audit.action === WalletConversionAuditAction.PROVIDER_STARTED &&
      audit.providerStatus ===
        InternalWalletConversionProviderRequestStatus.PROCESSING &&
      audit.processingAt?.getTime() === authority.processingAt!.getTime()) ||
      !audits.some((audit) => audit.action === terminalAction &&
        audit.providerStatus === authority.providerStatus &&
        audit.providerOutcome === authority.providerOutcome &&
        audit.completedAt?.getTime() === authority.completedAt!.getTime() &&
        audit.providerRequestReference === authority.providerRequestReference &&
        audit.providerExecutionReference ===
          authority.providerExecutionReference &&
        audit.failureCode === authority.failureCode)) {
      this.fail("Provider audit chain conflicts.",
        "WALLET_CONVERSION_PROVIDER_AUDIT_CONFLICT");
    }
    return toWalletConversionProviderExecutionResponseDto(authority);
  }

  async execute(raw: ExecuteWalletConversionProviderInput) {
    const input = this.normalize(raw);
    const existing = await
      internalWalletConversionProviderRequestRepository.findByConversion(
        input.conversionReference);
    if (existing?.isTerminal) {
      return this.validateReplay(input.conversionReference, input.outcome);
    }
    const authority = await this.ensureInitialized(input.conversionReference);
    const request = await this.resolveApproved(input.conversionReference);
    this.ensureIdentity(authority, request, this.identity(request));
    await this.inject("AFTER_AUTHORITY");
    if (authority.isTerminal) {
      return this.validateReplay(input.conversionReference, input.outcome);
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await this.executeTransaction(input);
        return this.validateReplay(input.conversionReference, input.outcome);
      } catch (error) {
        lastError = error;
        const winner = await
          internalWalletConversionProviderRequestRepository.findByConversion(
            input.conversionReference);
        if (winner?.isTerminal) {
          return this.validateReplay(input.conversionReference, input.outcome);
        }
        if (error instanceof WalletConversionProviderExecutionError &&
          error.code !== "WALLET_CONVERSION_PROVIDER_TRANSACTION_CONFLICT") {
          throw error;
        }
        if (!isTransient(error)) break;
      }
    }
    if (lastError instanceof WalletConversionProviderExecutionError) {
      throw lastError;
    }
    this.fail("Provider execution transaction failed.",
      "WALLET_CONVERSION_PROVIDER_TRANSACTION_CONFLICT", lastError);
  }
}

export const walletConversionProviderExecutionService =
  new WalletConversionProviderExecutionService();
