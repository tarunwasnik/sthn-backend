// backend/src/services/internalProvider/settlements/providerSettlement.service.ts

import { Types, UpdateQuery } from "mongoose";

import InternalSettlementRepository from "../../../repositories/internalProvider/internalSettlement.repository";

import {
  ProviderEntityType,
  ProviderEventType,
  ProviderFailureReason,
  ProviderOperation,
  ProviderSettlementStatus,
} from "../../../constants/internalProvider";

import { InternalSettlementDocument } from "../../../models/internalProvider/internalSettlement.model";

import ProviderClockService from "../base/providerClock.service";
import ProviderEventService from "../events/providerEvent.service";

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Settlement Service
 * ------------------------------------------------------------------
 *
 * Responsible for managing the lifecycle of simulated provider
 * settlements.
 *
 * Every settlement lifecycle transition records an immutable
 * provider event.
 *
 * This service owns ONLY provider settlement execution state.
 *
 * Financial ownership remains with the Financial Domain.
 * ------------------------------------------------------------------
 */

export class ProviderSettlementService {
  /**
   * -------------------------------------------------------------
   * Records an immutable settlement provider event.
   * -------------------------------------------------------------
   */
  private async recordSettlementEvent(
    settlement: InternalSettlementDocument,
    eventType: ProviderEventType,
    operation: ProviderOperation,
  ): Promise<void> {
    await ProviderEventService.recordEvent({
      entityType: ProviderEntityType.SETTLEMENT,

      entityId: settlement._id as Types.ObjectId,

      eventType,
      operation,

      providerEntityId: settlement.providerSettlementId,

      providerPaymentId: settlement.providerPaymentId,

      providerReference: settlement.providerReference ?? undefined,

      providerMetadata: settlement.providerMetadata,

      execution: settlement.execution,

      audit: settlement.audit,

      payloads: settlement.payloads,
    });
  }

  /**
   * -------------------------------------------------------------
   * Creates a provider settlement.
   * -------------------------------------------------------------
   */
  async createSettlement(
    data: Partial<InternalSettlementDocument>,
  ): Promise<InternalSettlementDocument> {
    const settlement = await InternalSettlementRepository.create({
      ...data,

      status: ProviderSettlementStatus.CREATED,

      isTerminal: false,
    });

    await this.recordSettlementEvent(
      settlement,
      ProviderEventType.SETTLEMENT_CREATED,
      ProviderOperation.CREATE_SETTLEMENT,
    );

    return settlement;
  }

  /**
   * -------------------------------------------------------------
   * Marks settlement as scheduled.
   * -------------------------------------------------------------
   */
  async scheduleSettlement(
    settlementId: Types.ObjectId | string,
  ): Promise<InternalSettlementDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalSettlementDocument> = {
      status: ProviderSettlementStatus.SCHEDULED,

      scheduledAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const settlement = await InternalSettlementRepository.updateById(
      settlementId,
      update,
    );

    if (!settlement) {
      return null;
    }

    await this.recordSettlementEvent(
      settlement,
      ProviderEventType.SETTLEMENT_SCHEDULED,
      ProviderOperation.SCHEDULE_SETTLEMENT,
    );

    return settlement;
  }

  /**
   * -------------------------------------------------------------
   * Marks settlement as processing.
   * -------------------------------------------------------------
   */
  async processSettlement(
    settlementId: Types.ObjectId | string,
  ): Promise<InternalSettlementDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalSettlementDocument> = {
      status: ProviderSettlementStatus.PROCESSING,

      processingAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const settlement = await InternalSettlementRepository.updateById(
      settlementId,
      update,
    );

    if (!settlement) {
      return null;
    }

    await this.recordSettlementEvent(
      settlement,
      ProviderEventType.SETTLEMENT_PROCESSING,
      ProviderOperation.PROCESS_SETTLEMENT,
    );

    return settlement;
  }
  /**
   * -------------------------------------------------------------
   * Marks settlement as completed.
   * -------------------------------------------------------------
   */
  async completeSettlement(
    settlementId: Types.ObjectId | string,
  ): Promise<InternalSettlementDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalSettlementDocument> = {
      status: ProviderSettlementStatus.SETTLED,

      isTerminal: true,

      settledAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const settlement = await InternalSettlementRepository.updateById(
      settlementId,
      update,
    );

    if (!settlement) {
      return null;
    }

    await this.recordSettlementEvent(
      settlement,
      ProviderEventType.SETTLEMENT_COMPLETED,
      ProviderOperation.COMPLETE_SETTLEMENT,
    );

    return settlement;
  }

