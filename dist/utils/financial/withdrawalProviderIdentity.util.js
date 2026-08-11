"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveWithdrawalProviderExecutionIdentity = exports.deriveWithdrawalProviderIdentity = exports.deriveWithdrawalProviderCreatorReference = exports.INTERNAL_WITHDRAWAL_PROVIDER = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
exports.INTERNAL_WITHDRAWAL_PROVIDER = "INTERNAL";
const hash = (value) => node_crypto_1.default.createHash("sha256").update(value).digest("hex");
const deriveWithdrawalProviderCreatorReference = (creatorId) => `CRE-${hash(creatorId.toString()).slice(0, 16).toUpperCase()}`;
exports.deriveWithdrawalProviderCreatorReference = deriveWithdrawalProviderCreatorReference;
const deriveWithdrawalProviderIdentity = (input) => {
    const provider = input.provider ?? exports.INTERNAL_WITHDRAWAL_PROVIDER;
    const canonical = {
        version: 1,
        withdrawalReference: input.withdrawalReference,
        creatorId: input.creatorId.toString(),
        creatorReference: input.creatorReference,
        walletId: input.walletId.toString(),
        destinationReference: input.destinationReference,
        currency: input.currency,
        amount: input.amount,
        provider,
    };
    const providerFingerprint = hash(JSON.stringify(canonical));
    const providerRequestKey = `withdrawal-provider:${input.withdrawalReference}:${provider}`;
    const keyHash = hash(providerRequestKey).toUpperCase();
    return {
        provider,
        providerRequestKey,
        providerRequestReference: `IWPR-${keyHash.slice(0, 20)}`,
        providerReference: `INTERNAL-WD-${keyHash.slice(0, 24)}`,
        providerFingerprint,
        walletReference: `WAL-${hash(input.walletId.toString()).slice(0, 16).toUpperCase()}`,
        createdTransitionKey: `${providerRequestKey}:WITHDRAWAL_PROVIDER_CREATED`,
        initializedTransitionKey: `${providerRequestKey}:WITHDRAWAL_PROVIDER_INITIALIZED`,
    };
};
exports.deriveWithdrawalProviderIdentity = deriveWithdrawalProviderIdentity;
const deriveWithdrawalProviderExecutionIdentity = (input) => {
    const executionKey = `withdrawal-provider-execution:${input.providerRequestReference}`;
    const executionFingerprint = hash(JSON.stringify({
        version: 1,
        executionKey,
        providerRequestKey: input.providerRequestKey,
        providerReference: input.providerReference,
        providerFingerprint: input.providerFingerprint,
        provider: exports.INTERNAL_WITHDRAWAL_PROVIDER,
    }));
    return {
        executionKey,
        executionReference: `IWXE-${hash(executionKey).slice(0, 20).toUpperCase()}`,
        executionFingerprint,
        processingTransitionKey: `${executionKey}:WITHDRAWAL_PROVIDER_PROCESSING`,
        succeededTransitionKey: `${executionKey}:WITHDRAWAL_PROVIDER_SUCCEEDED`,
        failedTransitionKey: `${executionKey}:WITHDRAWAL_PROVIDER_FAILED`,
    };
};
exports.deriveWithdrawalProviderExecutionIdentity = deriveWithdrawalProviderExecutionIdentity;
