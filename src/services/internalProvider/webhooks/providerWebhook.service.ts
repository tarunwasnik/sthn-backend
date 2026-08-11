// backend/src/services/internalProvider/webhooks/providerWebhook.service.ts

import { Types, UpdateQuery } from "mongoose";

import InternalWebhookRepository from "../../../repositories/internalProvider/internalWebhook.repository";

import {
  ProviderEntityType,
  ProviderEventType,
  ProviderOperation,
  ProviderWebhookStatus,
  ProviderFailureReason,
} from "../../../constants/internalProvider";

import { InternalWebhookDocument } from "../../../models/internalProvider/internalWebhook.model";

import ProviderClockService from "../base/providerClock.service";
import ProviderEventService from "../events/providerEvent.service";

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Webhook Service
 * ------------------------------------------------------------------
 *
 * Responsible for managing the lifecycle of Internal Provider
 * webhooks.
 *
 * Every lifecycle transition records an immutable provider event.
 *
 * This service owns ONLY provider webhook execution state.
 *
 * Financial state belongs to the Financial Domain.
 * ------------------------------------------------------------------
 */

export class ProviderWebhookService {
  /**
   * -------------------------------------------------------------
   * Records an immutable provider event for the webhook.
   * -------------------------------------------------------------
   */
  private async recordWebhookEvent(
    webhook: InternalWebhookDocument,
    eventType: ProviderEventType,
    operation: ProviderOperation,
  ): Promise<void> {
    await ProviderEventService.recordEvent({
      entityType: ProviderEntityType.WEBHOOK,
      entityId: webhook._id as Types.ObjectId,

      eventType,
      operation,

      providerEntityId: webhook.providerEntityId ?? webhook.providerWebhookId,

      providerPaymentId: webhook.providerPaymentId ?? undefined,

      providerReference: webhook.providerReference ?? undefined,

      providerMetadata: webhook.providerMetadata,

      execution: webhook.execution,

      audit: webhook.audit,

      payloads: webhook.payloads,
    });
  }

  /**
   * -------------------------------------------------------------
   * Creates a webhook record.
   * -------------------------------------------------------------
   */
  async createWebhook(
    data: Partial<InternalWebhookDocument>,
  ): Promise<InternalWebhookDocument> {
    return InternalWebhookRepository.create({
      ...data,

      status: ProviderWebhookStatus.CREATED,

      isTerminal: false,
    });
  }

  /**
   * -------------------------------------------------------------
   * Marks webhook as received.
   * -------------------------------------------------------------
   */
  async receiveWebhook(
    webhookId: Types.ObjectId | string,
  ): Promise<InternalWebhookDocument | null> {
    const update: UpdateQuery<InternalWebhookDocument> = {
      status: ProviderWebhookStatus.RECEIVED,

      receivedAt: ProviderClockService.now(),

      "audit.lastStatusChangedAt": ProviderClockService.now(),
    };

    const webhook = await InternalWebhookRepository.updateById(
      webhookId,
      update,
    );

    if (!webhook) {
      return null;
    }

    await this.recordWebhookEvent(
      webhook,
      ProviderEventType.WEBHOOK_RECEIVED,
      ProviderOperation.RECEIVE_WEBHOOK,
    );

    return webhook;
  }

  /**
   * -------------------------------------------------------------
   * Marks webhook as validating.
   * -------------------------------------------------------------
   */
  async validateWebhook(
    webhookId: Types.ObjectId | string,
  ): Promise<InternalWebhookDocument | null> {
    const update: UpdateQuery<InternalWebhookDocument> = {
      status: ProviderWebhookStatus.VALIDATING,

      validatedAt: ProviderClockService.now(),

      "audit.lastStatusChangedAt": ProviderClockService.now(),
    };

    const webhook = await InternalWebhookRepository.updateById(
      webhookId,
      update,
    );

    if (!webhook) {
      return null;
    }

    await this.recordWebhookEvent(
      webhook,
      ProviderEventType.WEBHOOK_VALIDATING,
      ProviderOperation.VALIDATE_WEBHOOK,
    );

    return webhook;
  }

