// backend/src/constants/internalProvider/providerEntityType.enum.ts

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Entity Type
 * ------------------------------------------------------------------
 *
 * Represents the supported provider-managed entity types.
 *
 * This enum is used wherever provider entities need to be referenced
 * generically instead of working with a specific model.
 *
 * Typical use cases:
 * - InternalProviderEvent
 * - Audit Logs
 * - Reconciliation Engine
 * - Admin Simulator
 * - Generic Provider Services
 * - Reporting & Analytics
 *
 * NOTE:
 * This enum identifies provider entities only.
 * It does NOT represent operations, statuses, or events.
 * ------------------------------------------------------------------
 */

export enum ProviderEntityType {
  WALLET_CONVERSION_PROVIDER_REQUEST = "WALLET_CONVERSION_PROVIDER_REQUEST",
  WITHDRAWAL_PROVIDER_REQUEST = "WITHDRAWAL_PROVIDER_REQUEST",
  /**
   * Provider payment entity.
   */
  PAYMENT = "PAYMENT",

  /**
   * Provider refund entity.
   */
  REFUND = "REFUND",

  /**
   * Provider settlement entity.
   */
  SETTLEMENT = "SETTLEMENT",

  /**
   * Provider payout entity.
   */
  PAYOUT = "PAYOUT",

  /**
   * Provider webhook entity.
   */
  WEBHOOK = "WEBHOOK",

  /**
   * Immutable provider event entity.
   */
  EVENT = "EVENT",
  TOP_UP_FUNDING = "TOP_UP_FUNDING",
}

export default ProviderEntityType;
