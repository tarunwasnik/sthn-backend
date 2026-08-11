"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfiguredReferenceFxRateProvider = void 0;
const crypto_1 = __importDefault(require("crypto"));
const fxRate_constants_1 = require("../../constants/financial/fxRate.constants");
const FxRateSnapshotError_1 = require("../../errors/financial/FxRateSnapshotError");
class ConfiguredReferenceFxRateProvider {
    constructor(config = (0, fxRate_constants_1.loadFxRateConfiguration)()) {
        this.config = config;
    }
    get providerName() {
        return this.config.providerName;
    }
    async getReferenceRate(input) {
        if (!this.config.requestEnabled || !this.config.providerName ||
            !this.config.baseUrl) {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX provider is not configured.", "FX_RATE_PROVIDER_NOT_CONFIGURED", 502);
        }
        let url;
        try {
            url = new URL(this.config.baseUrl);
        }
        catch (error) {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX provider URL is invalid.", "FX_RATE_PROVIDER_NOT_CONFIGURED", 502, error);
        }
        url.searchParams.set("baseCurrency", input.baseCurrency);
        url.searchParams.set("quoteCurrency", input.quoteCurrency);
        if (input.effectiveDate) {
            url.searchParams.set("effectiveDate", input.effectiveDate.toISOString().slice(0, 10));
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
        try {
            const response = await fetch(url, {
                method: "GET",
                signal: controller.signal,
                headers: {
                    accept: "application/json",
                    ...(this.config.apiKey ? { "x-api-key": this.config.apiKey } : {}),
                },
            });
            if (!response.ok) {
                throw new FxRateSnapshotError_1.FxRateSnapshotError("FX provider is unavailable.", "FX_RATE_PROVIDER_UNAVAILABLE", 502);
            }
            const raw = await response.text();
            let payload;
            try {
                payload = JSON.parse(raw);
            }
            catch (error) {
                throw new FxRateSnapshotError_1.FxRateSnapshotError("FX provider response is malformed.", "FX_RATE_PROVIDER_INVALID_RESPONSE", 502, error);
            }
            if (payload.baseCurrency !== input.baseCurrency ||
                payload.quoteCurrency !== input.quoteCurrency ||
                typeof payload.rate !== "string" ||
                typeof payload.effectiveDate !== "string") {
                throw new FxRateSnapshotError_1.FxRateSnapshotError("FX provider response is invalid.", "FX_RATE_PROVIDER_INVALID_RESPONSE", 502);
            }
            const effectiveDate = new Date(payload.effectiveDate);
            const providerPublishedAt = payload.providerPublishedAt === undefined
                ? undefined : new Date(String(payload.providerPublishedAt));
            if (Number.isNaN(effectiveDate.valueOf()) ||
                (providerPublishedAt && Number.isNaN(providerPublishedAt.valueOf()))) {
                throw new FxRateSnapshotError_1.FxRateSnapshotError("FX provider effective date is invalid.", "FX_RATE_INVALID_EFFECTIVE_DATE", 502);
            }
            return {
                provider: this.config.providerName,
                baseCurrency: input.baseCurrency,
                quoteCurrency: input.quoteCurrency,
                rate: payload.rate,
                inverseRate: typeof payload.inverseRate === "string"
                    ? payload.inverseRate : undefined,
                effectiveDate,
                fetchedAt: new Date(),
                providerReference: typeof payload.providerReference === "string"
                    ? payload.providerReference.slice(0, 160) : undefined,
                providerPublishedAt,
                rawResponseFingerprint: crypto_1.default.createHash("sha256").update(raw).digest("hex"),
            };
        }
        catch (error) {
            if (error instanceof FxRateSnapshotError_1.FxRateSnapshotError)
                throw error;
            if (error instanceof Error && error.name === "AbortError") {
                throw new FxRateSnapshotError_1.FxRateSnapshotError("FX provider request timed out.", "FX_RATE_PROVIDER_TIMEOUT", 502, error);
            }
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX provider is unavailable.", "FX_RATE_PROVIDER_UNAVAILABLE", 502, error);
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.ConfiguredReferenceFxRateProvider = ConfiguredReferenceFxRateProvider;
