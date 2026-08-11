"use strict";
// backend/src/services/internalProvider/base/idempotency.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdempotencyService = void 0;
const crypto_1 = require("crypto");
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
class IdempotencyService {
    /**
     * Generate a new idempotency key.
     */
    generateKey() {
        return (0, crypto_1.randomUUID)();
    }
    /**
     * Create a deterministic SHA-256 fingerprint from any value.
     *
     * Useful when deriving idempotency from a request payload.
     */
    createFingerprint(payload) {
        return (0, crypto_1.createHash)("sha256").update(JSON.stringify(payload)).digest("hex");
    }
    /**
     * Compare two idempotency keys.
     */
    isSameKey(first, second) {
        return first === second;
    }
    /**
     * Compare two request fingerprints.
     */
    isSameFingerprint(first, second) {
        return first === second;
    }
    /**
     * Validate an idempotency key.
     */
    isValidKey(key) {
        return key.trim().length > 0;
    }
}
exports.IdempotencyService = IdempotencyService;
exports.default = new IdempotencyService();
