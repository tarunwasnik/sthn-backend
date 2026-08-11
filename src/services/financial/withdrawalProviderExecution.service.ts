import mongoose, { ClientSession, Types } from "mongoose";

import {
  ProviderEntityType,
  ProviderEventType,
  ProviderOperation,
  ProviderSimulationMode,
} from "../../constants/internalProvider";
import { AuditAction } from "../../enums/financial/auditAction.enum";
import { CreatorWithdrawalRequestStatus } from
  "../../enums/financial/creatorWithdrawalRequestStatus.enum";
import { InternalWithdrawalProviderRequestStatus } from
  "../../enums/financial/internalWithdrawalProviderRequestStatus.enum";
import { PayoutDestinationVerificationStatus } from
  "../../enums/financial/payoutDestinationVerificationStatus.enum";
import { WithdrawalProviderExecutionOutcome } from
  "../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import {
  WithdrawalProviderExecutionError,
  WithdrawalProviderExecutionErrorCode,
} from "../../errors/financial/WithdrawalProviderExecutionError";
import { AuditLog } from "../../models/auditLog.model";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { CreatorWithdrawalRequestDocument } from
  "../../models/creatorWithdrawalRequest.model";
import { InternalWithdrawalProviderRequestDocument } from
  "../../models/internalProvider/internalWithdrawalProviderRequest.model";
import InternalProviderEventRepository from
  "../../repositories/internalProvider/internalProviderEvent.repository";
import { creatorWithdrawalRequestRepository } from
  "../../repositories/creatorWithdrawalRequest.repository";
import { internalWithdrawalProviderRequestRepository } from
  "../../repositories/internalProvider/internalWithdrawalProviderRequest.repository";
import { payoutDestinationRepository } from
  "../../repositories/payoutDestination.repository";
import {
  deriveWithdrawalProviderExecutionIdentity,
  deriveWithdrawalProviderIdentity,
  INTERNAL_WITHDRAWAL_PROVIDER,
} from "../../utils/financial/withdrawalProviderIdentity.util";
import { createFinancialAudit } from "../auditLog.service";
import ProviderClockService from
  "../internalProvider/base/providerClock.service";
import ProviderEventService from
  "../internalProvider/events/providerEvent.service";
import {
  providerSimulatorService,
  SimulateWithdrawalProviderInput,
  SimulateWithdrawalProviderResult,
} from "../providerSimulator/providerSimulator.service";
import { creatorWithdrawalRequestService } from
  "./creatorWithdrawalRequest.service";
import { withdrawalProviderInitializationService } from
  "./withdrawalProviderInitialization.service";

export type WithdrawalProviderExecutionStage =
  | "BEFORE_PROCESSING"
  | "AFTER_PROCESSING"
  | "BEFORE_TERMINAL_STATE"
  | "AFTER_TERMINAL_STATE"
  | "BEFORE_AUDIT"
  | "BEFORE_COMMIT";

export interface ExecuteWithdrawalProviderInput {
  withdrawalReference: string;
  outcome: WithdrawalProviderExecutionOutcome;
  failureCode?: string;
  failureReason?: string;
}

type ExecutionIdentity = ReturnType<
  typeof deriveWithdrawalProviderExecutionIdentity
>;

type WithdrawalProviderExecutor = (
  input: SimulateWithdrawalProviderInput,
) => SimulateWithdrawalProviderResult;

interface ExecutionContext {
  withdrawal: CreatorWithdrawalRequestDocument;
  providerRequest: InternalWithdrawalProviderRequestDocument;
  executionIdentity: ExecutionIdentity;
}

const isTransientTransactionError = (error: unknown) => {
  const candidate = error as {
    code?: number;
    hasErrorLabel?: (label: string) => boolean;
  };
  return candidate?.code === 112 ||
    candidate?.code === 251 ||
    candidate?.hasErrorLabel?.("TransientTransactionError") === true ||
    candidate?.hasErrorLabel?.("UnknownTransactionCommitResult") === true;
};

