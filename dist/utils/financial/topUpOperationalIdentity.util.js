"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deterministicSnapshotFingerprint = exports.deterministicOperationalReference = exports.topUpProjectionFingerprint = exports.deriveTopUpOperationalAccountingIdentity = void 0;
const crypto_1 = __importDefault(require("crypto"));
const deriveTopUpOperationalAccountingIdentity = (request, funding) => {
    const seed = `${request.topUpReference}|${funding.fundingReference}|${request.userId}|${request.walletId}|${request.amount}|${request.currency}`;
    const transactionId = `TUA-${crypto_1.default.createHash("sha256").update(seed).digest("hex").slice(0, 24).toUpperCase()}`;
    const operationKey = `wallet-top-up:${transactionId}:projection`;
    return {
        transactionId,
        postingKey: `wallet-top-up:${transactionId}:ledger`,
        operationKey,
        operationReference: `WPO-${crypto_1.default.createHash("sha256").update(operationKey).digest("hex").slice(0, 16).toUpperCase()}`,
    };
};
exports.deriveTopUpOperationalAccountingIdentity = deriveTopUpOperationalAccountingIdentity;
const topUpProjectionFingerprint = (request, operationKey, ledgerEntryId) => {
    const canonical = [
        request.userId.toString(), request.currency, operationKey,
        request.amount, 0, 0, 0, 0, 0, ledgerEntryId,
    ].join("|");
    return crypto_1.default.createHash("sha256").update(canonical).digest("hex");
};
exports.topUpProjectionFingerprint = topUpProjectionFingerprint;
const deterministicOperationalReference = (prefix, identity, length = 24) => `${prefix}-${crypto_1.default.createHash("sha256").update(identity).digest("hex").slice(0, length).toUpperCase()}`;
exports.deterministicOperationalReference = deterministicOperationalReference;
const deterministicSnapshotFingerprint = (snapshot) => crypto_1.default.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
exports.deterministicSnapshotFingerprint = deterministicSnapshotFingerprint;
