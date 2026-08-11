"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveWalletConversionRepairIdentity = exports.deriveWalletConversionRetryIdentity = exports.deriveWalletConversionReconciliationIdentity = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const hash = (value) => node_crypto_1.default.createHash("sha256").update(value).digest("hex");
const deriveWalletConversionReconciliationIdentity = (conversionReference) => {
    const reconciliationKey = `wallet-conversion-reconciliation:${conversionReference}`;
    return { reconciliationKey, reconciliationReference: `WCR-${hash(reconciliationKey).slice(0, 20).toUpperCase()}` };
};
exports.deriveWalletConversionReconciliationIdentity = deriveWalletConversionReconciliationIdentity;
const deriveWalletConversionRetryIdentity = (conversionReference) => {
    const attemptKey = `wallet-conversion-retry:${conversionReference}`;
    return { attemptKey, attemptReference: `WCRT-${hash(attemptKey).slice(0, 20).toUpperCase()}` };
};
exports.deriveWalletConversionRetryIdentity = deriveWalletConversionRetryIdentity;
const deriveWalletConversionRepairIdentity = (conversionReference, action) => {
    const repairKey = `wallet-conversion-repair:${conversionReference}:${action}`;
    return { repairKey, repairReference: `WCRP-${hash(repairKey).slice(0, 20).toUpperCase()}` };
};
exports.deriveWalletConversionRepairIdentity = deriveWalletConversionRepairIdentity;