export class WithdrawalProviderExecutionService {
  constructor(
    private readonly onStage: (
      stage: WithdrawalProviderExecutionStage,
    ) => void | Promise<void> = () => undefined,
    private readonly executeProvider: WithdrawalProviderExecutor =
      (input) => providerSimulatorService.simulateWithdrawalProvider(input),
  ) {}

  private fail(
    message: string,
    code: WithdrawalProviderExecutionErrorCode,
    cause?: unknown,
  ): never {
    throw new WithdrawalProviderExecutionError(message, code, { cause });
  }

  private terminalStatus(outcome: WithdrawalProviderExecutionOutcome) {
    return outcome === WithdrawalProviderExecutionOutcome.SUCCESS
      ? InternalWithdrawalProviderRequestStatus.SUCCEEDED
      : InternalWithdrawalProviderRequestStatus.FAILED;
  }

  private validateInput(input: ExecuteWithdrawalProviderInput) {
    if (
      typeof input.withdrawalReference !== "string" ||
      !input.withdrawalReference.trim() ||
      !Object.values(WithdrawalProviderExecutionOutcome)
        .includes(input.outcome) ||
      (input.failureCode !== undefined &&
        !/^[A-Z][A-Z0-9_]{0,63}$/.test(input.failureCode)) ||
      (input.failureReason !== undefined &&
        (typeof input.failureReason !== "string" ||
          !input.failureReason.trim() ||
          input.failureReason.trim().length > 500)) ||
      (input.outcome === WithdrawalProviderExecutionOutcome.SUCCESS &&
        (input.failureCode !== undefined || input.failureReason !== undefined))
    ) {
      this.fail(
        "Invalid withdrawal provider execution request.",
        "WITHDRAWAL_PROVIDER_EXECUTION_CONFLICT",
      );
    }
  }

  private ensureIdentity(
    withdrawal: CreatorWithdrawalRequestDocument,
    providerRequest: InternalWithdrawalProviderRequestDocument,
  ): ExecutionIdentity {
    const providerIdentity = deriveWithdrawalProviderIdentity({
      withdrawalReference: withdrawal.withdrawalReference,
      creatorId: withdrawal.creatorId,
      creatorReference: providerRequest.creatorReference,
      walletId: withdrawal.walletId,
      destinationReference: withdrawal.destinationReference,
      currency: withdrawal.currency,
      amount: withdrawal.amount,
    });
    if (
      withdrawal.providerRequestReference !==
        providerRequest.providerRequestReference ||
      providerRequest.providerRequestReference !==
        providerIdentity.providerRequestReference ||
      providerRequest.providerRequestKey !==
        providerIdentity.providerRequestKey ||
      providerRequest.providerReference !== providerIdentity.providerReference ||
      providerRequest.providerFingerprint !==
        providerIdentity.providerFingerprint ||
      providerRequest.walletReference !== providerIdentity.walletReference ||
      providerRequest.destinationReference !==
        withdrawal.destinationReference ||
      providerRequest.currency !== withdrawal.currency ||
      providerRequest.amount !== withdrawal.amount
    ) {
      this.fail(
        "Withdrawal provider identity conflicts before execution.",
        "WITHDRAWAL_PROVIDER_EXECUTION_CONFLICT",
      );
    }
    return deriveWithdrawalProviderExecutionIdentity({
      providerRequestReference: providerRequest.providerRequestReference,
      providerRequestKey: providerRequest.providerRequestKey,
      providerReference: providerRequest.providerReference,
      providerFingerprint: providerRequest.providerFingerprint,
    });
  }

