// backend/src/services/internalProvider/payouts/providerPayout.service.ts

import mongoose, { ClientSession, Types, UpdateQuery } from "mongoose";

import InternalPayoutRepository from "../../../repositories/internalProvider/internalPayout.repository";

import {
  ProviderEntityType,
  ProviderEventType,
  ProviderFailureReason,
  ProviderOperation,
  ProviderPayoutSimulationAction,
  ProviderPayoutStatus,
} from "../../../constants/internalProvider";

import { InternalPayoutDocument } from "../../../models/internalProvider/internalPayout.model";

import ProviderClockService from "../base/providerClock.service";
import ProviderEventService from "../events/providerEvent.service";
import ProviderIdService from "../base/providerId.service";
import { ProviderSimulatorError } from "../../../errors/internalProvider/ProviderSimulatorError";

export interface SimulateProviderPayoutTransitionInput {
  providerPayoutId: string;
  action: ProviderPayoutSimulationAction;
  adminId: string;
  failureCode?: string;
  failureMessage?: string;
  note?: string;
}

export interface SimulateProviderPayoutTransitionResult {
  payout: InternalPayoutDocument;
  previousStatus: ProviderPayoutStatus;
  idempotent: boolean;
}

export interface CreateWithdrawalProviderPayoutInput {
  payoutId: Types.ObjectId;
  providerPayoutId: string;
  providerReference?: string;
  idempotencyKey: string;
  providerDestination: NonNullable<InternalPayoutDocument["providerDestination"]>;
  providerMetadata: InternalPayoutDocument["providerMetadata"];
  execution: InternalPayoutDocument["execution"];
  audit: InternalPayoutDocument["audit"];
  payloads: InternalPayoutDocument["payloads"];
}

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Payout Service
 * ------------------------------------------------------------------
 *
 * Responsible for managing the lifecycle of simulated provider
 * payouts.
 *
 * Every payout lifecycle transition records an immutable
 * provider event.
 *
 * This service owns ONLY provider payout execution state.
 *
 * Financial ownership remains with the Financial Domain.
 * ------------------------------------------------------------------
 */

export class ProviderPayoutService {
  /**
   * -------------------------------------------------------------
   * Records an immutable payout provider event.
   * -------------------------------------------------------------
   */
  private async recordPayoutEvent(
    payout: InternalPayoutDocument,
    eventType: ProviderEventType,
    operation: ProviderOperation,
    session?: ClientSession,
  ): Promise<void> {
    await ProviderEventService.recordEvent({
      entityType: ProviderEntityType.PAYOUT,

      entityId: payout._id as Types.ObjectId,

      eventType,
      operation,

      providerEntityId: payout.providerPayoutId,

      providerPaymentId: payout.providerPaymentId,

      providerReference: payout.providerReference ?? undefined,

      providerMetadata: payout.providerMetadata,

      execution: payout.execution,

      audit: payout.audit,

      payloads: payout.payloads,
    }, session);
  }

  /**
   * Executes a trusted admin simulator command against provider-owned payout
   * state. The conditional update and append-only event share one transaction.
   */
  async simulatePayoutTransition(
    input: SimulateProviderPayoutTransitionInput,
  ): Promise<SimulateProviderPayoutTransitionResult> {
    const session = await mongoose.startSession();
    let result: SimulateProviderPayoutTransitionResult | null = null;

    try {
      await session.withTransaction(async () => {
        const current = await InternalPayoutRepository.findByProviderPayoutId(
          input.providerPayoutId,
          session,
        );

        if (!current) {
          throw new ProviderSimulatorError(
            "Internal Provider payout not found.",
            "PROVIDER_PAYOUT_NOT_FOUND",
            404,
          );
        }

        const targetStatus = this.getSimulationTargetStatus(input.action);
        const previousStatus = current.status;

        if (current.status === targetStatus) {
          result = { payout: current, previousStatus, idempotent: true };
          return;
        }

        if (current.isTerminal) {
          throw new ProviderSimulatorError(
            `Cannot apply ${input.action} to terminal provider payout ${current.status}.`,
            "PROVIDER_PAYOUT_TERMINAL_CONFLICT",
            409,
          );
        }

        const now = ProviderClockService.now();
        const update = this.buildSimulationUpdate(current, input, now);
        const payout = await InternalPayoutRepository.updateOne(
          {
            _id: current._id,
            status: current.status,
            isTerminal: false,
          },
          update,
          session,
        );

        if (!payout) {
          throw new ProviderSimulatorError(
            "Provider payout state changed concurrently. Retry the simulation command.",
            "PROVIDER_PAYOUT_TRANSITION_CONFLICT",
            409,
          );
        }

        const { eventType, operation } = this.getSimulationEvent(input.action);
        await this.recordPayoutEvent(payout, eventType, operation, session);

        result = { payout, previousStatus, idempotent: false };
      });
    } finally {
      await session.endSession();
    }

    if (!result) {
      throw new ProviderSimulatorError(
        "Provider payout simulation did not complete.",
        "PROVIDER_PAYOUT_SIMULATION_FAILED",
        500,
      );
    }

    return result;
  }

