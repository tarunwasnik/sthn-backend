// backend/src/constants/internalProvider/providerSimulationMode.enum.ts

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Simulation Mode
 * ------------------------------------------------------------------
 *
 * Represents the execution mode of the Internal Provider simulator.
 *
 * Simulation modes determine how the provider behaves when executing
 * operations. They are primarily used by the Admin Simulator,
 * automated testing, QA, and future chaos testing.
 *
 * NOTE:
 * This enum is ONLY used by the Internal Provider.
 * Real providers (Stripe, Razorpay, etc.) do not use simulation modes.
 * ------------------------------------------------------------------
 */

export enum ProviderSimulationMode {
  /**
   * Execute the normal successful provider flow.
   */
  NORMAL = "NORMAL",

  /**
   * Introduce artificial processing delays.
   */
  DELAY = "DELAY",

  /**
   * Simulate gateway timeout.
   */
  TIMEOUT = "TIMEOUT",

  /**
   * Simulate provider network failure.
   */
  NETWORK_ERROR = "NETWORK_ERROR",

  /**
   * Simulate provider service outage.
   */
  PROVIDER_DOWN = "PROVIDER_DOWN",

  /**
   * Simulate provider rate limiting.
   */
  RATE_LIMITED = "RATE_LIMITED",

  /**
   * Simulate temporary provider failure that can be retried.
   */
  RETRYABLE_FAILURE = "RETRYABLE_FAILURE",

  /**
   * Simulate permanent provider failure.
   */
  PERMANENT_FAILURE = "PERMANENT_FAILURE",

  /**
   * Simulate duplicate webhook delivery.
   */
  DUPLICATE_WEBHOOK = "DUPLICATE_WEBHOOK",

  /**
   * Simulate webhook replay.
   */
  WEBHOOK_REPLAY = "WEBHOOK_REPLAY",

  /**
   * Simulate out-of-order webhook delivery.
   */
  OUT_OF_ORDER_WEBHOOK = "OUT_OF_ORDER_WEBHOOK",

  /**
   * Simulate partial capture.
   */
  PARTIAL_CAPTURE = "PARTIAL_CAPTURE",

  /**
   * Simulate partial refund.
   */
  PARTIAL_REFUND = "PARTIAL_REFUND",

  /**
   * Simulate partial settlement.
   */
  PARTIAL_SETTLEMENT = "PARTIAL_SETTLEMENT",

  /**
   * Simulate payout reversal.
   */
  PAYOUT_REVERSAL = "PAYOUT_REVERSAL",

  /**
   * Simulate manual administrator intervention.
   */
  ADMIN_OVERRIDE = "ADMIN_OVERRIDE",
}

export default ProviderSimulationMode;
