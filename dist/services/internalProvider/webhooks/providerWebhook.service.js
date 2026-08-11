"use strict";
// backend/src/services/internalProvider/webhooks/providerWebhook.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderWebhookService = void 0;
const internalWebhook_repository_1 = __importDefault(require("../../../repositories/internalProvider/internalWebhook.repository"));
const internalProvider_1 = require("../../../constants/internalProvider");
const providerClock_service_1 = __importDefault(require("../base/providerClock.service"));
const providerEvent_service_1 = __importDefault(require("../events/providerEvent.service"));
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
class ProviderWebhookService {
    /**
     * -------------------------------------------------------------
     * Records an immutable provider event for the webhook.
     * -------------------------------------------------------------
     */
    async recordWebhookEvent(webhook, eventType, operation) {
        await providerEvent_service_1.default.recordEvent({
            entityType: internalProvider_1.ProviderEntityType.WEBHOOK,
            entityId: webhook._id,
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
    async createWebhook(data) {
        return internalWebhook_repository_1.default.create({
            ...data,
            status: internalProvider_1.ProviderWebhookStatus.CREATED,
            isTerminal: false,
        });
    }
    /**
     * -------------------------------------------------------------
     * Marks webhook as received.
     * -------------------------------------------------------------
     */
    async receiveWebhook(webhookId) {
        const update = {
            status: internalProvider_1.ProviderWebhookStatus.RECEIVED,
            receivedAt: providerClock_service_1.default.now(),
            "audit.lastStatusChangedAt": providerClock_service_1.default.now(),
        };
        const webhook = await internalWebhook_repository_1.default.updateById(webhookId, update);
        if (!webhook) {
            return null;
        }
        await this.recordWebhookEvent(webhook, internalProvider_1.ProviderEventType.WEBHOOK_RECEIVED, internalProvider_1.ProviderOperation.RECEIVE_WEBHOOK);
        return webhook;
    }
    /**
     * -------------------------------------------------------------
     * Marks webhook as validating.
     * -------------------------------------------------------------
     */
    async validateWebhook(webhookId) {
        const update = {
            status: internalProvider_1.ProviderWebhookStatus.VALIDATING,
            validatedAt: providerClock_service_1.default.now(),
            "audit.lastStatusChangedAt": providerClock_service_1.default.now(),
        };
        const webhook = await internalWebhook_repository_1.default.updateById(webhookId, update);
        if (!webhook) {
            return null;
        }
        await this.recordWebhookEvent(webhook, internalProvider_1.ProviderEventType.WEBHOOK_VALIDATING, internalProvider_1.ProviderOperation.VALIDATE_WEBHOOK);
        return webhook;
    }
    /**
     * -------------------------------------------------------------
     * Marks webhook as verified.
     * -------------------------------------------------------------
     */
    async verifyWebhook(webhookId) {
        const update = {
            status: internalProvider_1.ProviderWebhookStatus.VERIFIED,
            verifiedAt: providerClock_service_1.default.now(),
            "audit.lastStatusChangedAt": providerClock_service_1.default.now(),
        };
        const webhook = await internalWebhook_repository_1.default.updateById(webhookId, update);
        if (!webhook) {
            return null;
        }
        await this.recordWebhookEvent(webhook, internalProvider_1.ProviderEventType.WEBHOOK_VERIFIED, internalProvider_1.ProviderOperation.VERIFY_WEBHOOK);
        return webhook;
    }
    /**
     * -------------------------------------------------------------
     * Marks webhook as processing.
     * -------------------------------------------------------------
     */
    async processWebhook(webhookId) {
        const update = {
            status: internalProvider_1.ProviderWebhookStatus.PROCESSING,
            processingAt: providerClock_service_1.default.now(),
            "audit.lastStatusChangedAt": providerClock_service_1.default.now(),
        };
        const webhook = await internalWebhook_repository_1.default.updateById(webhookId, update);
        if (!webhook) {
            return null;
        }
        await this.recordWebhookEvent(webhook, internalProvider_1.ProviderEventType.WEBHOOK_PROCESSING, internalProvider_1.ProviderOperation.PROCESS_WEBHOOK);
        return webhook;
    }
    /**
     * -------------------------------------------------------------
     * Marks webhook as processed successfully.
     * -------------------------------------------------------------
     */
    async completeWebhook(webhookId) {
        const update = {
            status: internalProvider_1.ProviderWebhookStatus.PROCESSED,
            processedAt: providerClock_service_1.default.now(),
            isTerminal: true,
            "audit.lastStatusChangedAt": providerClock_service_1.default.now(),
        };
        const webhook = await internalWebhook_repository_1.default.updateById(webhookId, update);
        if (!webhook) {
            return null;
        }
        await this.recordWebhookEvent(webhook, internalProvider_1.ProviderEventType.WEBHOOK_PROCESSED, internalProvider_1.ProviderOperation.PROCESS_WEBHOOK);
        return webhook;
    }
    /**
     * -------------------------------------------------------------
     * Marks webhook as failed.
     * -------------------------------------------------------------
     */
    async failWebhook(webhookId, failureReason) {
        const update = {
            status: internalProvider_1.ProviderWebhookStatus.FAILED,
            failureReason,
            failedAt: providerClock_service_1.default.now(),
            isTerminal: true,
            "audit.lastStatusChangedAt": providerClock_service_1.default.now(),
        };
        const webhook = await internalWebhook_repository_1.default.updateById(webhookId, update);
        if (!webhook) {
            return null;
        }
        await this.recordWebhookEvent(webhook, internalProvider_1.ProviderEventType.WEBHOOK_FAILED, internalProvider_1.ProviderOperation.FAIL_WEBHOOK);
        return webhook;
    }
    /**
     * -------------------------------------------------------------
     * Rejects webhook.
     * -------------------------------------------------------------
     */
    async rejectWebhook(webhookId, failureReason) {
        const update = {
            status: internalProvider_1.ProviderWebhookStatus.REJECTED,
            failureReason,
            rejectedAt: providerClock_service_1.default.now(),
            isTerminal: true,
            "audit.lastStatusChangedAt": providerClock_service_1.default.now(),
        };
        const webhook = await internalWebhook_repository_1.default.updateById(webhookId, update);
        if (!webhook) {
            return null;
        }
        await this.recordWebhookEvent(webhook, internalProvider_1.ProviderEventType.WEBHOOK_REJECTED, internalProvider_1.ProviderOperation.REJECT_WEBHOOK);
        return webhook;
    }
    /**
     * -------------------------------------------------------------
     * Schedules webhook for retry.
     * -------------------------------------------------------------
     */
    async retryWebhook(webhookId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderWebhookStatus.RETRYING,
            retriedAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const webhook = await internalWebhook_repository_1.default.updateById(webhookId, update);
        if (!webhook) {
            return null;
        }
        await this.recordWebhookEvent(webhook, internalProvider_1.ProviderEventType.WEBHOOK_RETRIED, internalProvider_1.ProviderOperation.RETRY_WEBHOOK);
        return webhook;
    }
    /**
     * -------------------------------------------------------------
     * Replays a previously received webhook.
     * -------------------------------------------------------------
     */
    async replayWebhook(webhookId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderWebhookStatus.REPLAYED,
            replayedAt: now,
            "audit.lastStatusChangedAt": now,
        };
        const webhook = await internalWebhook_repository_1.default.updateById(webhookId, update);
        if (!webhook) {
            return null;
        }
        await this.recordWebhookEvent(webhook, internalProvider_1.ProviderEventType.WEBHOOK_REPLAYED, internalProvider_1.ProviderOperation.REPLAY_WEBHOOK);
        return webhook;
    }
    /**
     * -------------------------------------------------------------
     * Marks webhook as expired.
     * -------------------------------------------------------------
     */
    async expireWebhook(webhookId) {
        const now = providerClock_service_1.default.now();
        const update = {
            status: internalProvider_1.ProviderWebhookStatus.EXPIRED,
            expiredAt: now,
            isTerminal: true,
            "audit.lastStatusChangedAt": now,
        };
        const webhook = await internalWebhook_repository_1.default.updateById(webhookId, update);
        if (!webhook) {
            return null;
        }
        await this.recordWebhookEvent(webhook, internalProvider_1.ProviderEventType.WEBHOOK_EXPIRED, internalProvider_1.ProviderOperation.EXPIRE_WEBHOOK);
        return webhook;
    }
    /**
     * -------------------------------------------------------------
     * Returns a webhook by id.
     * -------------------------------------------------------------
     */
    async getWebhook(webhookId) {
        return internalWebhook_repository_1.default.findById(webhookId);
    }
    /**
     * -------------------------------------------------------------
     * Returns a webhook using provider webhook id.
     * -------------------------------------------------------------
     */
    async getWebhookByProviderWebhookId(providerWebhookId) {
        return internalWebhook_repository_1.default.findByProviderWebhookId(providerWebhookId);
    }
    /**
     * -------------------------------------------------------------
     * Returns all webhooks having the specified status.
     * -------------------------------------------------------------
     */
    async getWebhooksByStatus(status) {
        return internalWebhook_repository_1.default.findMany({
            status,
        });
    }
    /**
     * -------------------------------------------------------------
     * Returns all terminal webhooks.
     * -------------------------------------------------------------
     */
    async getTerminalWebhooks() {
        return internalWebhook_repository_1.default.findMany({
            isTerminal: true,
        });
    }
    /**
     * -------------------------------------------------------------
     * Returns all active webhooks.
     * -------------------------------------------------------------
     */
    async getActiveWebhooks() {
        return internalWebhook_repository_1.default.findMany({
            isTerminal: false,
        });
    }
}
exports.ProviderWebhookService = ProviderWebhookService;
exports.default = new ProviderWebhookService();
