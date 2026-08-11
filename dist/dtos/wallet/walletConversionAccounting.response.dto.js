"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toWalletConversionAccountingResponseDto = void 0;
const toWalletConversionAccountingResponseDto = (request) => ({
    conversionReference: request.conversionReference,
    status: request.status,
    sourceCurrency: request.sourceCurrency,
    targetCurrency: request.targetCurrency,
    sourceAmount: request.sourceAmount,
    targetAmount: request.targetAmount,
    completedAt: request.completedAt,
});
exports.toWalletConversionAccountingResponseDto = toWalletConversionAccountingResponseDto;
