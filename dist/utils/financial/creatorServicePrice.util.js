"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.creatorServiceMajorToMinor = void 0;
const financialLimits_1 = require("../../constants/financial/financialLimits");
const currencyMetadata_service_1 = require("../../services/financial/currencyMetadata.service");
/** Converts a persisted creator-facing major-unit price exactly once for finance. */
const creatorServiceMajorToMinor = (price, currency) => {
    if (!Number.isFinite(price) || price <= 0)
        throw new Error("Creator service price must be positive.");
    const minorUnits = currencyMetadata_service_1.currencyMetadataService.get(currency).minorUnits;
    const value = String(price);
    if (!/^\d+(?:\.\d+)?$/.test(value))
        throw new Error("Creator service price is invalid.");
    const [whole, fraction = ""] = value.split(".");
    if (fraction.length > minorUnits)
        throw new Error("Creator service price exceeds currency precision.");
    const amount = Number(`${whole}${fraction.padEnd(minorUnits, "0")}`);
    if (!Number.isSafeInteger(amount) || amount < financialLimits_1.FINANCIAL_LIMITS.MIN_TRANSACTION_AMOUNT || amount > financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT)
        throw new Error("Creator service price is outside financial limits.");
    return amount;
};
exports.creatorServiceMajorToMinor = creatorServiceMajorToMinor;