  private async resolveContext(
    withdrawalReference: string,
    session?: ClientSession,
    allowFinalized = false,
  ): Promise<ExecutionContext> {
    const withdrawal =
      await creatorWithdrawalRequestRepository.findByReference(
        withdrawalReference,
        session,
      );
    const reservationAuthorityPresent = withdrawal && (
      (withdrawal.status === CreatorWithdrawalRequestStatus.RESERVED &&
        withdrawal.reservedAmount === withdrawal.amount) ||
      (allowFinalized &&
        [
          CreatorWithdrawalRequestStatus.COMPLETED,
          CreatorWithdrawalRequestStatus.FAILED,
        ].includes(withdrawal.status) &&
        withdrawal.reservedAmount === 0 &&
        Boolean(withdrawal.finalizationReference))
    );
    if (!withdrawal || !reservationAuthorityPresent ||
      !withdrawal.providerRequestReference) {
      this.fail(
        "Reserved withdrawal authority is unavailable for execution.",
        "WITHDRAWAL_PROVIDER_EXECUTION_REPLAY_CONFLICT",
      );
    }
    const providerRequest =
      await internalWithdrawalProviderRequestRepository.findByWithdrawal(
        withdrawalReference,
        session,
      );
    if (!providerRequest) {
      this.fail(
        "Withdrawal provider request was not found.",
        "WITHDRAWAL_PROVIDER_EXECUTION_PROVIDER_MISSING",
      );
    }
    const [creator, destination] = await Promise.all([
      CreatorProfile.findById(withdrawal.creatorId).session(session ?? null),
      payoutDestinationRepository.findByCreatorAndReference(
        withdrawal.creatorUserId.toString(),
        withdrawal.destinationReference,
        session,
      ),
    ]);
    if (!creator || creator.status !== "active") {
      this.fail(
        "Creator is not active for provider execution.",
        "WITHDRAWAL_PROVIDER_EXECUTION_STATE_CONFLICT",
      );
    }
    if (
      !destination ||
      !destination._id.equals(withdrawal.destinationId) ||
      destination.verificationStatus !==
        PayoutDestinationVerificationStatus.VERIFIED ||
      !destination.isActive ||
      !destination.verifiedAt
    ) {
      this.fail(
        "Withdrawal destination is not healthy for provider execution.",
        "WITHDRAWAL_PROVIDER_EXECUTION_STATE_CONFLICT",
      );
    }
    return {
      withdrawal,
      providerRequest,
      executionIdentity: this.ensureIdentity(withdrawal, providerRequest),
    };
  }

  private safe(
    providerRequest: InternalWithdrawalProviderRequestDocument,
    replay: boolean,
  ) {
    return {
      providerRequestReference: providerRequest.providerRequestReference,
      withdrawalReference: providerRequest.withdrawalReference,
      providerReference: providerRequest.providerReference,
      executionReference: providerRequest.executionReference,
      providerStatus: providerRequest.providerStatus,
      processingAt: providerRequest.processingAt,
      succeededAt: providerRequest.succeededAt,
      failedAt: providerRequest.failedAt,
      responseCode: providerRequest.terminalResult?.code,
      failureReason: providerRequest.providerStatus ===
        InternalWithdrawalProviderRequestStatus.FAILED
        ? providerRequest.terminalResult?.message
        : undefined,
      replay,
    };
  }

  private async recordEvent(
    providerRequest: InternalWithdrawalProviderRequestDocument,
    eventType: ProviderEventType,
    operation: ProviderOperation,
    transitionKey: string,
    occurredAt: Date,
    session: ClientSession,
  ) {
    if (
      !providerRequest.providerMetadata ||
      !providerRequest.execution ||
      !providerRequest.payloads
    ) {
      this.fail(
        "Provider execution metadata is incomplete.",
        "WITHDRAWAL_PROVIDER_EXECUTION_EVENT_CONFLICT",
      );
    }
    await ProviderEventService.recordEvent({
      entityType: ProviderEntityType.WITHDRAWAL_PROVIDER_REQUEST,
      entityId: providerRequest._id as Types.ObjectId,
      eventType,
      operation,
      transitionKey,
      providerEntityId: providerRequest.providerRequestReference,
      providerReference: providerRequest.providerReference,
      providerMetadata: providerRequest.providerMetadata,
      execution: providerRequest.execution,
      audit: {
        createdBy: INTERNAL_WITHDRAWAL_PROVIDER,
        lastStatusChangedAt: occurredAt,
      },
      payloads: providerRequest.payloads,
      occurredAt,
    }, session);
  }