  /**
   * -------------------------------------------------------------
   * Marks webhook as verified.
   * -------------------------------------------------------------
   */
  async verifyWebhook(
    webhookId: Types.ObjectId | string,
  ): Promise<InternalWebhookDocument | null> {
    const update: UpdateQuery<InternalWebhookDocument> = {
      status: ProviderWebhookStatus.VERIFIED,

      verifiedAt: ProviderClockService.now(),

      "audit.lastStatusChangedAt": ProviderClockService.now(),
    };

    const webhook = await InternalWebhookRepository.updateById(
      webhookId,
      update,
    );

    if (!webhook) {
      return null;
    }

    await this.recordWebhookEvent(
      webhook,
      ProviderEventType.WEBHOOK_VERIFIED,
      ProviderOperation.VERIFY_WEBHOOK,
    );

    return webhook;
  }

  /**
   * -------------------------------------------------------------
   * Marks webhook as processing.
   * -------------------------------------------------------------
   */
  async processWebhook(
    webhookId: Types.ObjectId | string,
  ): Promise<InternalWebhookDocument | null> {
    const update: UpdateQuery<InternalWebhookDocument> = {
      status: ProviderWebhookStatus.PROCESSING,

      processingAt: ProviderClockService.now(),

      "audit.lastStatusChangedAt": ProviderClockService.now(),
    };

    const webhook = await InternalWebhookRepository.updateById(
      webhookId,
      update,
    );

    if (!webhook) {
      return null;
    }

    await this.recordWebhookEvent(
      webhook,
      ProviderEventType.WEBHOOK_PROCESSING,
      ProviderOperation.PROCESS_WEBHOOK,
    );

    return webhook;
  }

  /**
   * -------------------------------------------------------------
   * Marks webhook as processed successfully.
   * -------------------------------------------------------------
   */
  async completeWebhook(
    webhookId: Types.ObjectId | string,
  ): Promise<InternalWebhookDocument | null> {
    const update: UpdateQuery<InternalWebhookDocument> = {
      status: ProviderWebhookStatus.PROCESSED,

      processedAt: ProviderClockService.now(),

      isTerminal: true,

      "audit.lastStatusChangedAt": ProviderClockService.now(),
    };

    const webhook = await InternalWebhookRepository.updateById(
      webhookId,
      update,
    );

    if (!webhook) {
      return null;
    }

    await this.recordWebhookEvent(
      webhook,
      ProviderEventType.WEBHOOK_PROCESSED,
      ProviderOperation.PROCESS_WEBHOOK,
    );

    return webhook;
  }

  /**
   * -------------------------------------------------------------
   * Marks webhook as failed.
   * -------------------------------------------------------------
   */
  async failWebhook(
    webhookId: Types.ObjectId | string,
    failureReason?: ProviderFailureReason,
  ): Promise<InternalWebhookDocument | null> {
    const update: UpdateQuery<InternalWebhookDocument> = {
      status: ProviderWebhookStatus.FAILED,

      failureReason,

      failedAt: ProviderClockService.now(),

      isTerminal: true,

      "audit.lastStatusChangedAt": ProviderClockService.now(),
    };

    const webhook = await InternalWebhookRepository.updateById(
      webhookId,
      update,
    );

    if (!webhook) {
      return null;
    }

    await this.recordWebhookEvent(
      webhook,
      ProviderEventType.WEBHOOK_FAILED,
      ProviderOperation.FAIL_WEBHOOK,
    );

    return webhook;
  }

