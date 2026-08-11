"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCurrencyMetadataResponseDto = toCurrencyMetadataResponseDto;
function toCurrencyMetadataResponseDto(currency) {
    return {
        code: currency.code,
        displayName: currency.displayName,
        symbol: currency.symbol,
        minorUnits: currency.minorUnits,
        walletEnabled: currency.enabled,
        topUpEnabled: currency.enabled,
    };
}
