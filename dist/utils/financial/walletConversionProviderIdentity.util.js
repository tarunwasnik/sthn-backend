"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveWalletConversionProviderIdentity = exports.INTERNAL_WALLET_CONVERSION_PROVIDER = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
exports.INTERNAL_WALLET_CONVERSION_PROVIDER = "INTERNAL";
const hash = (value) => node_crypto_1.default.createHash("sha256").update(value).digest("hex");
const deriveWalletConversionProviderIdentity = (input) => {
    const providerRequestKey = `wallet-conversion-provider:${input.conversionReference}:` +
        exports.INTERNAL_WALLET_CONVERSION_PROVIDER;
    const requestHash = hash(providerRequestKey).toUpperCase();
    const providerRequestReference = `IWCPR-${requestHash.slice(0, 20)}`;
    const executionKey = `wallet-conversion-provider-execution:${providerRequestReference}`;
    const providerExecutionReference = `IWCXE-${hash(executionKey).slice(0, 20).toUpperCase()}`;
    const canonical = {
        version: 1,
        conversionReference: input.conversionReference,
        userId: input.userId.toString(),
        sourceWalletId: input.sourceWalletId.toString(),
        targetWalletId: input.targetWalletId?.toString() ?? null,
        sourceCurrency: input.sourceCurrency,
        targetCurrency: input.targetCurrency,
        sourceAmount: input.sourceAmount,
        targetAmount: input.targetAmount,
        fxSnapshotReference: input.fxSnapshotReference,
        fxProvider: input.fxProvider,
        fxEffectiveDate: input.fxEffectiveDate.toISOString(),
        provider: exports.INTERNAL_WALLET_CONVERSION_PROVIDER,
        providerExecutionReference,
    };
    const providerFingerprint = hash(JSON.stringify(canonical));
    const executionFingerprint = hash(JSON.stringify({
        version: 1, providerRequestKey, providerRequestReference,
        providerExecutionReference, providerFingerprint,
        provider: exports.INTERNAL_WALLET_CONVERSION_PROVIDER,
    }));
    return {
        providerRequestKey, providerRequestReference, providerExecutionReference,
        providerFingerprint, executionFingerprint,
        createdTransitionKey: `${providerRequestKey}:CONVERSION_PROVIDER_CREATED`,
        initializedTransitionKey: `${providerRequestKey}:CONVERSION_PROVIDER_INITIALIZED`,
        processingTransitionKey: `${executionKey}:CONVERSION_PROVIDER_PROCESSING`,
        succeededTransitionKey: `${executionKey}:CONVERSION_PROVIDER_SUCCEEDED`,
        failedTransitionKey: `${executionKey}:CONVERSION_PROVIDER_FAILED`,
    };
};
exports.deriveWalletConversionProviderIdentity = deriveWalletConversionProviderIdentity;
