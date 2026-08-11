import { SupportedCurrency } from
  "../../constants/financial/supportedCurrencies";

export interface FxRateProviderRequest {
  baseCurrency: SupportedCurrency;
  quoteCurrency: SupportedCurrency;
  effectiveDate?: Date;
}

export interface FxRateProviderResult {
  provider: string;
  baseCurrency: SupportedCurrency;
  quoteCurrency: SupportedCurrency;
  rate: string;
  inverseRate?: string;
  effectiveDate: Date;
  fetchedAt: Date;
  providerReference?: string;
  providerPublishedAt?: Date;
  rawResponseFingerprint: string;
}

export interface FxRateProvider {
  readonly providerName: string;
  getReferenceRate(input: FxRateProviderRequest): Promise<FxRateProviderResult>;
}
