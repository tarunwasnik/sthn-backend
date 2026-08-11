// backend/src/utils/financial/idempotency.util.ts

import crypto from "crypto";
import { FINANCIAL_LIMITS } from "../../constants/financial/financialLimits";

/**
 * Generates a cryptographically secure idempotency key.
 */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * Returns true if an idempotency key satisfies the
 * Financial Domain validation rules.
 */
export function isValidIdempotencyKey(key: string): boolean {
  if (typeof key !== "string") {
    return false;
  }

  const trimmed = key.trim();

  if (!trimmed) {
    return false;
  }

  return trimmed.length <= FINANCIAL_LIMITS.MAX_IDEMPOTENCY_KEY_LENGTH;
}

/**
 * Normalizes an idempotency key for storage and comparison.
 */
export function normalizeIdempotencyKey(key: string): string {
  return key.trim().toLowerCase();
}

/**
 * Creates a deterministic idempotency fingerprint from a set of values.
 *
 * Useful when an external provider does not supply an idempotency key.
 */
export function createIdempotencyFingerprint(
  ...parts: Array<string | number | boolean | null | undefined>
): string {
  const normalized = parts.map((part) => String(part ?? "")).join("|");

  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Compares two idempotency keys after normalization.
 */
export function idempotencyKeysEqual(first: string, second: string): boolean {
  return normalizeIdempotencyKey(first) === normalizeIdempotencyKey(second);
}
