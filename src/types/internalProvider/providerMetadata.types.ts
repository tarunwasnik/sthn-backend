//backend/src/types/internalProvider/providerMetadata.types.ts
import { ProviderSimulationMode } from "../../constants/internalProvider";

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Metadata
 * ------------------------------------------------------------------
 *
 * Immutable metadata describing the provider execution environment.
 *
 * This metadata identifies where and how a provider operation
 * was executed. It is NOT the provider response payload.
 * ------------------------------------------------------------------
 */

export interface ProviderMetadata {
  /**
   * Provider identifier.
   *
   * Example:
   * INTERNAL
   * STRIPE
   * RAZORPAY
   */
  provider: string;

  /**
   * Provider environment.
   *
   * Example:
   * development
   * testing
   * staging
   * production
   */
  environment: string;

  /**
   * Provider API version.
   */
  apiVersion?: string;

  /**
   * Simulation mode.
   */
  simulationMode: ProviderSimulationMode;

  /**
   * Correlation identifier used across
   * provider operations.
   */
  correlationId?: string;

  /**
   * External provider request identifier.
   */
  requestId?: string;
}
