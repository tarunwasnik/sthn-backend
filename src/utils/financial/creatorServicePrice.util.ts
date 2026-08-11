import { FINANCIAL_LIMITS } from "../../constants/financial/financialLimits";
import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { currencyMetadataService } from "../../services/financial/currencyMetadata.service";

/** Converts a persisted creator-facing major-unit price exactly once for finance. */
export const creatorServiceMajorToMinor = (price: number,
  currency: SupportedCurrency): number => {
  if (!Number.isFinite(price) || price <= 0) throw new Error("Creator service price must be positive.");
  const minorUnits = currencyMetadataService.get(currency).minorUnits;
  const value = String(price);
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error("Creator service price is invalid.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > minorUnits) throw new Error("Creator service price exceeds currency precision.");
  const amount = Number(`${whole}${fraction.padEnd(minorUnits, "0")}`);
  if (!Number.isSafeInteger(amount) || amount < FINANCIAL_LIMITS.MIN_TRANSACTION_AMOUNT || amount > FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT) throw new Error("Creator service price is outside financial limits.");
  return amount;
};
