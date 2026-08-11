"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toWalletConversionProviderExecutionResponseDto = void 0;
const toWalletConversionProviderExecutionResponseDto = (authority) => ({
    conversionReference: authority.conversionReference,
    providerReference: authority.providerRequestReference,
    providerStatus: authority.providerStatus,
    providerOutcome: authority.providerOutcome,
    processingAt: authority.processingAt,
    completedAt: authority.completedAt,
});
exports.toWalletConversionProviderExecutionResponseDto = toWalletConversionProviderExecutionResponseDto;
