import { ExchangeRateSnapshotDocument } from
  "../../models/exchangeRateSnapshot.model";
import { currencyMetadataService } from
  "../../services/financial/currencyMetadata.service";
import { scaledRateToDecimal } from
  "../../utils/financial/fxDecimal.util";

export interface FxRateSnapshotResponseDto {
  snapshotReference: string;
  provider: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  inverseRate: string;
  effectiveDate: string;
  providerPublishedAt?: Date;
  fetchedAt: Date;
  validFrom: Date;
  expiresAt: Date;
  isCurrent: boolean;
  isStale: boolean;
  cached: boolean;
  cachedFallback: boolean;
  baseMinorUnits: number;
  quoteMinorUnits: number;
}

export const toFxRateSnapshotResponseDto = (
  snapshot: ExchangeRateSnapshotDocument,
  options: { now: Date; cached?: boolean; cachedFallback?: boolean },
): FxRateSnapshotResponseDto => ({
  snapshotReference: snapshot.snapshotReference,
  provider: snapshot.provider,
  baseCurrency: snapshot.baseCurrency,
  quoteCurrency: snapshot.quoteCurrency,
  rate: scaledRateToDecimal({ value: snapshot.rateValue,
    scale: snapshot.rateScale }),
  inverseRate: scaledRateToDecimal({ value: snapshot.inverseRateValue,
    scale: snapshot.inverseRateScale }),
  effectiveDate: snapshot.effectiveDate.toISOString().slice(0, 10),
  providerPublishedAt: snapshot.providerPublishedAt,
  fetchedAt: snapshot.fetchedAt,
  validFrom: snapshot.validFrom,
  expiresAt: snapshot.expiresAt,
  isCurrent: snapshot.status === "ACTIVE",
  isStale: snapshot.expiresAt <= options.now,
  cached: options.cached ?? false,
  cachedFallback: options.cachedFallback ?? false,
  baseMinorUnits: currencyMetadataService.get(snapshot.baseCurrency).minorUnits,
  quoteMinorUnits: currencyMetadataService.get(snapshot.quoteCurrency).minorUnits,
});
