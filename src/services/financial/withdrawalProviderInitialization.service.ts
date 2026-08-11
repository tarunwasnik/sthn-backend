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
import {
  WithdrawalProviderInitializationError,
  WithdrawalProviderInitializationErrorCode,
} from "../../errors/financial/WithdrawalProviderInitializationError";
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
  deriveWithdrawalProviderIdentity,
  deriveWithdrawalProviderCreatorReference,
  INTERNAL_WITHDRAWAL_PROVIDER,
} from "../../utils/financial/withdrawalProviderIdentity.util";
import { createFinancialAudit } from "../auditLog.service";
import ProviderEventService from
  "../internalProvider/events/providerEvent.service";
import { creatorWithdrawalRequestService } from
  "./creatorWithdrawalRequest.service";

export type WithdrawalProviderInitializationStage =
  | "AFTER_PROVIDER_AUTHORITY"
  | "AFTER_PROVIDER_EVENT"
  | "BEFORE_INITIALIZATION"
  | "BEFORE_AUDIT"
  | "BEFORE_COMMIT";

type Identity = ReturnType<typeof deriveWithdrawalProviderIdentity>;

interface ProviderContext {
  withdrawal: CreatorWithdrawalRequestDocument;
  creatorReference: string;
  identity: Identity;
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

export class WithdrawalProviderInitializationService {
  constructor(
    private readonly onStage: (
      stage: WithdrawalProviderInitializationStage,
    ) => void | Promise<void> = () => undefined,
  ) {}

  private fail(
    message: string,
    code: WithdrawalProviderInitializationErrorCode,
    cause?: unknown,
  ): never {
    throw new WithdrawalProviderInitializationError(
      message,
      code,
      { cause },
    );
  }

  private ensureIdentity(
    providerRequest: InternalWithdrawalProviderRequestDocument,
    context: ProviderContext,
  ) {
    const { withdrawal, creatorReference, identity } = context;
    if (
      providerRequest.providerRequestReference !==
        identity.providerRequestReference ||
      providerRequest.providerRequestKey !== identity.providerRequestKey ||
      providerRequest.withdrawalReference !==
        withdrawal.withdrawalReference ||
      providerRequest.creatorReference !== creatorReference ||
      providerRequest.walletReference !== identity.walletReference ||
      providerRequest.destinationReference !==
        withdrawal.destinationReference ||
      providerRequest.currency !== withdrawal.currency ||
      providerRequest.amount !== withdrawal.amount ||
      providerRequest.providerFingerprint !== identity.providerFingerprint ||
      providerRequest.providerReference !== identity.providerReference
    ) {
      this.fail(
        "Withdrawal provider identity conflicts with immutable authority.",
        "WITHDRAWAL_PROVIDER_IDENTITY_CONFLICT",
      );
    }
  }

  private async resolveContext(
    withdrawalReference: string,
    session?: ClientSession,
    allowFinalized = false,
  ): Promise<ProviderContext> {
    const withdrawal =
      await creatorWithdrawalRequestRepository.findByReference(
        withdrawalReference,
        session,
      );
    if (!withdrawal) {
      this.fail(
        "Creator withdrawal request was not found.",
        "WITHDRAWAL_PROVIDER_WITHDRAWAL_MISSING",
      );
    }
    const reservationAuthorityPresent =
      (withdrawal.status === CreatorWithdrawalRequestStatus.RESERVED &&
        withdrawal.reservedAmount === withdrawal.amount) ||
      (allowFinalized &&
        [
          CreatorWithdrawalRequestStatus.COMPLETED,
          CreatorWithdrawalRequestStatus.FAILED,
        ].includes(withdrawal.status) &&
        withdrawal.reservedAmount === 0 &&
        Boolean(withdrawal.finalizationReference));
    if (
      !reservationAuthorityPresent ||
      !withdrawal.reservedAt ||
      !withdrawal.ledgerTransactionReference ||
      withdrawal.ledgerEntryIds.length !== 2 ||
      !withdrawal.projectionReference
    ) {
      this.fail(
        "Creator withdrawal reservation authority is missing.",
        "WITHDRAWAL_PROVIDER_RESERVATION_MISSING",
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
        "Active Creator authority is required for provider initialization.",
        "WITHDRAWAL_PROVIDER_RESERVATION_MISSING",
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
        "Verified payout destination was not found.",
        "WITHDRAWAL_PROVIDER_DESTINATION_MISSING",
      );
    }
    const identity = deriveWithdrawalProviderIdentity({
      withdrawalReference: withdrawal.withdrawalReference,
      creatorId: withdrawal.creatorId,
      creatorReference:
        deriveWithdrawalProviderCreatorReference(withdrawal.creatorId),
      walletId: withdrawal.walletId,
      destinationReference: withdrawal.destinationReference,
      currency: withdrawal.currency,
      amount: withdrawal.amount,
    });
    return {
      withdrawal,
      creatorReference:
        deriveWithdrawalProviderCreatorReference(withdrawal.creatorId),
      identity,
    };
  }