  private async recordAudit(
    providerRequest: InternalWithdrawalProviderRequestDocument,
    action: AuditAction,
    fromStatus: InternalWithdrawalProviderRequestStatus,
    toStatus: InternalWithdrawalProviderRequestStatus,
    outcome: "PROCESSING" | "SUCCEEDED" | "FAILED",
    session: ClientSession,
  ) {
    await createFinancialAudit({
      action,
      actor: { type: "PROVIDER", reference: INTERNAL_WITHDRAWAL_PROVIDER },
      entityType: "INTERNAL_WITHDRAWAL_PROVIDER_REQUEST",
      entityId: providerRequest._id as Types.ObjectId,
      financialContext: {
        domain: "WITHDRAWAL",
        primaryReference: providerRequest.withdrawalReference,
        withdrawalReference: providerRequest.withdrawalReference,
        provider: INTERNAL_WITHDRAWAL_PROVIDER,
        providerReference: providerRequest.providerReference,
        amount: providerRequest.amount,
        currency: providerRequest.currency,
      },
      transition: { fromStatus, toStatus, outcome },
      metadata: {
        creatorReference: providerRequest.creatorReference,
        walletReference: providerRequest.walletReference,
        destinationReference: providerRequest.destinationReference,
        providerStatus: toStatus,
        reasonCode: action,
        ...(providerRequest.providerStatus ===
          InternalWithdrawalProviderRequestStatus.FAILED
          ? { failureCode: providerRequest.terminalResult?.code ??
            "INTERNAL_PROVIDER_FAILED" }
          : {}),
      },
      session,
    });
  }

