import { FINANCIAL_LIMITS } from
  "../../constants/financial/financialLimits";
import { SupportedCurrency } from
  "../../constants/financial/supportedCurrencies";
import { WalletConversionRequestError } from
  "../../errors/financial/WalletConversionRequestError";
import { ExchangeRateSnapshotDocument } from
  "../../models/exchangeRateSnapshot.model";
import { parseScaledRate, scaledRateToDecimal } from
  "../../utils/financial/fxDecimal.util";
import { currencyMetadataService } from "./currencyMetadata.service";

const powerOfTen = (scale: number) => 10n ** BigInt(scale);

export interface WalletConversionQuote {
  sourceCurrency: SupportedCurrency;
  targetCurrency: SupportedCurrency;
  sourceAmount: number;
  targetAmount: number;
  sourceMinorUnits: number;
  targetMinorUnits: number;
  rateValue: string;
  rateScale: number;
  inverseRateValue: string;
  inverseRateScale: number;
}

export class WalletConversionQuoteService {
  normalizePair(source: unknown, target: unknown) {
    let sourceCurrency: SupportedCurrency;
    let targetCurrency: SupportedCurrency;
    try { sourceCurrency = currencyMetadataService.normalize(String(source ?? "")); }
    catch {
      throw new WalletConversionRequestError("Source currency is unsupported.",
        "WALLET_CONVERSION_INVALID_SOURCE_CURRENCY", 422);
    }
    try { targetCurrency = currencyMetadataService.normalize(String(target ?? "")); }
    catch {
      throw new WalletConversionRequestError("Target currency is unsupported.",
        "WALLET_CONVERSION_INVALID_TARGET_CURRENCY", 422);
    }
    if (sourceCurrency === targetCurrency) {
      throw new WalletConversionRequestError("Conversion currencies must differ.",
        "WALLET_CONVERSION_IDENTICAL_CURRENCIES", 422);
    }
    return { sourceCurrency, targetCurrency };
  }

  validateSourceAmount(value: unknown): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 ||
      value > FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT) {
      throw new WalletConversionRequestError("Source amount is invalid.",
        "WALLET_CONVERSION_INVALID_AMOUNT", 422);
    }
    return value;
  }

  calculate(sourceCurrencyInput: unknown, targetCurrencyInput: unknown,
    sourceAmountInput: unknown,
    snapshot: ExchangeRateSnapshotDocument): WalletConversionQuote {
    const { sourceCurrency, targetCurrency } = this.normalizePair(
      sourceCurrencyInput, targetCurrencyInput,
    );
    const sourceAmount = this.validateSourceAmount(sourceAmountInput);
    if (snapshot.baseCurrency !== sourceCurrency ||
      snapshot.quoteCurrency !== targetCurrency) {
      throw new WalletConversionRequestError("FX snapshot pair is inconsistent.",
        "WALLET_CONVERSION_FX_SNAPSHOT_CONFLICT", 409);
    }
    const rate = parseScaledRate(scaledRateToDecimal({
      value: snapshot.rateValue, scale: snapshot.rateScale,
    }));
    const inverse = parseScaledRate(scaledRateToDecimal({
      value: snapshot.inverseRateValue, scale: snapshot.inverseRateScale,
    }));
    const sourceMetadata = currencyMetadataService.get(sourceCurrency);
    const targetMetadata = currencyMetadataService.get(targetCurrency);
    const numerator = BigInt(sourceAmount) * BigInt(rate.value) *
      powerOfTen(targetMetadata.minorUnits);
    const denominator = powerOfTen(sourceMetadata.minorUnits + rate.scale);
    // Repository money parsing rounds to the nearest minor unit; ties round up.
    const rounded = (numerator + denominator / 2n) / denominator;
    if (rounded <= 0n) {
      throw new WalletConversionRequestError(
        "Calculated target amount is below one target minor unit.",
        "WALLET_CONVERSION_TARGET_AMOUNT_ZERO", 422,
      );
    }
    if (rounded > BigInt(FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT) ||
      rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new WalletConversionRequestError("Calculated target amount is invalid.",
        "WALLET_CONVERSION_INVALID_AMOUNT", 422);
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

export const walletConversionQuoteService = new WalletConversionQuoteService();
