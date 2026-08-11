// backend/src/constants/internalProvider/providerSettlementStatus.enum.ts

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Settlement Status
 * ------------------------------------------------------------------
 *
 * Represents the settlement lifecycle maintained by the payment
 * provider.
 *
 * This enum is provider-specific and MUST NOT be confused with the
 * Financial Domain SettlementStatus.
 *
 * Financial Domain:
 *      Settlement.status
 *
 * Internal Provider:
 *      InternalSettlement.providerStatus
 * ------------------------------------------------------------------
 */

export enum ProviderSettlementStatus {
  /**
   * Settlement record has been created.
   */
  CREATED = "CREATED",

  /**
   * Settlement has been scheduled.
   */
  SCHEDULED = "SCHEDULED",

  /**
   * Settlement is waiting to be processed.
   */
  PENDING = "PENDING",

  /**
   * Settlement is currently being processed.
   */
  PROCESSING = "PROCESSING",

  /**
   * Settlement has been partially completed.
   */
  PARTIALLY_SETTLED = "PARTIALLY_SETTLED",

  /**
   * Settlement completed successfully.
   */
  SETTLED = "SETTLED",

  /**
   * Settlement failed.
   */
  FAILED = "FAILED",

  /**
   * Settlement was cancelled.
   */
  CANCELLED = "CANCELLED",

  /**
   * Settlement expired before completion.
   */
  EXPIRED = "EXPIRED",
}

export default ProviderSettlementStatus;