  async validateReplay(
    withdrawalReference: string,
    expectedOutcome?: WithdrawalProviderExecutionOutcome,
  ) {
    await creatorWithdrawalRequestService.validateReplay(withdrawalReference);
    await withdrawalProviderInitializationService.validateReplay(
      withdrawalReference,
    );
    const context = await this.resolveContext(
      withdrawalReference,
      undefined,
      true,
    );
    const { withdrawal, providerRequest, executionIdentity } = context;
    const terminalStatuses = [
      InternalWithdrawalProviderRequestStatus.SUCCEEDED,
      InternalWithdrawalProviderRequestStatus.FAILED,
    ];
    if (
      !terminalStatuses.includes(providerRequest.providerStatus) ||
      !providerRequest.isTerminal ||
      providerRequest.version !== 3 ||
      !providerRequest.processingAt ||
      !providerRequest.executionReference ||
      providerRequest.executionReference !==
        executionIdentity.executionReference ||
      providerRequest.executionFingerprint !==
        executionIdentity.executionFingerprint ||
      !providerRequest.providerMetadata ||
      providerRequest.providerMetadata.provider !==
        INTERNAL_WITHDRAWAL_PROVIDER ||
      !providerRequest.execution ||
      !providerRequest.payloads ||
      !providerRequest.terminalResult ||
      providerRequest.terminalResult.outcome !== providerRequest.providerStatus
    ) {
      this.fail(
        "Withdrawal provider terminal replay conflicts.",
        "WITHDRAWAL_PROVIDER_EXECUTION_REPLAY_CONFLICT",
      );
    }
    const expectedStatus = expectedOutcome === undefined
      ? providerRequest.providerStatus
      : this.terminalStatus(expectedOutcome);
    if (
      providerRequest.providerStatus !== expectedStatus ||
      (providerRequest.providerStatus ===
        InternalWithdrawalProviderRequestStatus.SUCCEEDED &&
        (!providerRequest.succeededAt || providerRequest.failedAt)) ||
      (providerRequest.providerStatus ===
        InternalWithdrawalProviderRequestStatus.FAILED &&
        (!providerRequest.failedAt || providerRequest.succeededAt))
    ) {
      this.fail(
        "Provider terminal result does not match the requested outcome.",
        "WITHDRAWAL_PROVIDER_EXECUTION_TERMINAL_MISMATCH",
      );
    }
    const terminalAt = providerRequest.succeededAt ?? providerRequest.failedAt!;
    const withdrawalLifecycleMatches =
      (withdrawal.status === CreatorWithdrawalRequestStatus.RESERVED &&
        withdrawal.reservedAmount === withdrawal.amount) ||
      ([
        CreatorWithdrawalRequestStatus.COMPLETED,
        CreatorWithdrawalRequestStatus.FAILED,
      ].includes(withdrawal.status) &&
        withdrawal.reservedAmount === 0 &&
        String(withdrawal.finalizationOutcome) === withdrawal.status &&
        Boolean(withdrawal.finalizationReference));
    if (
      !withdrawalLifecycleMatches ||
      withdrawal.providerTerminalStatus !== providerRequest.providerStatus ||
      withdrawal.providerProcessingAt?.getTime() !==
        providerRequest.processingAt.getTime() ||
      withdrawal.providerSucceededAt?.getTime() !==
        providerRequest.succeededAt?.getTime() ||
      withdrawal.providerFailedAt?.getTime() !==
        providerRequest.failedAt?.getTime() ||
      withdrawal.providerExecutionMetadata?.provider !==
        INTERNAL_WITHDRAWAL_PROVIDER ||
      withdrawal.providerExecutionMetadata.executionReference !==
        executionIdentity.executionReference ||
      withdrawal.providerExecutionMetadata.responseCode !==
        providerRequest.terminalResult.code ||
      terminalAt.getTime() < providerRequest.processingAt.getTime()
    ) {
      this.fail(
        "Withdrawal provider terminal synchronization conflicts.",
        "WITHDRAWAL_PROVIDER_EXECUTION_REPLAY_CONFLICT",
      );
    }
    const [events, audits] = await Promise.all([
      InternalProviderEventRepository.findMany({
        entityType: ProviderEntityType.WITHDRAWAL_PROVIDER_REQUEST,
        entityId: providerRequest._id,
        eventType: {
          $in: [
            ProviderEventType.WITHDRAWAL_PROVIDER_PROCESSING,
            ProviderEventType.WITHDRAWAL_PROVIDER_SUCCEEDED,
            ProviderEventType.WITHDRAWAL_PROVIDER_FAILED,
          ],
        },
      }),
      AuditLog.find({
        entityId: providerRequest._id,
        action: {
          $in: [
            AuditAction.CREATOR_WITHDRAWAL_PROVIDER_PROCESSING,
            AuditAction.CREATOR_WITHDRAWAL_PROVIDER_SUCCEEDED,
            AuditAction.CREATOR_WITHDRAWAL_PROVIDER_FAILED,
          ],
        },
      }),
    ]);
    const terminalEvent = providerRequest.providerStatus ===
      InternalWithdrawalProviderRequestStatus.SUCCEEDED
      ? ProviderEventType.WITHDRAWAL_PROVIDER_SUCCEEDED
      : ProviderEventType.WITHDRAWAL_PROVIDER_FAILED;
    const terminalTransitionKey = providerRequest.providerStatus ===
      InternalWithdrawalProviderRequestStatus.SUCCEEDED
      ? executionIdentity.succeededTransitionKey
      : executionIdentity.failedTransitionKey;
    if (
      events.length !== 2 ||
      !events.some((event) =>
        event.eventType ===
          ProviderEventType.WITHDRAWAL_PROVIDER_PROCESSING &&
        event.operation ===
          ProviderOperation.PROCESS_WITHDRAWAL_PROVIDER_REQUEST &&
        event.transitionKey === executionIdentity.processingTransitionKey) ||
      !events.some((event) =>
        event.eventType === terminalEvent &&
        event.operation === (providerRequest.providerStatus ===
          InternalWithdrawalProviderRequestStatus.SUCCEEDED
          ? ProviderOperation.SUCCEED_WITHDRAWAL_PROVIDER_REQUEST
          : ProviderOperation.FAIL_WITHDRAWAL_PROVIDER_REQUEST) &&
        event.transitionKey === terminalTransitionKey) ||
      !events.every((event) =>
        event.providerEntityId === providerRequest.providerRequestReference &&
        event.providerReference === providerRequest.providerReference)
    ) {
      this.fail(
        "Withdrawal provider execution event chain conflicts.",
        "WITHDRAWAL_PROVIDER_EXECUTION_EVENT_CONFLICT",
      );
    }
    const terminalAuditAction = providerRequest.providerStatus ===
      InternalWithdrawalProviderRequestStatus.SUCCEEDED
      ? AuditAction.CREATOR_WITHDRAWAL_PROVIDER_SUCCEEDED
      : AuditAction.CREATOR_WITHDRAWAL_PROVIDER_FAILED;
    if (
      audits.length !== 2 ||
      !audits.some((audit) =>
        audit.action ===
          AuditAction.CREATOR_WITHDRAWAL_PROVIDER_PROCESSING) ||
      !audits.some((audit) => audit.action === terminalAuditAction) ||
      !audits.every((audit) =>
        audit.financialContext?.withdrawalReference ===
          withdrawalReference &&
        audit.financialContext?.providerReference ===
          providerRequest.providerReference &&
        audit.financialContext?.amount === providerRequest.amount &&
        audit.financialContext?.currency === providerRequest.currency &&
        audit.metadata?.creatorReference ===
          providerRequest.creatorReference &&
        audit.metadata?.walletReference === providerRequest.walletReference &&
        audit.metadata?.destinationReference ===
          providerRequest.destinationReference)
    ) {
      this.fail(
        "Withdrawal provider execution audit chain conflicts.",
        "WITHDRAWAL_PROVIDER_EXECUTION_REPLAY_CONFLICT",
      );
    }
    return this.safe(providerRequest, true);
  }

