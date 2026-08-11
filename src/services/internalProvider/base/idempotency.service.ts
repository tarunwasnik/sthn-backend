// backend/src/services/internalProvider/base/idempotency.service.ts

import { createHash, randomUUID } from "crypto";

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Idempotency Service
 * ------------------------------------------------------------------
 *
 * Shared utilities for generating and validating provider
 * idempotency keys.
 *
 * This service does not perform persistence lookups.
 * Lifecycle services are responsible for checking their own
 * repositories for duplicate idempotency keys.
 * ------------------------------------------------------------------
 */
export class IdempotencyService {
  /**
   * Generate a new idempotency key.
   */
  generateKey(): string {
    return randomUUID();
  }

  /**
   * Create a deterministic SHA-256 fingerprint from any value.
   *
   * Useful when deriving idempotency from a request payload.
   */
  createFingerprint(payload: unknown): string {
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  }

  /**
   * Compare two idempotency keys.
   */
  isSameKey(first: string, second: string): boolean {
    return first === second;
  }

  /**
   * Compare two request fingerprints.
   */
  isSameFingerprint(first: string, second: string): boolean {
    return first === second;
  }

  /**
   * Validate an idempotency key.
   */
  isValidKey(key: string): boolean {
    return key.trim().length > 0;
  }
}

export default new IdempotencyService();
