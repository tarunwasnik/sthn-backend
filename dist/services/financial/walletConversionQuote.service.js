"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletConversionQuoteService = exports.WalletConversionQuoteService = void 0;
const financialLimits_1 = require("../../constants/financial/financialLimits");
const WalletConversionRequestError_1 = require("../../errors/financial/WalletConversionRequestError");
const fxDecimal_util_1 = require("../../utils/financial/fxDecimal.util");
const currencyMetadata_service_1 = require("./currencyMetadata.service");
const powerOfTen = (scale) => 10n ** BigInt(scale);
class WalletConversionQuoteService {
    normalizePair(source, target) {
        let sourceCurrency;
        let targetCurrency;
        try {
            sourceCurrency = currencyMetadata_service_1.currencyMetadataService.normalize(String(source ?? ""));
        }
        catch {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Source currency is unsupported.", "WALLET_CONVERSION_INVALID_SOURCE_CURRENCY", 422);
        }
        try {
            targetCurrency = currencyMetadata_service_1.currencyMetadataService.normalize(String(target ?? ""));
        }
        catch {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Target currency is unsupported.", "WALLET_CONVERSION_INVALID_TARGET_CURRENCY", 422);
        }
        if (sourceCurrency === targetCurrency) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Conversion currencies must differ.", "WALLET_CONVERSION_IDENTICAL_CURRENCIES", 422);
        }
        return { sourceCurrency, targetCurrency };
    }
    validateSourceAmount(value) {
        if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 ||
            value > financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Source amount is invalid.", "WALLET_CONVERSION_INVALID_AMOUNT", 422);
        }
        return value;
    }
    calculate(sourceCurrencyInput, targetCurrencyInput, sourceAmountInput, snapshot) {
        const { sourceCurrency, targetCurrency } = this.normalizePair(sourceCurrencyInput, targetCurrencyInput);
        const sourceAmount = this.validateSourceAmount(sourceAmountInput);
        if (snapshot.baseCurrency !== sourceCurrency ||
            snapshot.quoteCurrency !== targetCurrency) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("FX snapshot pair is inconsistent.", "WALLET_CONVERSION_FX_SNAPSHOT_CONFLICT", 409);
        }
        const rate = (0, fxDecimal_util_1.parseScaledRate)((0, fxDecimal_util_1.scaledRateToDecimal)({
            value: snapshot.rateValue, scale: snapshot.rateScale,
        }));
        const inverse = (0, fxDecimal_util_1.parseScaledRate)((0, fxDecimal_util_1.scaledRateToDecimal)({
            value: snapshot.inverseRateValue, scale: snapshot.inverseRateScale,
        }));
        const sourceMetadata = currencyMetadata_service_1.currencyMetadataService.get(sourceCurrency);
        const targetMetadata = currencyMetadata_service_1.currencyMetadataService.get(targetCurrency);
        const numerator = BigInt(sourceAmount) * BigInt(rate.value) *
            powerOfTen(targetMetadata.minorUnits);
        const denominator = powerOfTen(sourceMetadata.minorUnits + rate.scale);
        // Repository money parsing rounds to the nearest minor unit; ties round up.
        const rounded = (numerator + denominator / 2n) / denominator;
        if (rounded <= 0n) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Calculated target amount is below one target minor unit.", "WALLET_CONVERSION_TARGET_AMOUNT_ZERO", 422);
        }
        if (rounded > BigInt(financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT) ||
            rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Calculated target amount is invalid.", "WALLET_CONVERSION_INVALID_AMOUNT", 422);
        }
        return {
            sourceCurrency, targetCurrency, sourceAmount,
            targetAmount: Number(rounded),
            sourceMinorUnits: sourceMetadata.minorUnits,
            targetMinorUnits: targetMetadata.minorUnits,
            rateValue: rate.value, rateScale: rate.scale,
            inverseRateValue: inverse.value, inverseRateScale: inverse.scale,
        };
    }
}
exports.WalletConversionQuoteService = WalletConversionQuoteService;
exports.walletConversionQuoteService = new WalletConversionQuoteService();
