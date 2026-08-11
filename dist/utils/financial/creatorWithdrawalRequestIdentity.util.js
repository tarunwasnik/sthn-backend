"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveCreatorWithdrawalRequestIdentity = exports.deriveCreatorWithdrawalProjectionFingerprint = exports.deriveCreatorWithdrawalAuthorityFingerprint = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const hash = (value) => node_crypto_1.default.createHash("sha256").update(value).digest("hex");
const deriveCreatorWithdrawalAuthorityFingerprint = (input) => hash(JSON.stringify({
    version: 1,
    withdrawalReference: input.withdrawalReference,
    creatorId: input.creatorId.toString(),
    creatorUserId: input.creatorUserId.toString(),
    walletId: input.walletId.toString(),
    destinationId: input.destinationId.toString(),
    destinationReference: input.destinationReference,
    currency: input.currency,
    amount: input.amount,
}));
exports.deriveCreatorWithdrawalAuthorityFingerprint = deriveCreatorWithdrawalAuthorityFingerprint;
const deriveCreatorWithdrawalProjectionFingerprint = (input) => hash([
    input.creatorUserId.toString(),
    input.currency,
    input.operationKey,
    -input.amount,
    input.amount,
    0,
    input.amount,
    0,
    0,
    input.ledgerEntryIds.slice()
        .sort((a, b) => a.toString().localeCompare(b.toString()))
        .map(String).join(","),
].join("|"));
exports.deriveCreatorWithdrawalProjectionFingerprint = deriveCreatorWithdrawalProjectionFingerprint;
const deriveCreatorWithdrawalRequestIdentity = (input) => {
    const withdrawalKey = `creator-withdrawal:${input.creatorUserId.toString()}:` +
        input.idempotencyKey;
    const withdrawalReference = `CWR-${hash(withdrawalKey).slice(0, 20).toUpperCase()}`;
    const requestFingerprint = (0, exports.deriveCreatorWithdrawalAuthorityFingerprint)({
        withdrawalReference,
        creatorId: input.creatorId,
        creatorUserId: input.creatorUserId,
        walletId: input.walletId,
        destinationId: input.destinationId,
        destinationReference: input.destinationReference,
        currency: input.currency,
        amount: input.amount,
    });
    const ledgerTransactionReference = `creator-withdrawal-reservation:${withdrawalReference}`;
    const projectionOperationKey = `${ledgerTransactionReference}:wallet-projection`;
    return {
        withdrawalReference,
        withdrawalKey,
        requestFingerprint,
        ledgerTransactionReference,
        availableDebitPostingKey: `${ledgerTransactionReference}:wallet-available-debit`,
        reservedCreditPostingKey: `${ledgerTransactionReference}:withdrawal-reserved-credit`,
        projectionOperationKey,
        projectionReference: `WPO-${hash(projectionOperationKey).slice(0, 16).toUpperCase()}`,
    };
};
exports.deriveCreatorWithdrawalRequestIdentity = deriveCreatorWithdrawalRequestIdentity;
