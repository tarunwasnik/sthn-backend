import { CurrencyMetadata } from
  "../../services/financial/currencyMetadata.service";

export interface CurrencyMetadataResponseDto {
  code: string;
  displayName: string;
  symbol: string;
  minorUnits: number;
  walletEnabled: boolean;
  topUpEnabled: boolean;
}

export function toCurrencyMetadataResponseDto(
  currency: CurrencyMetadata,
): CurrencyMetadataResponseDto {
  return {
    code: currency.code,
    displayName: currency.displayName,
    symbol: currency.symbol,
    minorUnits: currency.minorUnits,
    walletEnabled: currency.enabled,
    topUpEnabled: currency.enabled,
  };
}
