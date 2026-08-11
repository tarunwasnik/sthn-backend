"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadFxRateConfiguration = exports.FX_RATE_FUTURE_TOLERANCE_MS = exports.FX_RATE_MAX_DECIMAL_SCALE = exports.FX_RATE_DEFAULT_TIMEOUT_MS = exports.FX_RATE_DEFAULT_SNAPSHOT_VALIDITY_MS = exports.FX_RATE_DEFAULT_MAX_AGE_MS = void 0;
exports.FX_RATE_DEFAULT_MAX_AGE_MS = 72 * 60 * 60 * 1000;
exports.FX_RATE_DEFAULT_SNAPSHOT_VALIDITY_MS = 24 * 60 * 60 * 1000;
exports.FX_RATE_DEFAULT_TIMEOUT_MS = 8000;
exports.FX_RATE_MAX_DECIMAL_SCALE = 12;
exports.FX_RATE_FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;
const boundedMs = (value, fallback) => {
    if (value === undefined)
        return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const loadFxRateConfiguration = () => {
    const pairs = process.env.FX_RATE_ENABLED_PAIRS?.split(",")
        .map((pair) => pair.trim().toUpperCase())
        .filter(Boolean);
    return {
        providerName: process.env.FX_RATE_PROVIDER_NAME?.trim() ?? "",
        baseUrl: process.env.FX_RATE_PROVIDER_BASE_URL?.trim() ?? "",
        apiKey: process.env.FX_RATE_PROVIDER_API_KEY?.trim() || undefined,
        timeoutMs: boundedMs(process.env.FX_RATE_PROVIDER_TIMEOUT_MS, exports.FX_RATE_DEFAULT_TIMEOUT_MS),
        maxAgeMs: boundedMs(process.env.FX_RATE_MAX_AGE_MS, exports.FX_RATE_DEFAULT_MAX_AGE_MS),
        snapshotValidityMs: boundedMs(process.env.FX_RATE_SNAPSHOT_VALIDITY_MS, exports.FX_RATE_DEFAULT_SNAPSHOT_VALIDITY_MS),
        requestEnabled: process.env.FX_RATE_PROVIDER_REQUEST_ENABLED === "true",
        enabledPairs: pairs?.length ? new Set(pairs) : undefined,
    };
};
exports.loadFxRateConfiguration = loadFxRateConfiguration;