  private getSimulationTargetStatus(
    action: ProviderPayoutSimulationAction,
  ): ProviderPayoutStatus {
    switch (action) {
      case ProviderPayoutSimulationAction.PROCESS:
        return ProviderPayoutStatus.PROCESSING;
      case ProviderPayoutSimulationAction.COMPLETE:
        return ProviderPayoutStatus.PAID;
      case ProviderPayoutSimulationAction.FAIL:
        return ProviderPayoutStatus.FAILED;
      case ProviderPayoutSimulationAction.CANCEL:
        return ProviderPayoutStatus.CANCELLED;
      case ProviderPayoutSimulationAction.EXPIRE:
        return ProviderPayoutStatus.EXPIRED;
    }
  }

  private buildSimulationUpdate(
    current: InternalPayoutDocument,
    input: SimulateProviderPayoutTransitionInput,
    now: Date,
  ): UpdateQuery<InternalPayoutDocument> {
    const targetStatus = this.getSimulationTargetStatus(input.action);
    const update: UpdateQuery<InternalPayoutDocument> = {
      status: targetStatus,
      simulated: true,
      simulatedAction: input.action,
      simulatedAt: now,
      simulatedByAdminId: input.adminId,
      simulationNote: input.note ?? current.simulationNote,
      "audit.updatedBy": "ProviderSimulatorService",
      "audit.lastStatusChangedAt": now,
    };

    switch (input.action) {
      case ProviderPayoutSimulationAction.PROCESS:
        update.processingAt = current.processingAt ?? now;
        break;
      case ProviderPayoutSimulationAction.COMPLETE:
        update.isTerminal = true;
        update.paidAt = current.paidAt ?? now;
        update.providerTransactionId =
          current.providerTransactionId ??
          ProviderIdService.generatePayoutTransactionId();
        break;
      case ProviderPayoutSimulationAction.FAIL:
        update.isTerminal = true;
        update.failedAt = current.failedAt ?? now;
        update.failureReason = ProviderFailureReason.PAYOUT_FAILED;
        update.failureCode = input.failureCode ?? "SIMULATED_PROVIDER_FAILURE";
        update.failureMessage =
          input.failureMessage ?? "Simulated terminal provider payout failure.";
        break;
      case ProviderPayoutSimulationAction.CANCEL:
        update.isTerminal = true;
        update.cancelledAt = current.cancelledAt ?? now;
        update.failureReason = ProviderFailureReason.ADMIN_CANCELLED;
        update.failureCode = "SIMULATED_PROVIDER_CANCELLED";
        update.failureMessage = input.failureMessage ?? "Provider payout cancelled by administrator.";
        break;
      case ProviderPayoutSimulationAction.EXPIRE:
        update.isTerminal = true;
        update.expiredAt = current.expiredAt ?? now;
        update.failureReason = ProviderFailureReason.TIMEOUT;
        update.failureCode = "SIMULATED_PROVIDER_EXPIRED";
        update.failureMessage = input.failureMessage ?? "Provider payout expired.";
        break;
    }

    return update;
  }