  private async executeTransaction(input: ExecuteWithdrawalProviderInput) {
    const session = await mongoose.startSession();
    let committed = false;
    try {
      await session.withTransaction(async () => {
        const context = await this.resolveContext(
          input.withdrawalReference,
          session,
        );
        const { withdrawal, executionIdentity } = context;
        let providerRequest = context.providerRequest;
        const expectedStatus = this.terminalStatus(input.outcome);
        if (providerRequest.isTerminal) {
          if (providerRequest.providerStatus !== expectedStatus) {
            this.fail(
              "Provider terminal result conflicts with execution intent.",
              "WITHDRAWAL_PROVIDER_EXECUTION_TERMINAL_MISMATCH",
            );
          }
          committed = true;
          return;
        }
        if (providerRequest.providerStatus !==
          InternalWithdrawalProviderRequestStatus.INITIALIZED) {
          this.fail(
            "Provider request is not initialized for execution.",
            "WITHDRAWAL_PROVIDER_EXECUTION_STATE_CONFLICT",
          );
        }
        await this.onStage("BEFORE_PROCESSING");
        const processingAt = ProviderClockService.now();
        const providerMetadata = {
          provider: INTERNAL_WITHDRAWAL_PROVIDER,
          environment: process.env.NODE_ENV ?? "development",
          simulationMode: ProviderSimulationMode.NORMAL,
          correlationId: providerRequest.withdrawalReference,
          requestId: executionIdentity.executionReference,
        };
        const execution = {
          attemptNumber: 1,
          retryCount: 0,
          isTestMode: process.env.NODE_ENV === "test",
        };
        providerRequest =
          await internalWithdrawalProviderRequestRepository.markProcessing({
            providerRequestReference:
              providerRequest.providerRequestReference,
            providerFingerprint: providerRequest.providerFingerprint,
            executionReference: executionIdentity.executionReference,
            executionFingerprint: executionIdentity.executionFingerprint,
            processingAt,
            providerMetadata,
            execution,
            requestPayload: {
              withdrawalReference: providerRequest.withdrawalReference,
              providerRequestReference:
                providerRequest.providerRequestReference,
              providerReference: providerRequest.providerReference,
              executionReference: executionIdentity.executionReference,
              destinationReference: providerRequest.destinationReference,
              amount: providerRequest.amount,
              currency: providerRequest.currency,
            },
            expectedVersion: providerRequest.version,
          }, session) ?? this.fail(
            "Provider PROCESSING transition conflicted.",
            "WITHDRAWAL_PROVIDER_EXECUTION_TRANSACTION_CONFLICT",
          );
        await this.recordEvent(
          providerRequest,
          ProviderEventType.WITHDRAWAL_PROVIDER_PROCESSING,
          ProviderOperation.PROCESS_WITHDRAWAL_PROVIDER_REQUEST,
          executionIdentity.processingTransitionKey,
          processingAt,
          session,
        );
        await this.recordAudit(
          providerRequest,
          AuditAction.CREATOR_WITHDRAWAL_PROVIDER_PROCESSING,
          InternalWithdrawalProviderRequestStatus.INITIALIZED,
          InternalWithdrawalProviderRequestStatus.PROCESSING,
          "PROCESSING",
          session,
        );
        await this.onStage("AFTER_PROCESSING");
        await this.onStage("BEFORE_TERMINAL_STATE");
        let providerResult: SimulateWithdrawalProviderResult;
        try {
          providerResult = this.executeProvider({
            providerRequestReference:
              providerRequest.providerRequestReference,
            providerReference: providerRequest.providerReference,
            executionReference: executionIdentity.executionReference,
            outcome: input.outcome,
            failureCode: input.failureCode,
            failureReason: input.failureReason,
          });
        } catch (error) {
          this.fail(
            "Internal Provider withdrawal execution failed.",
            "WITHDRAWAL_PROVIDER_EXECUTION_PROVIDER_FAILURE",
            error,
          );
        }
        if (providerResult.status !== expectedStatus) {
          this.fail(
            "Internal Provider returned an unexpected terminal result.",
            "WITHDRAWAL_PROVIDER_EXECUTION_TERMINAL_MISMATCH",
          );
        }
        const terminalAt = ProviderClockService.now();
        providerRequest =
          await internalWithdrawalProviderRequestRepository.markTerminal({
            providerRequestReference:
              providerRequest.providerRequestReference,
            executionFingerprint: executionIdentity.executionFingerprint,
            status: providerResult.status,
            terminalAt,
            responseCode: providerResult.responseCode,
            responseMessage: providerResult.responseMessage,
            responsePayload: providerResult.responsePayload,
            processingLatencyMs: Math.max(
              0,
              terminalAt.getTime() - processingAt.getTime(),
            ),
            expectedVersion: providerRequest.version,
          }, session) ?? this.fail(
            "Provider terminal transition conflicted.",
            "WITHDRAWAL_PROVIDER_EXECUTION_TRANSACTION_CONFLICT",
          );
        await this.onStage("AFTER_TERMINAL_STATE");
        const succeeded = providerRequest.providerStatus ===
          InternalWithdrawalProviderRequestStatus.SUCCEEDED;
        await this.recordEvent(
          providerRequest,
          succeeded
            ? ProviderEventType.WITHDRAWAL_PROVIDER_SUCCEEDED
            : ProviderEventType.WITHDRAWAL_PROVIDER_FAILED,
          succeeded
            ? ProviderOperation.SUCCEED_WITHDRAWAL_PROVIDER_REQUEST
            : ProviderOperation.FAIL_WITHDRAWAL_PROVIDER_REQUEST,
          succeeded
            ? executionIdentity.succeededTransitionKey
            : executionIdentity.failedTransitionKey,
          terminalAt,
          session,
        );
        await this.onStage("BEFORE_AUDIT");
        await this.recordAudit(
          providerRequest,
          succeeded
            ? AuditAction.CREATOR_WITHDRAWAL_PROVIDER_SUCCEEDED
            : AuditAction.CREATOR_WITHDRAWAL_PROVIDER_FAILED,
          InternalWithdrawalProviderRequestStatus.PROCESSING,
          providerRequest.providerStatus,
          succeeded ? "SUCCEEDED" : "FAILED",
          session,
        );
        const synchronized =
          await creatorWithdrawalRequestRepository.synchronizeProviderTerminal({
            requestId: withdrawal._id as Types.ObjectId,
            withdrawalReference: withdrawal.withdrawalReference,
            providerRequestReference:
              providerRequest.providerRequestReference,
            providerTerminalStatus: providerRequest.providerStatus as
              | "SUCCEEDED"
              | "FAILED",
            providerProcessingAt: processingAt,
            providerSucceededAt: providerRequest.succeededAt,
            providerFailedAt: providerRequest.failedAt,
            providerExecutionMetadata: {
              provider: INTERNAL_WITHDRAWAL_PROVIDER,
              providerRequestReference:
                providerRequest.providerRequestReference,
              providerReference: providerRequest.providerReference,
              executionReference: executionIdentity.executionReference,
              responseCode: providerResult.responseCode,
              ...(succeeded
                ? {}
                : { failureCode: providerResult.responseCode }),
            },
            expectedVersion: withdrawal.version,
          }, session);
        if (!synchronized) {
          this.fail(
            "Withdrawal terminal synchronization conflicted.",
            "WITHDRAWAL_PROVIDER_EXECUTION_TRANSACTION_CONFLICT",
          );
        }
        await this.onStage("BEFORE_COMMIT");
        committed = true;
      });
      return committed;
    } finally {
      await session.endSession();
    }
  }