  private safe(
    providerRequest: InternalWithdrawalProviderRequestDocument,
    replay: boolean,
  ) {
    return {
      providerRequestReference: providerRequest.providerRequestReference,
      withdrawalReference: providerRequest.withdrawalReference,
      creatorReference: providerRequest.creatorReference,
      walletReference: providerRequest.walletReference,
      destinationReference: providerRequest.destinationReference,
      currency: providerRequest.currency,
      amount: providerRequest.amount,
      providerStatus: providerRequest.providerStatus,
      providerReference: providerRequest.providerReference,
      replay,
    };
  }

  private async recordEvent(
    providerRequest: InternalWithdrawalProviderRequestDocument,
    identity: Identity,
    eventType: ProviderEventType,
    operation: ProviderOperation,
    transitionKey: string,
    session: ClientSession,
  ) {
    return ProviderEventService.recordEvent({
      entityType: ProviderEntityType.WITHDRAWAL_PROVIDER_REQUEST,
      entityId: providerRequest._id as Types.ObjectId,
      eventType,
      operation,
      transitionKey,
      providerEntityId: providerRequest.providerRequestReference,
      providerReference: identity.providerReference,
      providerMetadata: {
        provider: INTERNAL_WITHDRAWAL_PROVIDER,
        environment: process.env.NODE_ENV ?? "development",
        simulationMode: ProviderSimulationMode.NORMAL,
        correlationId: providerRequest.withdrawalReference,
        requestId: providerRequest.providerRequestReference,
      },
      execution: {
        attemptNumber: 1,
        retryCount: 0,
        isTestMode: process.env.NODE_ENV === "test",
      },
      audit: {
        createdBy: INTERNAL_WITHDRAWAL_PROVIDER,
        lastStatusChangedAt: new Date(),
      },
      payloads: {
        request: {
          withdrawalReference: providerRequest.withdrawalReference,
          providerRequestReference:
            providerRequest.providerRequestReference,
        },
        response: {
          providerStatus: eventType ===
            ProviderEventType.WITHDRAWAL_PROVIDER_CREATED
            ? InternalWithdrawalProviderRequestStatus.CREATED
            : InternalWithdrawalProviderRequestStatus.INITIALIZED,
        },
      },
    }, session);
  }

  async validateReplay(withdrawalReference: string) {
    await creatorWithdrawalRequestService.validateReplay(withdrawalReference);
    const context = await this.resolveContext(
      withdrawalReference,
      undefined,
      true,
    );
    const providerRequest =
      await internalWithdrawalProviderRequestRepository.findByWithdrawal(
        withdrawalReference,
      );
    if (!providerRequest) {
      this.fail(
        "Withdrawal provider initialization was not found.",
        "WITHDRAWAL_PROVIDER_REPLAY_CONFLICT",
      );
    }
    this.ensureIdentity(providerRequest, context);
    if (
      ![
        InternalWithdrawalProviderRequestStatus.INITIALIZED,
        InternalWithdrawalProviderRequestStatus.PROCESSING,
        InternalWithdrawalProviderRequestStatus.SUCCEEDED,
        InternalWithdrawalProviderRequestStatus.FAILED,
      ].includes(providerRequest.providerStatus) ||
      providerRequest.version < 1 ||
      context.withdrawal.providerRequestReference !==
        providerRequest.providerRequestReference
    ) {
      this.fail(
        "Withdrawal provider initialization replay conflicts.",
        "WITHDRAWAL_PROVIDER_REPLAY_CONFLICT",
      );
    }
    const [events, audits] = await Promise.all([
      InternalProviderEventRepository.findMany({
        entityType: ProviderEntityType.WITHDRAWAL_PROVIDER_REQUEST,
        entityId: providerRequest._id,
        eventType: {
          $in: [
            ProviderEventType.WITHDRAWAL_PROVIDER_CREATED,
            ProviderEventType.WITHDRAWAL_PROVIDER_INITIALIZED,
          ],
        },
      }),
      AuditLog.find({
        action: AuditAction.CREATOR_WITHDRAWAL_PROVIDER_INITIALIZED,
        entityId: providerRequest._id,
        "financialContext.withdrawalReference": withdrawalReference,
      }),
    ]);
    const expectedEvents = [
      {
        eventType: ProviderEventType.WITHDRAWAL_PROVIDER_CREATED,
        operation: ProviderOperation.CREATE_WITHDRAWAL_PROVIDER_REQUEST,
        transitionKey: context.identity.createdTransitionKey,
      },
      {
        eventType: ProviderEventType.WITHDRAWAL_PROVIDER_INITIALIZED,
        operation: ProviderOperation.INITIALIZE_WITHDRAWAL_PROVIDER_REQUEST,
        transitionKey: context.identity.initializedTransitionKey,
      },
    ];
    if (
      events.length !== 2 ||
      !expectedEvents.every((expected) => events.some((event) =>
        event.eventType === expected.eventType &&
        event.operation === expected.operation &&
        event.transitionKey === expected.transitionKey &&
        event.providerEntityId === providerRequest.providerRequestReference &&
        event.providerReference === context.identity.providerReference &&
        event.providerMetadata.provider === INTERNAL_WITHDRAWAL_PROVIDER))
    ) {
      this.fail(
        "Withdrawal provider event chain conflicts.",
        "WITHDRAWAL_PROVIDER_EVENT_CONFLICT",
      );
    }
    const audit = audits[0];
    if (
      audits.length !== 1 ||
      audit.financialContext?.provider !== INTERNAL_WITHDRAWAL_PROVIDER ||
      audit.financialContext?.providerReference !==
        context.identity.providerReference ||
      audit.financialContext?.amount !== context.withdrawal.amount ||
      audit.financialContext?.currency !== context.withdrawal.currency ||
      audit.metadata?.destinationReference !==
        context.withdrawal.destinationReference ||
      audit.metadata?.creatorReference !== context.creatorReference
    ) {
      this.fail(
        "Withdrawal provider audit replay conflicts.",
        "WITHDRAWAL_PROVIDER_REPLAY_CONFLICT",
      );
    }
    return this.safe(providerRequest, true);
  }