  private getSimulationEvent(
    action: ProviderPayoutSimulationAction,
  ): { eventType: ProviderEventType; operation: ProviderOperation } {
    switch (action) {
      case ProviderPayoutSimulationAction.PROCESS:
        return {
          eventType: ProviderEventType.PAYOUT_PROCESSING,
          operation: ProviderOperation.PROCESS_PAYOUT,
        };
      case ProviderPayoutSimulationAction.COMPLETE:
        return {
          eventType: ProviderEventType.PAYOUT_COMPLETED,
          operation: ProviderOperation.COMPLETE_PAYOUT,
        };
      case ProviderPayoutSimulationAction.FAIL:
        return {
          eventType: ProviderEventType.PAYOUT_FAILED,
          operation: ProviderOperation.FAIL_PAYOUT,
        };
      case ProviderPayoutSimulationAction.CANCEL:
        return {
          eventType: ProviderEventType.PAYOUT_CANCELLED,
          operation: ProviderOperation.CANCEL_PAYOUT,
        };
      case ProviderPayoutSimulationAction.EXPIRE:
        return {
          eventType: ProviderEventType.PAYOUT_EXPIRED,
          operation: ProviderOperation.EXPIRE_PAYOUT,
        };
    }
  }

  /**
   * -------------------------------------------------------------
   * Creates a provider payout.
   * -------------------------------------------------------------
   */
  async createPayout(
    data: Partial<InternalPayoutDocument>,
  ): Promise<InternalPayoutDocument> {
    return this.createPayoutWithCreatedEvent(data);
  }

  /** Secure creation path for new withdrawal-originated Phase 6E payouts. */
  async createWithdrawalPayout(
    data: CreateWithdrawalProviderPayoutInput,
  ): Promise<InternalPayoutDocument> {
    this.validateWithdrawalPayoutCreation(data);
    return this.createPayoutWithCreatedEvent(data);
  }

  private async createPayoutWithCreatedEvent(
    data: Partial<InternalPayoutDocument>,
  ): Promise<InternalPayoutDocument> {
    const session = await mongoose.startSession();
    let created: InternalPayoutDocument | null = null;

    try {
      await session.withTransaction(async () => {
        const payout = await InternalPayoutRepository.create(
          {
            ...data,
            status: ProviderPayoutStatus.CREATED,
            isTerminal: false,
          },
          session,
        );

        await this.recordPayoutEvent(
          payout,
          ProviderEventType.PAYOUT_CREATED,
          ProviderOperation.CREATE_PAYOUT,
          session,
        );
        created = payout;
      });
    } finally {
      await session.endSession();
    }

    if (!created) {
      throw new ProviderSimulatorError(
        "Provider payout creation did not complete.",
        "PROVIDER_PAYOUT_CREATE_FAILED",
        500,
      );
    }

    return created;
  }

  private validateWithdrawalPayoutCreation(
    data: CreateWithdrawalProviderPayoutInput,
  ): void {
    const destination = data.providerDestination;
    if (
      !data.payoutId ||
      !data.providerPayoutId ||
      !data.idempotencyKey ||
      !destination ||
      destination.version !== 1 ||
      destination.sourceSnapshotVersion !== 1 ||
      !destination.fingerprint ||
      !destination.encryptedPayload
    ) {
      throw new ProviderSimulatorError(
        "Provider payout destination is required.",
        "PROVIDER_PAYOUT_DESTINATION_REQUIRED",
        400,
      );
    }
  }

  /**
   * -------------------------------------------------------------
   * Marks payout as scheduled.
   * -------------------------------------------------------------
   */
  async schedulePayout(
    payoutId: Types.ObjectId | string,
  ): Promise<InternalPayoutDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalPayoutDocument> = {
      status: ProviderPayoutStatus.SCHEDULED,

      scheduledAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const payout = await InternalPayoutRepository.updateById(payoutId, update);

    if (!payout) {
      return null;
    }

    await this.recordPayoutEvent(
      payout,
      ProviderEventType.PAYOUT_SCHEDULED,
      ProviderOperation.SCHEDULE_PAYOUT,
    );

    return payout;
  }

