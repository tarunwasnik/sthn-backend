"use strict";
// backend/src/utils/financial/idempotency.util.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateIdempotencyKey = generateIdempotencyKey;
exports.isValidIdempotencyKey = isValidIdempotencyKey;
exports.normalizeIdempotencyKey = normalizeIdempotencyKey;
exports.createIdempotencyFingerprint = createIdempotencyFingerprint;
exports.idempotencyKeysEqual = idempotencyKeysEqual;
const crypto_1 = __importDefault(require("crypto"));
const financialLimits_1 = require("../../constants/financial/financialLimits");
/**
 * Generates a cryptographically secure idempotency key.
 */
function generateIdempotencyKey() {
    return crypto_1.default.randomUUID();
}
/**
 * Returns true if an idempotency key satisfies the
 * Financial Domain validation rules.
 */
function isValidIdempotencyKey(key) {
    if (typeof key !== "string") {
        return false;
    }
    const trimmed = key.trim();
    if (!trimmed) {
        return false;
    }
    return trimmed.length <= financialLimits_1.FINANCIAL_LIMITS.MAX_IDEMPOTENCY_KEY_LENGTH;
}
/**
 * Normalizes an idempotency key for storage and comparison.
 */
function normalizeIdempotencyKey(key) {
    return key.trim().toLowerCase();
}
/**
 * Creates a deterministic idempotency fingerprint from a set of values.
 *
 * Useful when an external provider does not supply an idempotency key.
 */
function createIdempotencyFingerprint(...parts) {
    const normalized = parts.map((part) => String(part ?? "")).join("|");
    return crypto_1.default.createHash("sha256").update(normalized).digest("hex");
}
/**
 * Compares two idempotency keys after normalization.
 */
function idempotencyKeysEqual(first, second) {
    return normalizeIdempotencyKey(first) === normalizeIdempotencyKey(second);
}