  private async initializeTransaction(withdrawalReference: string) {
    const session = await mongoose.startSession();
    let committedReference: string | undefined;
    try {
      await session.withTransaction(async () => {
        const context = await this.resolveContext(
          withdrawalReference,
          session,
        );
        const { withdrawal, identity } = context;
        if (
          withdrawal.providerRequestReference &&
          withdrawal.providerRequestReference !==
            identity.providerRequestReference
        ) {
          this.fail(
            "Withdrawal is linked to a conflicting provider request.",
            "WITHDRAWAL_PROVIDER_PROVIDER_CONFLICT",
          );
        }
        let providerRequest =
          await internalWithdrawalProviderRequestRepository.findByWithdrawal(
            withdrawalReference,
            session,
          );
        if (providerRequest) {
          this.ensureIdentity(providerRequest, context);
          if (
            providerRequest.providerStatus ===
              InternalWithdrawalProviderRequestStatus.INITIALIZED &&
            withdrawal.providerRequestReference ===
              providerRequest.providerRequestReference
          ) {
            committedReference = providerRequest.providerRequestReference;
            return;
          }
          this.fail(
            "Existing provider authority is not a complete initialization.",
            "WITHDRAWAL_PROVIDER_PROVIDER_CONFLICT",
          );
        }
        const keyConflict =
          await internalWithdrawalProviderRequestRepository.findByKey(
            identity.providerRequestKey,
            session,
          );
        if (keyConflict) {
          this.fail(
            "Provider request key already belongs to another authority.",
            "WITHDRAWAL_PROVIDER_PROVIDER_CONFLICT",
          );
        }
        providerRequest =
          await internalWithdrawalProviderRequestRepository.create({
            providerRequestReference: identity.providerRequestReference,
            providerRequestKey: identity.providerRequestKey,
            withdrawalReference: withdrawal.withdrawalReference,
            creatorReference: context.creatorReference,
            walletReference: identity.walletReference,
            destinationReference: withdrawal.destinationReference,
            currency: withdrawal.currency,
            amount: withdrawal.amount,
            providerReference: identity.providerReference,
            providerFingerprint: identity.providerFingerprint,
          }, session);
        await this.onStage("AFTER_PROVIDER_AUTHORITY");
        await this.recordEvent(
          providerRequest,
          identity,
          ProviderEventType.WITHDRAWAL_PROVIDER_CREATED,
          ProviderOperation.CREATE_WITHDRAWAL_PROVIDER_REQUEST,
          identity.createdTransitionKey,
          session,
        );
        await this.onStage("AFTER_PROVIDER_EVENT");
        await this.onStage("BEFORE_INITIALIZATION");
        const initialized =
          await internalWithdrawalProviderRequestRepository.initialize(
            providerRequest.providerRequestReference,
            identity.providerFingerprint,
            identity.providerReference,
            providerRequest.version,
            session,
          );
        if (!initialized) {
          this.fail(
            "Provider initialization transition conflicted.",
            "WITHDRAWAL_PROVIDER_TRANSACTION_CONFLICT",
          );
        }
        const linked =
          await creatorWithdrawalRequestRepository.linkProviderInitialization({
            requestId: withdrawal._id as Types.ObjectId,
            withdrawalReference: withdrawal.withdrawalReference,
            providerRequestReference: initialized.providerRequestReference,
            expectedVersion: withdrawal.version,
          }, session);
        if (!linked) {
          this.fail(
            "Withdrawal provider reference transition conflicted.",
            "WITHDRAWAL_PROVIDER_TRANSACTION_CONFLICT",
          );
        }
        await this.recordEvent(
          initialized,
          identity,
          ProviderEventType.WITHDRAWAL_PROVIDER_INITIALIZED,
          ProviderOperation.INITIALIZE_WITHDRAWAL_PROVIDER_REQUEST,
          identity.initializedTransitionKey,
          session,
        );
        await this.onStage("BEFORE_AUDIT");
        await createFinancialAudit({
          action: AuditAction.CREATOR_WITHDRAWAL_PROVIDER_INITIALIZED,
          actor: {
            type: "PROVIDER",
            reference: INTERNAL_WITHDRAWAL_PROVIDER,
          },
          entityType: "INTERNAL_WITHDRAWAL_PROVIDER_REQUEST",
          entityId: initialized._id as Types.ObjectId,
          financialContext: {
            domain: "WITHDRAWAL",
            primaryReference: initialized.withdrawalReference,
            withdrawalReference: initialized.withdrawalReference,
            provider: INTERNAL_WITHDRAWAL_PROVIDER,
            providerReference: identity.providerReference,
            amount: initialized.amount,
            currency: initialized.currency,
          },
          transition: {
            fromStatus: InternalWithdrawalProviderRequestStatus.CREATED,
            toStatus: InternalWithdrawalProviderRequestStatus.INITIALIZED,
            outcome: "SUCCEEDED",
          },
          metadata: {
            creatorReference: initialized.creatorReference,
            walletReference: initialized.walletReference,
            destinationReference: initialized.destinationReference,
            providerStatus:
              InternalWithdrawalProviderRequestStatus.INITIALIZED,
            reasonCode: "WITHDRAWAL_PROVIDER_IDENTITY_ESTABLISHED",
          },
          session,
        });
        await this.onStage("BEFORE_COMMIT");
        committedReference = initialized.providerRequestReference;
      });
      return committedReference;
    } finally {
      await session.endSession();
    }
  }

