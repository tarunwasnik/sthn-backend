"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalFxRateProvider = void 0;
const crypto_1 = __importDefault(require("crypto"));
const fxRate_constants_1 = require("../../constants/financial/fxRate.constants");
const FxRateSnapshotError_1 = require("../../errors/financial/FxRateSnapshotError");
const fxDecimal_util_1 = require("../../utils/financial/fxDecimal.util");
const INTERNAL_PROVIDER_NAME = "INTERNAL_FX_SIMULATOR";
class InternalFxRateProvider {
    constructor(config = (0, fxRate_constants_1.loadFxRateConfiguration)(), now = () => new Date()) {
        this.config = config;
        this.now = now;
    }
    get providerName() {
        return INTERNAL_PROVIDER_NAME;
    }
    async getReferenceRate(input) {
        if (input.baseCurrency !== "INR" || input.quoteCurrency !== "USD") {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX currency pair is not enabled.", "FX_RATE_PAIR_NOT_SUPPORTED", 422);
        }
        const configuredRate = this.config.internalInrUsdRate;
        if (!configuredRate) {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("Internal FX simulator rate is not configured.", "FX_RATE_PROVIDER_NOT_CONFIGURED", 502);
        }
        const normalizedRate = (0, fxDecimal_util_1.parseScaledRate)(configuredRate);
        const rate = configuredRate.trim();
        const fetchedAt = this.now();
        const effectiveDate = new Date(Date.UTC(fetchedAt.getUTCFullYear(), fetchedAt.getUTCMonth(), fetchedAt.getUTCDate()));
        const providerReference = `INTERNAL-INR-USD-${effectiveDate.toISOString().slice(0, 10)}`;
        return {
            provider: this.providerName,
            baseCurrency: input.baseCurrency,
            quoteCurrency: input.quoteCurrency,
            rate,
            effectiveDate,
            fetchedAt,
            providerReference,
            rawResponseFingerprint: crypto_1.default.createHash("sha256").update([
                this.providerName, input.baseCurrency, input.quoteCurrency,
                normalizedRate.value, normalizedRate.scale, effectiveDate.toISOString(),
            ].join("|")).digest("hex"),
        };
    }
}
exports.InternalFxRateProvider = InternalFxRateProvider;