  /**
   * -------------------------------------------------------------
   * Marks payout as processing.
   * -------------------------------------------------------------
   */
  async processPayout(
    payoutId: Types.ObjectId | string,
  ): Promise<InternalPayoutDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalPayoutDocument> = {
      status: ProviderPayoutStatus.PROCESSING,

      processingAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const payout = await InternalPayoutRepository.updateById(payoutId, update);

    if (!payout) {
      return null;
    }

    await this.recordPayoutEvent(
      payout,
      ProviderEventType.PAYOUT_PROCESSING,
      ProviderOperation.PROCESS_PAYOUT,
    );

    return payout;
  }
  /**
   * -------------------------------------------------------------
   * Marks payout as initiated.
   * -------------------------------------------------------------
   */
  async initiatePayout(
    payoutId: Types.ObjectId | string,
  ): Promise<InternalPayoutDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalPayoutDocument> = {
      status: ProviderPayoutStatus.INITIATED,

      "audit.lastStatusChangedAt": now,
    };

    const payout = await InternalPayoutRepository.updateById(payoutId, update);

    if (!payout) {
      return null;
    }

    await this.recordPayoutEvent(
      payout,
      ProviderEventType.PAYOUT_INITIATED,
      ProviderOperation.INITIATE_PAYOUT,
    );