  async initialize(withdrawalReference: string) {
    if (
      typeof withdrawalReference !== "string" ||
      !withdrawalReference.trim()
    ) {
      this.fail(
        "Creator withdrawal request was not found.",
        "WITHDRAWAL_PROVIDER_WITHDRAWAL_MISSING",
      );
    }
    const reference = withdrawalReference.trim();
    const existing =
      await internalWithdrawalProviderRequestRepository.findByWithdrawal(
        reference,
      );
    if (existing) return this.validateReplay(reference);
    await this.resolveContext(reference);
    try {
      await creatorWithdrawalRequestService.validateReplay(reference);
    } catch (error) {
      this.fail(
        "Creator withdrawal reservation authority is missing.",
        "WITHDRAWAL_PROVIDER_RESERVATION_MISSING",
        error,
      );
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const committedReference = await this.initializeTransaction(reference);
        if (!committedReference) {
          this.fail(
            "Provider initialization did not commit.",
            "WITHDRAWAL_PROVIDER_TRANSACTION_CONFLICT",
          );
        }
        const validated = await this.validateReplay(reference);
        return { ...validated, replay: false };
      } catch (error) {
        lastError = error;
        const winner =
          await internalWithdrawalProviderRequestRepository.findByWithdrawal(
            reference,
          );
        if (winner) return this.validateReplay(reference);
        if (
          error instanceof WithdrawalProviderInitializationError &&
          error.code !== "WITHDRAWAL_PROVIDER_TRANSACTION_CONFLICT"
        ) {
          throw error;
        }
        if (!isTransientTransactionError(error)) break;
      }
    }
    if (lastError instanceof WithdrawalProviderInitializationError) {
      throw lastError;
    }
    this.fail(
      "Withdrawal provider initialization transaction failed.",
      "WITHDRAWAL_PROVIDER_TRANSACTION_CONFLICT",
      lastError,
    );
  }
}

export const withdrawalProviderInitializationService =
  new WithdrawalProviderInitializationService();
