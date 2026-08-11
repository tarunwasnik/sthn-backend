// backend/src/services/internalProvider/refunds/providerRefund.service.ts

import mongoose, { ClientSession, Types, UpdateQuery } from "mongoose";

import InternalRefundRepository from "../../../repositories/internalProvider/internalRefund.repository";

import {
  ProviderEntityType,
  ProviderEventType,
  ProviderFailureReason,
  ProviderOperation,
  ProviderRefundStatus,
} from "../../../constants/internalProvider";

import { InternalRefundDocument } from "../../../models/internalProvider/internalRefund.model";

import ProviderClockService from "../base/providerClock.service";
import ProviderEventService from "../events/providerEvent.service";

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Refund Service
 * ------------------------------------------------------------------
 *
 * Responsible for managing the lifecycle of simulated provider
 * refunds.
 *
 * Every refund lifecycle transition records an immutable provider
 * event.
 *
 * This service owns ONLY provider refund execution state.
 *
 * Financial ownership remains with the Financial Domain.
 * ------------------------------------------------------------------
 */

export class ProviderRefundService {
  /**
   * -------------------------------------------------------------
   * Records an immutable refund provider event.
   * -------------------------------------------------------------
   */
  private async recordRefundEvent(
    refund: InternalRefundDocument,
    eventType: ProviderEventType,
    operation: ProviderOperation,
    session?: ClientSession,
  ): Promise<void> {
    await ProviderEventService.recordEvent({
      entityType: ProviderEntityType.REFUND,

      entityId: refund._id as Types.ObjectId,

      eventType,
      operation,
      transitionKey: `internal-refund:${refund.providerRefundId}:${operation}`,

      providerEntityId: refund.providerRefundId,

      providerPaymentId: refund.providerPaymentId,

      providerReference: refund.providerReference ?? undefined,

      providerMetadata: refund.providerMetadata,

      execution: refund.execution,

      audit: refund.audit,

      payloads: refund.payloads,
    }, session);
  }

  /**
   * -------------------------------------------------------------
   * Creates a provider refund.
   * -------------------------------------------------------------
   */
  async createRefund(
    data: Partial<InternalRefundDocument>,
  ): Promise<InternalRefundDocument> {
    const session = await mongoose.startSession();
    let created: InternalRefundDocument | null = null;
    try { await session.withTransaction(async () => {
      const refund = await InternalRefundRepository.create({ ...data, status: ProviderRefundStatus.CREATED, isTerminal: false }, session);
      await this.recordRefundEvent(refund, ProviderEventType.REFUND_CREATED, ProviderOperation.CREATE_REFUND, session);
      created = refund;
    }); } finally { await session.endSession(); }
    if (!created) throw new Error("Provider refund creation did not complete.");
    return created;
  }

  private async transition(
    refundId: Types.ObjectId | string,
    expectedStatus: ProviderRefundStatus,
    update: UpdateQuery<InternalRefundDocument>,
    eventType: ProviderEventType,
    operation: ProviderOperation,
  ): Promise<InternalRefundDocument | null> {
    const session = await mongoose.startSession();
    let result: InternalRefundDocument | null = null;
    try { await session.withTransaction(async () => {
      const current = await InternalRefundRepository.findById(refundId);
      if (!current) return;
      if (current.status === ProviderRefundStatus.REFUNDED && eventType === ProviderEventType.REFUND_COMPLETED) { result = current; return; }
      if (current.status === ProviderRefundStatus.PROCESSING && eventType === ProviderEventType.REFUND_PROCESSING) { result = current; return; }
      result = await InternalRefundRepository.updateOne({ _id: current._id, status: expectedStatus, isTerminal: false }, update, session);
      if (!result) return;
      await this.recordRefundEvent(result, eventType, operation, session);
    }); } finally { await session.endSession(); }
    return result;
  }

  /**
   * -------------------------------------------------------------
   * Marks refund as processing.
   * -------------------------------------------------------------
   */
  async processRefund(
    refundId: Types.ObjectId | string,
  ): Promise<InternalRefundDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalRefundDocument> = {
      status: ProviderRefundStatus.PROCESSING,

      processingStartedAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const refund = await this.transition(refundId, ProviderRefundStatus.CREATED, update, ProviderEventType.REFUND_PROCESSING, ProviderOperation.PROCESS_REFUND);

    if (!refund) {
      return null;
    }

    return refund;
  }

  /**
   * -------------------------------------------------------------
   * Marks refund as completed.
   * -------------------------------------------------------------
   */
  async completeRefund(
    refundId: Types.ObjectId | string,
  ): Promise<InternalRefundDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalRefundDocument> = {
      status: ProviderRefundStatus.REFUNDED,

      isTerminal: true,

      completedAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const refund = await this.transition(refundId, ProviderRefundStatus.PROCESSING, update, ProviderEventType.REFUND_COMPLETED, ProviderOperation.COMPLETE_REFUND);

    if (!refund) {
      return null;
    }

    return refund;
  }

