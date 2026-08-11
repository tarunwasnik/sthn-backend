"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fingerprintWithdrawalOperationalSnapshot = exports.deriveCreatorWithdrawalRepairIdentity = exports.deriveCreatorWithdrawalRetryIdentity = exports.deriveCreatorWithdrawalReconciliationIdentity = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const hash = (value) => node_crypto_1.default.createHash("sha256").update(value).digest("hex");
const deriveCreatorWithdrawalReconciliationIdentity = (input) => {
    const reconciliationKey = `creator-withdrawal-reconciliation:${hash(JSON.stringify({ version: 1, ...input }))}`;
    return {
        reconciliationKey,
        reconciliationReference: `CWR-${hash(reconciliationKey).slice(0, 20).toUpperCase()}`,
    };
};
exports.deriveCreatorWithdrawalReconciliationIdentity = deriveCreatorWithdrawalReconciliationIdentity;
const deriveCreatorWithdrawalRetryIdentity = (input) => {
    const attemptKey = `creator-withdrawal-retry:${input.reconciliationReference}:` +
        `${input.withdrawalReference}:${input.attemptNumber}:` +
        `${input.snapshotFingerprint}:RETRY_FINALIZATION`;
    return {
        attemptKey,
        attemptReference: `CWRT-${hash(attemptKey).slice(0, 20).toUpperCase()}`,
    };
};
exports.deriveCreatorWithdrawalRetryIdentity = deriveCreatorWithdrawalRetryIdentity;
const deriveCreatorWithdrawalRepairIdentity = (input) => {
    const repairKey = `creator-withdrawal-repair:${input.reconciliationReference}:` +
        `${input.withdrawalReference}:${input.action}:${input.snapshotFingerprint}`;
    return {
        repairKey,
        repairReference: `CWRP-${hash(repairKey).slice(0, 20).toUpperCase()}`,
    };
};
exports.deriveCreatorWithdrawalRepairIdentity = deriveCreatorWithdrawalRepairIdentity;
const fingerprintWithdrawalOperationalSnapshot = (snapshot) => hash(JSON.stringify(snapshot));
exports.fingerprintWithdrawalOperationalSnapshot = fingerprintWithdrawalOperationalSnapshot;
