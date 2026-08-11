//backend/src/types/internalProvider/providerPayload.types.ts

/**
 * ------------------------------------------------------------------
 * Provider Payload Information
 * ------------------------------------------------------------------
 *
 * Represents the raw request and response payloads exchanged with
 * the payment provider.
 *
 * These payloads are intentionally untyped because different
 * providers expose different request/response formats.
 *
 * The Internal Provider stores these payloads for:
 * - Auditing
 * - Debugging
 * - Replay
 * - Reconciliation
 * - Diagnostics
 *
 * This interface is shared across all Internal Provider entities
 * that persist provider payloads.
 * ------------------------------------------------------------------
 */

export interface ProviderPayloadInfo {
  /**
   * Raw request payload sent to the provider.
   */
  request?: unknown;

  /**
   * Raw response payload received from the provider.
   */
  response?: unknown;
}