  /**
   * -------------------------------------------------------------
   * Marks settlement as partially settled.
   * -------------------------------------------------------------
   */
  async partiallySettle(
    settlementId: Types.ObjectId | string,
  ): Promise<InternalSettlementDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalSettlementDocument> = {
      status: ProviderSettlementStatus.PARTIALLY_SETTLED,

      "audit.lastStatusChangedAt": now,
    };

    const settlement = await InternalSettlementRepository.updateById(
      settlementId,
      update,
    );

    if (!settlement) {
      return null;
    }

    await this.recordSettlementEvent(
      settlement,
      ProviderEventType.SETTLEMENT_PARTIALLY_COMPLETED,
      ProviderOperation.PARTIAL_SETTLEMENT,
    );

    return settlement;
  }

  /**
   * -------------------------------------------------------------
   * Marks settlement as failed.
   * -------------------------------------------------------------
   */
  async failSettlement(
    settlementId: Types.ObjectId | string,
    reason: ProviderFailureReason,
  ): Promise<InternalSettlementDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalSettlementDocument> = {
      status: ProviderSettlementStatus.FAILED,

      failureReason: reason,

      isTerminal: true,

      failedAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const settlement = await InternalSettlementRepository.updateById(
      settlementId,
      update,
    );

    if (!settlement) {
      return null;
    }

    await this.recordSettlementEvent(
      settlement,
      ProviderEventType.SETTLEMENT_FAILED,
      ProviderOperation.FAIL_SETTLEMENT,
    );

    return settlement;
  }

  /**
   * -------------------------------------------------------------
   * Cancels a provider settlement.
   * -------------------------------------------------------------
   */
  async cancelSettlement(
    settlementId: Types.ObjectId | string,
  ): Promise<InternalSettlementDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalSettlementDocument> = {
      status: ProviderSettlementStatus.CANCELLED,

      isTerminal: true,

      cancelledAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const settlement = await InternalSettlementRepository.updateById(
      settlementId,
      update,
    );

    if (!settlement) {
      return null;
    }

    await this.recordSettlementEvent(
      settlement,
      ProviderEventType.SETTLEMENT_CANCELLED,
      ProviderOperation.CANCEL_SETTLEMENT,
    );

    return settlement;
  }
  /**
   * -------------------------------------------------------------
   * Marks settlement as expired.
   * -------------------------------------------------------------
   */
  async expireSettlement(
    settlementId: Types.ObjectId | string,
  ): Promise<InternalSettlementDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalSettlementDocument> = {
      status: ProviderSettlementStatus.EXPIRED,

      isTerminal: true,

      expiredAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const settlement = await InternalSettlementRepository.updateById(
      settlementId,
      update,
    );

    if (!settlement) {
      return null;
    }

    await this.recordSettlementEvent(
      settlement,
      ProviderEventType.SETTLEMENT_EXPIRED,
      ProviderOperation.EXPIRE_SETTLEMENT,
    );

    return settlement;
  }

  /**
   * -------------------------------------------------------------
   * Finds a provider settlement by Mongo id.
   * -------------------------------------------------------------
   */
  async findById(
    settlementId: Types.ObjectId | string,
  ): Promise<InternalSettlementDocument | null> {
    return InternalSettlementRepository.findById(settlementId);
  }

  /**
   * -------------------------------------------------------------
   * Finds a provider settlement using the Financial Domain
   * settlement id.
   * -------------------------------------------------------------
   */
  async findBySettlementId(
    settlementId: Types.ObjectId,
  ): Promise<InternalSettlementDocument | null> {
    return InternalSettlementRepository.findBySettlementId(settlementId);
  }

  /**
   * -------------------------------------------------------------
   * Finds a provider settlement using the provider settlement id.
   * -------------------------------------------------------------
   */
  async findByProviderSettlementId(
    providerSettlementId: string,
  ): Promise<InternalSettlementDocument | null> {
    return InternalSettlementRepository.findByProviderSettlementId(
      providerSettlementId,
    );
  }

  /**
   * -------------------------------------------------------------
   * Finds a provider settlement using the provider payment id.
   * -------------------------------------------------------------
   */
  async findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<InternalSettlementDocument | null> {
    return InternalSettlementRepository.findByProviderPaymentId(
      providerPaymentId,
    );
  }

  /**
   * -------------------------------------------------------------
   * Finds a provider settlement using the idempotency key.
   * -------------------------------------------------------------
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<InternalSettlementDocument | null> {
    return InternalSettlementRepository.findByIdempotencyKey(idempotencyKey);
  }
}

export default new ProviderSettlementService();
