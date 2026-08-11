//backend/src/types/internalProvider/providerExecution.types.ts

/**
 * ------------------------------------------------------------------
 * Provider Execution Information
 * ------------------------------------------------------------------
 *
 * Represents runtime execution metrics for a provider operation.
 *
 * These values are useful for retries,
 * diagnostics,
 * reconciliation,
 * monitoring,
 * and analytics.
 * ------------------------------------------------------------------
 */

export interface ProviderExecutionInfo {
  /**
   * Current execution attempt.
   */
  attemptNumber: number;

  /**
   * Number of retries performed.
   */
  retryCount: number;

  /**
   * Total execution latency.
   */
  processingLatencyMs?: number;

  /**
   * Indicates whether execution occurred
   * in test mode.
   */
  isTestMode: boolean;
}
