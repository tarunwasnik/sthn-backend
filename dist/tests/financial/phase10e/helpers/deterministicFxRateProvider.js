"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeterministicFxRateProvider = void 0;
const crypto_1 = __importDefault(require("crypto"));
const FxRateSnapshotError_1 = require("../../../../errors/financial/FxRateSnapshotError");
class DeterministicFxRateProvider {
    constructor(now) {
        this.now = now;
        this.providerName = "DETERMINISTIC_FX";
        this.callCount = 0;
        this.delayMs = 0;
        this.rates = new Map();
        this.queuedRates = [];
    }
    setRate(baseCurrency, quoteCurrency, value) {
        this.rates.set(`${baseCurrency}:${quoteCurrency}`, { ...value });
    }
    setFailure(error) {
        this.failure = error;
    }
    enqueueRate(value) {
        this.queuedRates.push({ ...value });
    }
    async getReferenceRate(input) {
        this.callCount += 1;
        const captured = this.queuedRates.shift() ?? this.rates.get(`${input.baseCurrency}:${input.quoteCurrency}`);
        const failure = this.failure;
        if (this.delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, this.delayMs));
        }
        if (failure)
            throw failure;
        if (!captured) {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("Deterministic rate is unavailable.", "FX_RATE_PROVIDER_UNAVAILABLE", 502);
        }
        const fingerprintSource = JSON.stringify({
            provider: this.providerName,
            baseCurrency: captured.returnedBaseCurrency ?? input.baseCurrency,
            quoteCurrency: captured.returnedQuoteCurrency ?? input.quoteCurrency,
            rate: captured.rate,
            inverseRate: captured.inverseRate,
            effectiveDate: captured.effectiveDate.toISOString(),
            providerReference: captured.providerReference,
        });
        return {
            provider: this.providerName,
            baseCurrency: captured.returnedBaseCurrency ?? input.baseCurrency,
            quoteCurrency: captured.returnedQuoteCurrency ?? input.quoteCurrency,
            rate: captured.rate,
            inverseRate: captured.inverseRate,
            effectiveDate: new Date(captured.effectiveDate),
            fetchedAt: this.now(),
            providerReference: captured.providerReference,
            providerPublishedAt: captured.providerPublishedAt,
            rawResponseFingerprint: crypto_1.default.createHash("sha256")
                .update(fingerprintSource).digest("hex"),
        };
    }
}
exports.DeterministicFxRateProvider = DeterministicFxRateProvider;