    return payout;
  }

  /**
   * -------------------------------------------------------------
   * Marks payout as completed.
   * -------------------------------------------------------------
   */
  async completePayout(
    payoutId: Types.ObjectId | string,
  ): Promise<InternalPayoutDocument | null> {
    const existing = await InternalPayoutRepository.findById(payoutId);

    if (existing?.isTerminal) {
      return existing;
    }

    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalPayoutDocument> = {
      status: ProviderPayoutStatus.PAID,

      isTerminal: true,

      paidAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const payout = await InternalPayoutRepository.updateById(payoutId, update);

    if (!payout) {
      return null;
    }

    await this.recordPayoutEvent(
      payout,
      ProviderEventType.PAYOUT_COMPLETED,
      ProviderOperation.COMPLETE_PAYOUT,
    );

    return payout;
  }

  /**
   * -------------------------------------------------------------
   * Marks payout as partially paid.
   * -------------------------------------------------------------
   */
  async partiallyPay(
    payoutId: Types.ObjectId | string,
  ): Promise<InternalPayoutDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalPayoutDocument> = {
      status: ProviderPayoutStatus.PARTIALLY_PAID,

      "audit.lastStatusChangedAt": now,
    };

    const payout = await InternalPayoutRepository.updateById(payoutId, update);

    if (!payout) {
      return null;
    }

    await this.recordPayoutEvent(
      payout,
      ProviderEventType.PAYOUT_PARTIALLY_COMPLETED,
      ProviderOperation.PARTIAL_PAYOUT,
    );

    return payout;
  }

  /**
   * -------------------------------------------------------------
   * Marks payout as failed.
   * -------------------------------------------------------------
   */
  async failPayout(
    payoutId: Types.ObjectId | string,
    reason: ProviderFailureReason,
  ): Promise<InternalPayoutDocument | null> {
    const existing = await InternalPayoutRepository.findById(payoutId);

    if (existing?.isTerminal) {
      return existing;
    }

    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalPayoutDocument> = {
      status: ProviderPayoutStatus.FAILED,

      failureReason: reason,

      isTerminal: true,

      failedAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const payout = await InternalPayoutRepository.updateById(payoutId, update);

    if (!payout) {
      return null;
    }

    await this.recordPayoutEvent(
      payout,
      ProviderEventType.PAYOUT_FAILED,
      ProviderOperation.FAIL_PAYOUT,
    );

    return payout;
  }
  /**
   * -------------------------------------------------------------
   * Cancels a provider payout.
   * -------------------------------------------------------------
   */
  async cancelPayout(
    payoutId: Types.ObjectId | string,
  ): Promise<InternalPayoutDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalPayoutDocument> = {
      status: ProviderPayoutStatus.CANCELLED,

      isTerminal: true,

      cancelledAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const payout = await InternalPayoutRepository.updateById(payoutId, update);

    if (!payout) {
      return null;
    }

    await this.recordPayoutEvent(
      payout,
      ProviderEventType.PAYOUT_CANCELLED,
      ProviderOperation.CANCEL_PAYOUT,
    );

    return payout;
  }

  /**
   * -------------------------------------------------------------
   * Marks payout as expired.
   * -------------------------------------------------------------
   */
  async expirePayout(
    payoutId: Types.ObjectId | string,
  ): Promise<InternalPayoutDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalPayoutDocument> = {
      status: ProviderPayoutStatus.EXPIRED,

      isTerminal: true,

      expiredAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const payout = await InternalPayoutRepository.updateById(payoutId, update);

    if (!payout) {
      return null;
    }

    await this.recordPayoutEvent(
      payout,
      ProviderEventType.PAYOUT_EXPIRED,
      ProviderOperation.EXPIRE_PAYOUT,
    );

    return payout;
  }

  /**
   * -------------------------------------------------------------
   * Marks payout as reversed.
   * -------------------------------------------------------------
   */
  async reversePayout(
    payoutId: Types.ObjectId | string,
  ): Promise<InternalPayoutDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalPayoutDocument> = {
      status: ProviderPayoutStatus.REVERSED,

      isTerminal: true,

      "audit.lastStatusChangedAt": now,
    };

    const payout = await InternalPayoutRepository.updateById(payoutId, update);

    if (!payout) {
      return null;
    }

    await this.recordPayoutEvent(
      payout,
      ProviderEventType.PAYOUT_REVERSED,
      ProviderOperation.REVERSE_PAYOUT,
    );

    return payout;
  }

  /**
   * -------------------------------------------------------------
   * Finds a provider payout by Mongo id.
   * -------------------------------------------------------------
   */
  async findById(
    payoutId: Types.ObjectId | string,
  ): Promise<InternalPayoutDocument | null> {
    return InternalPayoutRepository.findById(payoutId);
  }

  /**
   * -------------------------------------------------------------
   * Finds a provider payout using the Financial Domain payout id.
   * -------------------------------------------------------------
   */
  async findByPayoutId(
    payoutId: Types.ObjectId,
  ): Promise<InternalPayoutDocument | null> {
    return InternalPayoutRepository.findByPayoutId(payoutId);
  }

  /**
   * -------------------------------------------------------------
   * Finds a provider payout using the provider payout id.
   * -------------------------------------------------------------
   */
  async findByProviderPayoutId(
    providerPayoutId: string,
  ): Promise<InternalPayoutDocument | null> {
    return InternalPayoutRepository.findByProviderPayoutId(providerPayoutId);
  }

  /**
   * -------------------------------------------------------------
   * Finds a provider payout using the provider settlement id.
   * -------------------------------------------------------------
   */
  async findByProviderSettlementId(
    providerSettlementId: string,
  ): Promise<InternalPayoutDocument | null> {
    return InternalPayoutRepository.findByProviderSettlementId(
      providerSettlementId,
    );
  }

  /**
   * -------------------------------------------------------------
   * Finds a provider payout using the provider payment id.
   * -------------------------------------------------------------
   */
  async findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<InternalPayoutDocument | null> {
    return InternalPayoutRepository.findByProviderPaymentId(providerPaymentId);
  }

  /**
   * -------------------------------------------------------------
   * Finds a provider payout using the idempotency key.
   * -------------------------------------------------------------
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<InternalPayoutDocument | null> {
    return InternalPayoutRepository.findByIdempotencyKey(idempotencyKey);
  }

  async findByIdempotencyKeyForDestinationConsistency(
    idempotencyKey: string,
  ): Promise<InternalPayoutDocument | null> {
    return InternalPayoutRepository.findByIdempotencyKeyForDestinationConsistency(
      idempotencyKey,
    );
  }
}

export default new ProviderPayoutService();