  /**
   * -------------------------------------------------------------
   * Rejects webhook.
   * -------------------------------------------------------------
   */
  async rejectWebhook(
    webhookId: Types.ObjectId | string,
    failureReason?: ProviderFailureReason,
  ): Promise<InternalWebhookDocument | null> {
    const update: UpdateQuery<InternalWebhookDocument> = {
      status: ProviderWebhookStatus.REJECTED,

      failureReason,

      rejectedAt: ProviderClockService.now(),

      isTerminal: true,

      "audit.lastStatusChangedAt": ProviderClockService.now(),
    };

    const webhook = await InternalWebhookRepository.updateById(
      webhookId,
      update,
    );

    if (!webhook) {
      return null;
    }

    await this.recordWebhookEvent(
      webhook,
      ProviderEventType.WEBHOOK_REJECTED,
      ProviderOperation.REJECT_WEBHOOK,
    );

    return webhook;
  }
  /**
   * -------------------------------------------------------------
   * Schedules webhook for retry.
   * -------------------------------------------------------------
   */
  async retryWebhook(
    webhookId: Types.ObjectId | string,
  ): Promise<InternalWebhookDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalWebhookDocument> = {
      status: ProviderWebhookStatus.RETRYING,

      retriedAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const webhook = await InternalWebhookRepository.updateById(
      webhookId,
      update,
    );

    if (!webhook) {
      return null;
    }

    await this.recordWebhookEvent(
      webhook,
      ProviderEventType.WEBHOOK_RETRIED,
      ProviderOperation.RETRY_WEBHOOK,
    );

    return webhook;
  }

  /**
   * -------------------------------------------------------------
   * Replays a previously received webhook.
   * -------------------------------------------------------------
   */
  async replayWebhook(
    webhookId: Types.ObjectId | string,
  ): Promise<InternalWebhookDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalWebhookDocument> = {
      status: ProviderWebhookStatus.REPLAYED,

      replayedAt: now,

      "audit.lastStatusChangedAt": now,
    };

    const webhook = await InternalWebhookRepository.updateById(
      webhookId,
      update,
    );

    if (!webhook) {
      return null;
    }

    await this.recordWebhookEvent(
      webhook,
      ProviderEventType.WEBHOOK_REPLAYED,
      ProviderOperation.REPLAY_WEBHOOK,
    );

    return webhook;
  }

  /**
   * -------------------------------------------------------------
   * Marks webhook as expired.
   * -------------------------------------------------------------
   */
  async expireWebhook(
    webhookId: Types.ObjectId | string,
  ): Promise<InternalWebhookDocument | null> {
    const now = ProviderClockService.now();

    const update: UpdateQuery<InternalWebhookDocument> = {
      status: ProviderWebhookStatus.EXPIRED,

      expiredAt: now,

      isTerminal: true,

      "audit.lastStatusChangedAt": now,
    };

    const webhook = await InternalWebhookRepository.updateById(
      webhookId,
      update,
    );

    if (!webhook) {
      return null;
    }

    await this.recordWebhookEvent(
      webhook,
      ProviderEventType.WEBHOOK_EXPIRED,
      ProviderOperation.EXPIRE_WEBHOOK,
    );

    return webhook;
  }

  /**
   * -------------------------------------------------------------
   * Returns a webhook by id.
   * -------------------------------------------------------------
   */
  async getWebhook(
    webhookId: Types.ObjectId | string,
  ): Promise<InternalWebhookDocument | null> {
    return InternalWebhookRepository.findById(webhookId);
  }

  /**
   * -------------------------------------------------------------
   * Returns a webhook using provider webhook id.
   * -------------------------------------------------------------
   */
  async getWebhookByProviderWebhookId(
    providerWebhookId: string,
  ): Promise<InternalWebhookDocument | null> {
    return InternalWebhookRepository.findByProviderWebhookId(providerWebhookId);
  }

  /**
   * -------------------------------------------------------------
   * Returns all webhooks having the specified status.
   * -------------------------------------------------------------
   */
  async getWebhooksByStatus(
    status: ProviderWebhookStatus,
  ): Promise<InternalWebhookDocument[]> {
    return InternalWebhookRepository.findMany({
      status,
    });
  }

  /**
   * -------------------------------------------------------------
   * Returns all terminal webhooks.
   * -------------------------------------------------------------
   */
  async getTerminalWebhooks(): Promise<InternalWebhookDocument[]> {
    return InternalWebhookRepository.findMany({
      isTerminal: true,
    });
  }

  /**
   * -------------------------------------------------------------
   * Returns all active webhooks.
   * -------------------------------------------------------------
   */
  async getActiveWebhooks(): Promise<InternalWebhookDocument[]> {
    return InternalWebhookRepository.findMany({
      isTerminal: false,
    });
  }
}

export default new ProviderWebhookService();
