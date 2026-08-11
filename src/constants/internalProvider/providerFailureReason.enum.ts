// backend/src/constants/internalProvider/providerFailureReason.enum.ts

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Failure Reason
 * ------------------------------------------------------------------
 *
 * Represents the reason why a provider operation failed.
 *
 * This enum supplements ProviderStatus and ProviderEventType by
 * providing the underlying cause of a failure.
 *
 * It is used by:
 * - Internal Provider
 * - Admin Simulator
 * - Retry Engine
 * - Audit Logs
 * - Reconciliation
 * - Future Real Providers
 * ------------------------------------------------------------------
 */

export enum ProviderFailureReason {
  /**
   * Generic unknown failure.
   */
  UNKNOWN = "UNKNOWN",

  /**
   * Payment authorization was declined.
   */
  AUTHORIZATION_DECLINED = "AUTHORIZATION_DECLINED",

  /**
   * Payment capture failed.
   */
  CAPTURE_FAILED = "CAPTURE_FAILED",

  /**
   * Refund processing failed.
   */
  REFUND_FAILED = "REFUND_FAILED",

  /**
   * Settlement processing failed.
   */
  SETTLEMENT_FAILED = "SETTLEMENT_FAILED",

  /**
   * Payout processing failed.
   */
  PAYOUT_FAILED = "PAYOUT_FAILED",

  /**
   * Provider service is unavailable.
   */
  PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE",

  /**
   * Provider request timed out.
   */
  TIMEOUT = "TIMEOUT",

  /**
   * Network communication failed.
   */
  NETWORK_ERROR = "NETWORK_ERROR",

  /**
   * Provider rate limit exceeded.
   */
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",

  /**
   * Duplicate operation detected.
   */
  DUPLICATE_REQUEST = "DUPLICATE_REQUEST",

  /**
   * Invalid idempotency key.
   */
  IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT",

  /**
   * Invalid request payload.
   */
  INVALID_REQUEST = "INVALID_REQUEST",

  /**
   * Requested resource was not found.
   */
  RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND",

  /**
   * Currency conversion failed.
   */
  FX_CONVERSION_FAILED = "FX_CONVERSION_FAILED",

  /**
   * Currency pair is unsupported.
   */
  UNSUPPORTED_CURRENCY = "UNSUPPORTED_CURRENCY",

  /**
   * Webhook signature verification failed.
   */
  INVALID_WEBHOOK_SIGNATURE = "INVALID_WEBHOOK_SIGNATURE",

  /**
   * Webhook payload is invalid.
   */
  INVALID_WEBHOOK_PAYLOAD = "INVALID_WEBHOOK_PAYLOAD",

  /**
   * Webhook arrived in an unexpected order.
   */
  OUT_OF_ORDER_WEBHOOK = "OUT_OF_ORDER_WEBHOOK",

  /**
   * Webhook has already been processed.
   */
  DUPLICATE_WEBHOOK = "DUPLICATE_WEBHOOK",

  /**
   * Administrative cancellation.
   */
  ADMIN_CANCELLED = "ADMIN_CANCELLED",

  /**
   * Administrative override.
   */
  ADMIN_OVERRIDE = "ADMIN_OVERRIDE",
}

export default ProviderFailureReason;
