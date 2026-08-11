"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toFxRateSnapshotResponseDto = void 0;
const currencyMetadata_service_1 = require("../../services/financial/currencyMetadata.service");
const fxDecimal_util_1 = require("../../utils/financial/fxDecimal.util");
const toFxRateSnapshotResponseDto = (snapshot, options) => ({
    snapshotReference: snapshot.snapshotReference,
    provider: snapshot.provider,
    baseCurrency: snapshot.baseCurrency,
    quoteCurrency: snapshot.quoteCurrency,
    rate: (0, fxDecimal_util_1.scaledRateToDecimal)({ value: snapshot.rateValue,
        scale: snapshot.rateScale }),
    inverseRate: (0, fxDecimal_util_1.scaledRateToDecimal)({ value: snapshot.inverseRateValue,
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
    baseMinorUnits: currencyMetadata_service_1.currencyMetadataService.get(snapshot.baseCurrency).minorUnits,
    quoteMinorUnits: currencyMetadata_service_1.currencyMetadataService.get(snapshot.quoteCurrency).minorUnits,
});
exports.toFxRateSnapshotResponseDto = toFxRateSnapshotResponseDto;