  /**
   * -------------------------------------------------------------
   * Marks refund as partially refunded.
   * -------------------------------------------------------------
   */
  async partiallyRefund(
    refundId: Types.ObjectId | string,
  ): Promise<InternalRefundDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalRefundDocument> = {
      status: ProviderRefundStatus.PARTIALLY_REFUNDED,

      "audit.lastStatusChangedAt": now,
    };

    const refund = await InternalRefundRepository.updateById(refundId, update);

    if (!refund) {
      return null;
    }

    await this.recordRefundEvent(
      refund,
      ProviderEventType.REFUND_PARTIALLY_COMPLETED,
      ProviderOperation.PARTIAL_REFUND,
    );

    return refund;
  }

  /**
   * -------------------------------------------------------------
   * Marks refund as failed.
   * -------------------------------------------------------------
   */
  async failRefund(
    refundId: Types.ObjectId | string,
    reason: ProviderFailureReason,
  ): Promise<InternalRefundDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalRefundDocument> = {
      status: ProviderRefundStatus.FAILED,

      failureReason: reason,

      isTerminal: true,

      failedAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const refund = await InternalRefundRepository.updateById(refundId, update);

    if (!refund) {
      return null;
    }

    await this.recordRefundEvent(
      refund,
      ProviderEventType.REFUND_FAILED,
      ProviderOperation.FAIL_REFUND,
    );

    return refund;
  }

  /**
   * -------------------------------------------------------------
   * Cancels a provider refund.
   * -------------------------------------------------------------
   */
  async cancelRefund(
    refundId: Types.ObjectId | string,
  ): Promise<InternalRefundDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalRefundDocument> = {
      status: ProviderRefundStatus.CANCELLED,

      isTerminal: true,

      cancelledAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const refund = await InternalRefundRepository.updateById(refundId, update);

    if (!refund) {
      return null;
    }

    await this.recordRefundEvent(
      refund,
      ProviderEventType.REFUND_CANCELLED,
      ProviderOperation.CANCEL_REFUND,
    );

    return refund;
  }
  /**
   * -------------------------------------------------------------
   * Marks refund as expired.
   * -------------------------------------------------------------
   */
  async expireRefund(
    refundId: Types.ObjectId | string,
  ): Promise<InternalRefundDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalRefundDocument> = {
      status: ProviderRefundStatus.EXPIRED,

      isTerminal: true,

      expiredAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const refund = await InternalRefundRepository.updateById(refundId, update);

    if (!refund) {
      return null;
    }

    await this.recordRefundEvent(
      refund,
      ProviderEventType.REFUND_EXPIRED,
      ProviderOperation.EXPIRE_REFUND,
    );

    return refund;
  }

  /**
   * -------------------------------------------------------------
   * Finds a provider refund by Mongo id.
   * -------------------------------------------------------------
   */
  async findById(
    refundId: Types.ObjectId | string,
  ): Promise<InternalRefundDocument | null> {
    return InternalRefundRepository.findById(refundId);
  }

  /**
   * -------------------------------------------------------------
   * Finds a provider refund using the Financial Domain refund id.
   * -------------------------------------------------------------
   */
  async findByRefundId(
    refundId: Types.ObjectId,
  ): Promise<InternalRefundDocument | null> {
    return InternalRefundRepository.findByRefundId(refundId);
  }

  /**
   * -------------------------------------------------------------
   * Finds a provider refund using the provider refund id.
   * -------------------------------------------------------------
   */
  async findByProviderRefundId(
    providerRefundId: string,
  ): Promise<InternalRefundDocument | null> {
    return InternalRefundRepository.findByProviderRefundId(providerRefundId);
  }

  /**
   * -------------------------------------------------------------
   * Finds provider refunds using the provider payment id.
   * -------------------------------------------------------------
   */
  async findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<InternalRefundDocument | null> {
    return InternalRefundRepository.findByProviderPaymentId(providerPaymentId);
  }

  /**
   * -------------------------------------------------------------
   * Finds a provider refund using the idempotency key.
   * -------------------------------------------------------------
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<InternalRefundDocument | null> {
    return InternalRefundRepository.findByIdempotencyKey(idempotencyKey);
  }

  async findByIdempotencyKeyForReplay(idempotencyKey: string): Promise<InternalRefundDocument | null> {
    return InternalRefundRepository.findByIdempotencyKeyForReplay(idempotencyKey);
  }
}

export default new ProviderRefundService();
