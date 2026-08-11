// backend/src/constants/internalProvider/providerWebhookStatus.enum.ts

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Webhook Status
 * ------------------------------------------------------------------
 *
 * Represents the processing lifecycle of an incoming provider webhook.
 *
 * This enum is provider-specific and MUST NOT be confused with any
 * Financial Domain status.
 *
 * Internal Provider:
 *      InternalWebhook.status
 *
 * A webhook may be delivered multiple times, replayed, delayed, or
 * arrive out of order. This status tracks the lifecycle of webhook
 * processing inside the simulator.
 * ------------------------------------------------------------------
 */

export enum ProviderWebhookStatus {
  /**
   * Webhook record has been created.
   */
  CREATED = "CREATED",

  /**
   * Webhook has been received from the provider.
   */
  RECEIVED = "RECEIVED",

  /**
   * Signature validation is in progress.
   */
  VALIDATING = "VALIDATING",

  /**
   * Signature has been verified.
   */
  VERIFIED = "VERIFIED",

  /**
   * Webhook is currently being processed.
   */
  PROCESSING = "PROCESSING",

  /**
   * Processing completed successfully.
   */
  PROCESSED = "PROCESSED",

  /**
   * Webhook has been queued for retry.
   */
  RETRYING = "RETRYING",

  /**
   * Webhook has been replayed manually or automatically.
   */
  REPLAYED = "REPLAYED",

  /**
   * Processing failed.
   */
  FAILED = "FAILED",

  /**
   * Signature verification failed.
   */
  REJECTED = "REJECTED",

  /**
   * Webhook processing expired.
   */
  EXPIRED = "EXPIRED",
}

export default ProviderWebhookStatus;