  async execute(input: ExecuteWithdrawalProviderInput) {
    this.validateInput(input);
    const normalized = {
      ...input,
      withdrawalReference: input.withdrawalReference.trim(),
      failureCode: input.failureCode?.trim(),
      failureReason: input.failureReason?.trim(),
    };
    await creatorWithdrawalRequestService.validateReplay(
      normalized.withdrawalReference,
    );
    const existing =
      await internalWithdrawalProviderRequestRepository.findByWithdrawal(
        normalized.withdrawalReference,
      );
    if (!existing) {
      this.fail(
        "Withdrawal provider request was not found.",
        "WITHDRAWAL_PROVIDER_EXECUTION_PROVIDER_MISSING",
      );
    }
    await withdrawalProviderInitializationService.validateReplay(
      normalized.withdrawalReference,
    );
    if (existing.isTerminal) {
      return this.validateReplay(
        normalized.withdrawalReference,
        normalized.outcome,
      );
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const committed = await this.executeTransaction(normalized);
        if (!committed) {
          this.fail(
            "Provider execution did not commit.",
            "WITHDRAWAL_PROVIDER_EXECUTION_TRANSACTION_CONFLICT",
          );
        }
        const validated = await this.validateReplay(
          normalized.withdrawalReference,
          normalized.outcome,
        );
        return { ...validated, replay: false };
      } catch (error) {
        lastError = error;
        const winner =
          await internalWithdrawalProviderRequestRepository.findByWithdrawal(
            normalized.withdrawalReference,
          );
        if (winner?.isTerminal) {
          return this.validateReplay(
            normalized.withdrawalReference,
            normalized.outcome,
          );
        }
        if (
          error instanceof WithdrawalProviderExecutionError &&
          error.code !==
            "WITHDRAWAL_PROVIDER_EXECUTION_TRANSACTION_CONFLICT"
        ) {
          throw error;
        }
        if (!isTransientTransactionError(error)) break;
      }
    }
    if (lastError instanceof WithdrawalProviderExecutionError) {
      throw lastError;
    }
    this.fail(
      "Withdrawal provider execution transaction failed.",
      "WITHDRAWAL_PROVIDER_EXECUTION_TRANSACTION_CONFLICT",
      lastError,
    );
  }
}

export const withdrawalProviderExecutionService =
  new WithdrawalProviderExecutionService();
