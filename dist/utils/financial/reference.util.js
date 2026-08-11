"use strict";
// backend/src/utils/financial/reference.util.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FINANCIAL_REFERENCE_PREFIX = void 0;
exports.generateFinancialReference = generateFinancialReference;
exports.hasReferenceType = hasReferenceType;
exports.isValidFinancialReference = isValidFinancialReference;
exports.getReferencePrefix = getReferencePrefix;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Internal financial reference prefixes.
 */
exports.FINANCIAL_REFERENCE_PREFIX = {
    PAYMENT: "PAY",
    REFUND: "REF",
    SETTLEMENT: "SET",
    WITHDRAWAL: "WDL",
    PAYOUT: "PAYOUT",
    PAYOUT_DESTINATION: "PDEST",
    LEDGER: "LEDGER",
    AUDIT: "AUDIT",
    BALANCE: "BAL",
    WALLET_TOP_UP: "TUP",
    INTERNAL_TOP_UP_FUNDING: "TUF",
    FX_RATE_SNAPSHOT: "FXR",
    WALLET_CONVERSION: "WCV",
};
/**
 * Generates an internal financial reference.
 *
 * Example:
 * PAY-20260717-7F8A2C91
 */
function generateFinancialReference(type) {
    const prefix = exports.FINANCIAL_REFERENCE_PREFIX[type];
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const random = crypto_1.default.randomBytes(4).toString("hex").toUpperCase();
    return `${prefix}-${date}-${random}`;
}
/**
 * Returns true if a financial reference has the expected prefix.
 */
function hasReferenceType(reference, type) {
    return reference.startsWith(`${exports.FINANCIAL_REFERENCE_PREFIX[type]}-`);
}
/**
 * Performs basic validation of an internal financial reference.
 */
function isValidFinancialReference(reference) {
    return /^[A-Z]+-\d{8}-[A-F0-9]{8}$/.test(reference);
}
/**
 * Extracts the reference prefix.
 *
 * Returns null if the reference format is invalid.
 */
function getReferencePrefix(reference) {
    if (!isValidFinancialReference(reference)) {
        return null;
    }
    return reference.split("-")[0] ?? null;
}
