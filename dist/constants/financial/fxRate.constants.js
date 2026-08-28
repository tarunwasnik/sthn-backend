"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadFxRateConfiguration = exports.FxRateProviderMode = exports.FX_RATE_FUTURE_TOLERANCE_MS = exports.FX_RATE_MAX_DECIMAL_SCALE = exports.FX_RATE_DEFAULT_TIMEOUT_MS = exports.FX_RATE_DEFAULT_SNAPSHOT_VALIDITY_MS = exports.FX_RATE_DEFAULT_MAX_AGE_MS = void 0;
exports.FX_RATE_DEFAULT_MAX_AGE_MS = 72 * 60 * 60 * 1000;
exports.FX_RATE_DEFAULT_SNAPSHOT_VALIDITY_MS = 24 * 60 * 60 * 1000;
exports.FX_RATE_DEFAULT_TIMEOUT_MS = 8000;
exports.FX_RATE_MAX_DECIMAL_SCALE = 12;
exports.FX_RATE_FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;
var FxRateProviderMode;
(function (FxRateProviderMode) {
    FxRateProviderMode["REFERENCE"] = "REFERENCE";
    FxRateProviderMode["INTERNAL"] = "INTERNAL";
})(FxRateProviderMode || (exports.FxRateProviderMode = FxRateProviderMode = {}));
const boundedMs = (value, fallback) => {
    if (value === undefined)
        return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const providerMode = (value) => {
    const normalized = value?.trim().toUpperCase() ||
        FxRateProviderMode.REFERENCE;
    if (normalized === FxRateProviderMode.REFERENCE) {
        return FxRateProviderMode.REFERENCE;
    }
    if (normalized === FxRateProviderMode.INTERNAL) {
        return FxRateProviderMode.INTERNAL;
    }
    throw new Error("FX_RATE_PROVIDER_MODE must be REFERENCE or INTERNAL.");
};
const loadFxRateConfiguration = () => {
    const pairs = process.env.FX_RATE_ENABLED_PAIRS?.split(",")
        .map((pair) => pair.trim().toUpperCase())
        .filter(Boolean);
    return {
        providerMode: providerMode(process.env.FX_RATE_PROVIDER_MODE),
        providerName: process.env.FX_RATE_PROVIDER_NAME?.trim() ?? "",
        baseUrl: process.env.FX_RATE_PROVIDER_BASE_URL?.trim() ?? "",
        apiKey: process.env.FX_RATE_PROVIDER_API_KEY?.trim() || undefined,
        timeoutMs: boundedMs(process.env.FX_RATE_PROVIDER_TIMEOUT_MS, exports.FX_RATE_DEFAULT_TIMEOUT_MS),
        maxAgeMs: boundedMs(process.env.FX_RATE_MAX_AGE_MS, exports.FX_RATE_DEFAULT_MAX_AGE_MS),
        snapshotValidityMs: boundedMs(process.env.FX_RATE_SNAPSHOT_VALIDITY_MS, exports.FX_RATE_DEFAULT_SNAPSHOT_VALIDITY_MS),
        requestEnabled: process.env.FX_RATE_PROVIDER_REQUEST_ENABLED === "true",
        enabledPairs: pairs?.length ? new Set(pairs) : undefined,
        internalInrUsdRate: process.env.FX_INTERNAL_RATE_INR_USD?.trim() || undefined,
    };
};
exports.loadFxRateConfiguration = loadFxRateConfiguration;
