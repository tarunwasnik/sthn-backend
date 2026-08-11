"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fxRateSnapshotService = exports.FxRateSnapshotService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const fxRate_constants_1 = require("../../constants/financial/fxRate.constants");
const fxRateSnapshot_response_dto_1 = require("../../dtos/wallet/fxRateSnapshot.response.dto");
const exchangeRateSnapshotStatus_enum_1 = require("../../enums/financial/exchangeRateSnapshotStatus.enum");
const fxRateAuditAction_enum_1 = require("../../enums/financial/fxRateAuditAction.enum");
const FxRateSnapshotError_1 = require("../../errors/financial/FxRateSnapshotError");
const configuredReferenceFxRate_provider_1 = require("../../providers/fx/configuredReferenceFxRate.provider");
const exchangeRateSnapshot_repository_1 = require("../../repositories/exchangeRateSnapshot.repository");
const fxRateAudit_repository_1 = require("../../repositories/fxRateAudit.repository");
const fxDecimal_util_1 = require("../../utils/financial/fxDecimal.util");
const reference_util_1 = require("../../utils/financial/reference.util");
const currencyMetadata_service_1 = require("./currencyMetadata.service");
const hash = (value) => crypto_1.default.createHash("sha256").update(value).digest("hex");
class FxRateSnapshotService {
    constructor(provider = new configuredReferenceFxRate_provider_1.ConfiguredReferenceFxRateProvider(), options = {}) {
        this.provider = provider;
        this.options = options;
        this.config = options.config ?? (0, fxRate_constants_1.loadFxRateConfiguration)();
        this.now = options.now ?? (() => new Date());
    }
    pair(base, quote) {
        let baseCurrency;
        let quoteCurrency;
        try {
            baseCurrency = currencyMetadata_service_1.currencyMetadataService.normalize(String(base ?? ""));
        }
        catch {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("Base currency is unsupported.", "FX_RATE_UNSUPPORTED_BASE_CURRENCY", 422);
        }
        try {
            quoteCurrency = currencyMetadata_service_1.currencyMetadataService.normalize(String(quote ?? ""));
        }
        catch {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("Quote currency is unsupported.", "FX_RATE_UNSUPPORTED_QUOTE_CURRENCY", 422);
        }
        if (baseCurrency === quoteCurrency) {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX currencies must differ.", "FX_RATE_IDENTICAL_CURRENCIES", 422);
        }
        const pairKey = `${baseCurrency}:${quoteCurrency}`;
        if (this.config.enabledPairs && !this.config.enabledPairs.has(pairKey)) {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX currency pair is not enabled.", "FX_RATE_PAIR_NOT_SUPPORTED", 422);
        }
        return { baseCurrency, quoteCurrency };
    }
    isFresh(snapshot, now) {
        return snapshot.status === exchangeRateSnapshotStatus_enum_1.ExchangeRateSnapshotStatus.ACTIVE &&
            snapshot.validFrom <= now && snapshot.expiresAt > now &&
            now.getTime() - snapshot.effectiveDate.getTime() <= this.config.maxAgeMs;
    }
    immutableFingerprint(snapshot) {
        return hash([
            snapshot.provider, snapshot.providerReference ?? "",
            snapshot.baseCurrency, snapshot.quoteCurrency,
            snapshot.rateValue, snapshot.rateScale,
            snapshot.inverseRateValue, snapshot.inverseRateScale,
            snapshot.effectiveDate.toISOString(),
            snapshot.providerPublishedAt?.toISOString() ?? "",
            snapshot.fetchedAt.toISOString(), snapshot.validFrom.toISOString(),
            snapshot.expiresAt.toISOString(), snapshot.responseFingerprint,
        ].join("|"));
    }
    validatePersisted(snapshot) {
        if (snapshot.snapshotFingerprint !== this.immutableFingerprint(snapshot)) {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX snapshot fingerprint is invalid.", "FX_RATE_REPLAY_CONFLICT", 409);
        }
        this.pair(snapshot.baseCurrency, snapshot.quoteCurrency);
        (0, fxDecimal_util_1.parseScaledRate)((0, fxDecimal_util_1.scaledRateToDecimal)({ value: snapshot.rateValue,
            scale: snapshot.rateScale }));
        const derived = (0, fxDecimal_util_1.deriveInverseRate)({ value: snapshot.rateValue,
            scale: snapshot.rateScale });
        if (!(0, fxDecimal_util_1.scaledRatesWithinOneUnit)(derived, { value: snapshot.inverseRateValue,
            scale: snapshot.inverseRateScale })) {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX snapshot inverse rate is invalid.", "FX_RATE_REPLAY_CONFLICT", 409);
        }
    }
    normalize(result, pair) {
        if (result.provider !== this.provider.providerName ||
            result.baseCurrency !== pair.baseCurrency ||
            result.quoteCurrency !== pair.quoteCurrency) {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX provider returned the wrong pair.", "FX_RATE_PROVIDER_INVALID_RESPONSE", 502);
        }
        const rate = (0, fxDecimal_util_1.parseScaledRate)(result.rate);
        const derivedInverse = (0, fxDecimal_util_1.deriveInverseRate)(rate);
        if (result.inverseRate !== undefined) {
            const supplied = (0, fxDecimal_util_1.parseScaledRate)(result.inverseRate);
            if (!(0, fxDecimal_util_1.scaledRatesWithinOneUnit)(derivedInverse, supplied)) {
                throw new FxRateSnapshotError_1.FxRateSnapshotError("Provider inverse rate is inconsistent.", "FX_RATE_INVALID_RATE", 502);
            }
        }
        if (!(result.effectiveDate instanceof Date) ||
            Number.isNaN(result.effectiveDate.valueOf()) ||
            !(result.fetchedAt instanceof Date) || Number.isNaN(result.fetchedAt.valueOf())) {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX effective date is invalid.", "FX_RATE_INVALID_EFFECTIVE_DATE", 502);
        }
        const now = this.now();
        const effectiveDate = new Date(Date.UTC(result.effectiveDate.getUTCFullYear(), result.effectiveDate.getUTCMonth(), result.effectiveDate.getUTCDate()));
        if (effectiveDate.getTime() > now.getTime() + fxRate_constants_1.FX_RATE_FUTURE_TOLERANCE_MS) {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX effective date is in the future.", "FX_RATE_INVALID_EFFECTIVE_DATE", 502);
        }
        if (now.getTime() - effectiveDate.getTime() > this.config.maxAgeMs) {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX provider response is stale.", "FX_RATE_STALE_PROVIDER_RESPONSE", 502);
        }
        if (!/^[a-f0-9]{64}$/i.test(result.rawResponseFingerprint)) {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX provider fingerprint is invalid.", "FX_RATE_PROVIDER_INVALID_RESPONSE", 502);
        }
        const validFrom = new Date(result.fetchedAt);
        const expiresAt = new Date(validFrom.getTime() + this.config.snapshotValidityMs);
        const providerReference = result.providerReference?.trim() || undefined;
        const identitySeed = [result.provider, pair.baseCurrency, pair.quoteCurrency,
            effectiveDate.toISOString(), rate.value, rate.scale,
            providerReference ?? result.rawResponseFingerprint].join("|");
        const normalized = {
            provider: result.provider, providerReference,
            ...pair, rateValue: rate.value, rateScale: rate.scale,
            inverseRateValue: derivedInverse.value,
            inverseRateScale: derivedInverse.scale,
            effectiveDate,
            providerPublishedAt: result.providerPublishedAt,
            fetchedAt: new Date(result.fetchedAt), validFrom, expiresAt,
            responseFingerprint: result.rawResponseFingerprint,
            snapshotKey: hash(identitySeed), snapshotFingerprint: "",
        };
        normalized.snapshotFingerprint = this.immutableFingerprint(normalized);
        return normalized;
    }
    async inject(point) {
        await this.options.failureInjector?.(point);
    }
    auditKey(action, identity) {
        return hash(`${action}|${identity}`);
    }
    async persist(normalized, actor) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const session = await mongoose_1.default.startSession();
            let result = null;
            try {
                await session.withTransaction(async () => {
                    const existing = await exchangeRateSnapshot_repository_1.exchangeRateSnapshotRepository.findByKey(normalized.snapshotKey, session);
                    if (existing) {
                        this.validatePersisted(existing);
                        await fxRateAudit_repository_1.fxRateAuditRepository.createOnce({
                            auditKey: this.auditKey(fxRateAuditAction_enum_1.FxRateAuditAction.SNAPSHOT_REUSED, normalized.snapshotKey),
                            action: fxRateAuditAction_enum_1.FxRateAuditAction.SNAPSHOT_REUSED,
                            result: "REUSED", snapshotReference: existing.snapshotReference,
                            provider: existing.provider, baseCurrency: existing.baseCurrency,
                            quoteCurrency: existing.quoteCurrency,
                            effectiveDate: existing.effectiveDate,
                            rate: (0, fxDecimal_util_1.scaledRateToDecimal)({ value: existing.rateValue,
                                scale: existing.rateScale }), actorType: actor.type,
                            actorId: actor.id,
                        }, session);
                        result = existing;
                        return;
                    }
                    const current = await exchangeRateSnapshot_repository_1.exchangeRateSnapshotRepository.findCurrentPair(normalized.provider, normalized.baseCurrency, normalized.quoteCurrency, session);
                    if (current)
                        this.validatePersisted(current);
                    const snapshotReference = (0, reference_util_1.generateFinancialReference)("FX_RATE_SNAPSHOT");
                    const becomesCurrent = !current ||
                        normalized.effectiveDate >= current.effectiveDate;
                    if (current && becomesCurrent) {
                        const superseded = await exchangeRateSnapshot_repository_1.exchangeRateSnapshotRepository.supersedeActive(current.snapshotReference, snapshotReference, this.now(), session);
                        if (!superseded) {
                            throw new FxRateSnapshotError_1.FxRateSnapshotError("Current FX authority changed.", "FX_RATE_CURRENT_AUTHORITY_CONFLICT", 409);
                        }
                        await this.inject("AFTER_SUPERSESSION");
                    }
                    const created = await exchangeRateSnapshot_repository_1.exchangeRateSnapshotRepository.create({
                        snapshotReference, ...normalized,
                        status: becomesCurrent ? exchangeRateSnapshotStatus_enum_1.ExchangeRateSnapshotStatus.ACTIVE :
                            exchangeRateSnapshotStatus_enum_1.ExchangeRateSnapshotStatus.SUPERSEDED,
                        createdByType: actor.type, createdBy: actor.id, version: 1,
                    }, session);
                    await this.inject("AFTER_SNAPSHOT_CREATION");
                    await this.inject("BEFORE_AUDIT");
                    await fxRateAudit_repository_1.fxRateAuditRepository.createOnce({
                        auditKey: this.auditKey(fxRateAuditAction_enum_1.FxRateAuditAction.SNAPSHOT_CREATED, normalized.snapshotKey),
                        action: fxRateAuditAction_enum_1.FxRateAuditAction.SNAPSHOT_CREATED,
                        result: "SUCCEEDED", snapshotReference,
                        previousSnapshotReference: current?.snapshotReference,
                        provider: normalized.provider,
                        baseCurrency: normalized.baseCurrency,
                        quoteCurrency: normalized.quoteCurrency,
                        effectiveDate: normalized.effectiveDate,
                        rate: (0, fxDecimal_util_1.scaledRateToDecimal)({ value: normalized.rateValue,
                            scale: normalized.rateScale }), actorType: actor.type,
                        actorId: actor.id,
                    }, session);
                    if (current && becomesCurrent) {
                        await fxRateAudit_repository_1.fxRateAuditRepository.createOnce({
                            auditKey: this.auditKey(fxRateAuditAction_enum_1.FxRateAuditAction.SNAPSHOT_SUPERSEDED, `${current.snapshotReference}|${snapshotReference}`),
                            action: fxRateAuditAction_enum_1.FxRateAuditAction.SNAPSHOT_SUPERSEDED,
                            result: "SUCCEEDED",
                            snapshotReference: current.snapshotReference,
                            previousSnapshotReference: current.snapshotReference,
                            provider: current.provider, baseCurrency: current.baseCurrency,
                            quoteCurrency: current.quoteCurrency,
                            effectiveDate: current.effectiveDate,
                            rate: (0, fxDecimal_util_1.scaledRateToDecimal)({ value: current.rateValue,
                                scale: current.rateScale }), actorType: actor.type,
                            actorId: actor.id,
                        }, session);
                    }
                    await this.inject("BEFORE_COMMIT");
                    result = created;
                });
                if (result)
                    return result;
            }
            catch (error) {
                const raced = await exchangeRateSnapshot_repository_1.exchangeRateSnapshotRepository.findByKey(normalized.snapshotKey);
                if (raced) {
                    this.validatePersisted(raced);
                    return raced;
                }
                if (attempt === 2 || (error?.code !== 11000 &&
                    !error?.errorLabels?.includes?.("TransientTransactionError") &&
                    !(error instanceof FxRateSnapshotError_1.FxRateSnapshotError &&
                        error.code === "FX_RATE_CURRENT_AUTHORITY_CONFLICT")))
                    throw error;
            }
            finally {
                await session.endSession();
            }
        }
        throw new FxRateSnapshotError_1.FxRateSnapshotError("FX snapshot could not be persisted.", "FX_RATE_CURRENT_AUTHORITY_CONFLICT", 409);
    }
    async recordFailure(pair, actor, error) {
        const code = error instanceof FxRateSnapshotError_1.FxRateSnapshotError
            ? error.code : "FX_RATE_PROVIDER_UNAVAILABLE";
        await fxRateAudit_repository_1.fxRateAuditRepository.createOnce({
            auditKey: this.auditKey(fxRateAuditAction_enum_1.FxRateAuditAction.REFRESH_FAILED, `${this.provider.providerName}|${pair.baseCurrency}|${pair.quoteCurrency}|${code}|${this.now().toISOString().slice(0, 10)}`),
            action: fxRateAuditAction_enum_1.FxRateAuditAction.REFRESH_FAILED,
            result: "FAILED", provider: this.provider.providerName,
            baseCurrency: pair.baseCurrency, quoteCurrency: pair.quoteCurrency,
            failureCode: code, actorType: actor.type, actorId: actor.id,
        });
    }
    async requireCurrentSnapshot(base, quote) {
        const pair = this.pair(base, quote);
        const now = this.now();
        const current = await exchangeRateSnapshot_repository_1.exchangeRateSnapshotRepository.findCurrentPair(this.provider.providerName, pair.baseCurrency, pair.quoteCurrency);
        if (!current)
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX snapshot was not found.", "FX_RATE_SNAPSHOT_NOT_FOUND", 404);
        this.validatePersisted(current);
        if (!this.isFresh(current, now)) {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX snapshot is expired.", "FX_RATE_SNAPSHOT_EXPIRED", 409);
        }
        return current;
    }
    async validateStoredSnapshot(snapshotReference) {
        const snapshot = await exchangeRateSnapshot_repository_1.exchangeRateSnapshotRepository.findByReference(snapshotReference);
        if (!snapshot)
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX snapshot was not found.", "FX_RATE_SNAPSHOT_NOT_FOUND", 404);
        this.validatePersisted(snapshot);
        if (snapshot.status === exchangeRateSnapshotStatus_enum_1.ExchangeRateSnapshotStatus.INVALIDATED) {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX snapshot is invalidated.", "FX_RATE_REPLAY_CONFLICT", 409);
        }
        return snapshot;
    }
    async requireStoredSnapshotEligible(snapshotReference) {
        const snapshot = await this.validateStoredSnapshot(snapshotReference);
        const now = this.now();
        if (snapshot.validFrom > now || snapshot.expiresAt <= now ||
            now.getTime() - snapshot.effectiveDate.getTime() > this.config.maxAgeMs) {
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX snapshot is expired.", "FX_RATE_SNAPSHOT_EXPIRED", 409);
        }
        return snapshot;
    }
    async getCurrent(base, quote) {
        const now = this.now();
        const current = await this.requireCurrentSnapshot(base, quote);
        return (0, fxRateSnapshot_response_dto_1.toFxRateSnapshotResponseDto)(current, { now, cached: true });
    }
    async lookupOrRefresh(base, quote, actor = { type: "SYSTEM" }) {
        return this.refresh(base, quote, false, actor);
    }
    async refresh(base, quote, force, actor) {
        const pair = this.pair(base, quote);
        const now = this.now();
        const current = await exchangeRateSnapshot_repository_1.exchangeRateSnapshotRepository.findCurrentPair(this.provider.providerName, pair.baseCurrency, pair.quoteCurrency);
        if (current)
            this.validatePersisted(current);
        if (!force && current && this.isFresh(current, now)) {
            return (0, fxRateSnapshot_response_dto_1.toFxRateSnapshotResponseDto)(current, { now, cached: true });
        }
        try {
            // The external call deliberately occurs before any MongoDB transaction.
            const providerResult = await this.provider.getReferenceRate(pair);
            const normalized = this.normalize(providerResult, pair);
            await this.inject("AFTER_PROVIDER_VALIDATION");
            const snapshot = await this.persist(normalized, actor);
            return (0, fxRateSnapshot_response_dto_1.toFxRateSnapshotResponseDto)(snapshot, { now: this.now() });
        }
        catch (error) {
            await this.recordFailure(pair, actor, error);
            if (current && this.isFresh(current, this.now())) {
                return (0, fxRateSnapshot_response_dto_1.toFxRateSnapshotResponseDto)(current, {
                    now: this.now(), cached: true, cachedFallback: true,
                });
            }
            if (error instanceof FxRateSnapshotError_1.FxRateSnapshotError)
                throw error;
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX provider is unavailable.", "FX_RATE_PROVIDER_UNAVAILABLE", 502, error);
        }
    }
}
exports.FxRateSnapshotService = FxRateSnapshotService;
exports.fxRateSnapshotService = new FxRateSnapshotService();
