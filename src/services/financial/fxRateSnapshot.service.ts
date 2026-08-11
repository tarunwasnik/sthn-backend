import crypto from "crypto";
import mongoose, { ClientSession, Types } from "mongoose";

import {
  FxRateConfiguration,
  FX_RATE_FUTURE_TOLERANCE_MS,
  loadFxRateConfiguration,
} from "../../constants/financial/fxRate.constants";
import { SupportedCurrency } from
  "../../constants/financial/supportedCurrencies";
import { toFxRateSnapshotResponseDto } from
  "../../dtos/wallet/fxRateSnapshot.response.dto";
import { ExchangeRateSnapshotStatus } from
  "../../enums/financial/exchangeRateSnapshotStatus.enum";
import { FxRateAuditAction } from
  "../../enums/financial/fxRateAuditAction.enum";
import { FxRateSnapshotError } from
  "../../errors/financial/FxRateSnapshotError";
import { ExchangeRateSnapshotDocument } from
  "../../models/exchangeRateSnapshot.model";
import { FxRateProvider, FxRateProviderResult } from
  "../../providers/fx/fxRateProvider";
import { createFxRateProvider } from
  "../../providers/fx/fxRateProvider.selector";
import { exchangeRateSnapshotRepository } from
  "../../repositories/exchangeRateSnapshot.repository";
import { fxRateAuditRepository } from
  "../../repositories/fxRateAudit.repository";
import {
  deriveInverseRate,
  parseScaledRate,
  scaledRatesWithinOneUnit,
  scaledRateToDecimal,
} from "../../utils/financial/fxDecimal.util";
import { generateFinancialReference } from
  "../../utils/financial/reference.util";
import { currencyMetadataService } from "./currencyMetadata.service";

interface FxActor {
  type: "ADMIN" | "SYSTEM";
  id?: Types.ObjectId;
}

interface Pair {
  baseCurrency: SupportedCurrency;
  quoteCurrency: SupportedCurrency;
}

interface NormalizedProviderRate extends Pair {
  provider: string;
  providerReference?: string;
  rateValue: string;
  rateScale: number;
  inverseRateValue: string;
  inverseRateScale: number;
  effectiveDate: Date;
  providerPublishedAt?: Date;
  fetchedAt: Date;
  validFrom: Date;
  expiresAt: Date;
  responseFingerprint: string;
  snapshotKey: string;
  snapshotFingerprint: string;
}

type FailurePoint = "AFTER_PROVIDER_VALIDATION" | "AFTER_SUPERSESSION" |
  "AFTER_SNAPSHOT_CREATION" | "BEFORE_AUDIT" | "BEFORE_COMMIT";

interface ServiceOptions {
  config?: FxRateConfiguration;
  now?: () => Date;
  failureInjector?: (point: FailurePoint) => void | Promise<void>;
}

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export class FxRateSnapshotService {
  private readonly config: FxRateConfiguration;
  private readonly now: () => Date;
  private readonly provider: FxRateProvider;

  constructor(
    provider: FxRateProvider | undefined = undefined,
    private readonly options: ServiceOptions = {},
  ) {
    this.config = options.config ?? loadFxRateConfiguration();
    this.now = options.now ?? (() => new Date());
    this.provider = provider ?? createFxRateProvider(this.config);
  }

  private pair(base: unknown, quote: unknown): Pair {
    let baseCurrency: SupportedCurrency;
    let quoteCurrency: SupportedCurrency;
    try { baseCurrency = currencyMetadataService.normalize(String(base ?? "")); }
    catch { throw new FxRateSnapshotError("Base currency is unsupported.",
      "FX_RATE_UNSUPPORTED_BASE_CURRENCY", 422); }
    try { quoteCurrency = currencyMetadataService.normalize(String(quote ?? "")); }
    catch { throw new FxRateSnapshotError("Quote currency is unsupported.",
      "FX_RATE_UNSUPPORTED_QUOTE_CURRENCY", 422); }
    if (baseCurrency === quoteCurrency) {
      throw new FxRateSnapshotError("FX currencies must differ.",
        "FX_RATE_IDENTICAL_CURRENCIES", 422);
    }
    const pairKey = `${baseCurrency}:${quoteCurrency}`;
    if (this.config.enabledPairs && !this.config.enabledPairs.has(pairKey)) {
      throw new FxRateSnapshotError("FX currency pair is not enabled.",
        "FX_RATE_PAIR_NOT_SUPPORTED", 422);
    }
    return { baseCurrency, quoteCurrency };
  }

  private isFresh(snapshot: ExchangeRateSnapshotDocument, now: Date): boolean {
    return snapshot.status === ExchangeRateSnapshotStatus.ACTIVE &&
      snapshot.validFrom <= now && snapshot.expiresAt > now &&
      now.getTime() - snapshot.effectiveDate.getTime() <= this.config.maxAgeMs;
  }

  private immutableFingerprint(snapshot: {
    provider: string; providerReference?: string; baseCurrency: string;
    quoteCurrency: string; rateValue: string; rateScale: number;
    inverseRateValue: string; inverseRateScale: number; effectiveDate: Date;
    providerPublishedAt?: Date; fetchedAt: Date; validFrom: Date; expiresAt: Date;
    responseFingerprint: string;
  }): string {
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

  private validatePersisted(snapshot: ExchangeRateSnapshotDocument): void {
    if (snapshot.snapshotFingerprint !== this.immutableFingerprint(snapshot)) {
      throw new FxRateSnapshotError("FX snapshot fingerprint is invalid.",
        "FX_RATE_REPLAY_CONFLICT", 409);
    }
    this.pair(snapshot.baseCurrency, snapshot.quoteCurrency);
    parseScaledRate(scaledRateToDecimal({ value: snapshot.rateValue,
      scale: snapshot.rateScale }));
    const derived = deriveInverseRate({ value: snapshot.rateValue,
      scale: snapshot.rateScale });
    if (!scaledRatesWithinOneUnit(derived, { value: snapshot.inverseRateValue,
      scale: snapshot.inverseRateScale })) {
      throw new FxRateSnapshotError("FX snapshot inverse rate is invalid.",
        "FX_RATE_REPLAY_CONFLICT", 409);
    }
  }

  private normalize(result: FxRateProviderResult, pair: Pair): NormalizedProviderRate {
    if (result.provider !== this.provider.providerName ||
      result.baseCurrency !== pair.baseCurrency ||
      result.quoteCurrency !== pair.quoteCurrency) {
      throw new FxRateSnapshotError("FX provider returned the wrong pair.",
        "FX_RATE_PROVIDER_INVALID_RESPONSE", 502);
    }
    const rate = parseScaledRate(result.rate);
    const derivedInverse = deriveInverseRate(rate);
    if (result.inverseRate !== undefined) {
      const supplied = parseScaledRate(result.inverseRate);
      if (!scaledRatesWithinOneUnit(derivedInverse, supplied)) {
        throw new FxRateSnapshotError("Provider inverse rate is inconsistent.",
          "FX_RATE_INVALID_RATE", 502);
      }
    }
    if (!(result.effectiveDate instanceof Date) ||
      Number.isNaN(result.effectiveDate.valueOf()) ||
      !(result.fetchedAt instanceof Date) || Number.isNaN(result.fetchedAt.valueOf())) {
      throw new FxRateSnapshotError("FX effective date is invalid.",
        "FX_RATE_INVALID_EFFECTIVE_DATE", 502);
    }
    const now = this.now();
    const effectiveDate = new Date(Date.UTC(result.effectiveDate.getUTCFullYear(),
      result.effectiveDate.getUTCMonth(), result.effectiveDate.getUTCDate()));
    if (effectiveDate.getTime() > now.getTime() + FX_RATE_FUTURE_TOLERANCE_MS) {
      throw new FxRateSnapshotError("FX effective date is in the future.",
        "FX_RATE_INVALID_EFFECTIVE_DATE", 502);
    }
    if (now.getTime() - effectiveDate.getTime() > this.config.maxAgeMs) {
      throw new FxRateSnapshotError("FX provider response is stale.",
        "FX_RATE_STALE_PROVIDER_RESPONSE", 502);
    }
    if (!/^[a-f0-9]{64}$/i.test(result.rawResponseFingerprint)) {
      throw new FxRateSnapshotError("FX provider fingerprint is invalid.",
        "FX_RATE_PROVIDER_INVALID_RESPONSE", 502);
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

  private async inject(point: FailurePoint): Promise<void> {
    await this.options.failureInjector?.(point);
  }

  private auditKey(action: FxRateAuditAction, identity: string): string {
    return hash(`${action}|${identity}`);
  }

  private async persist(
    normalized: NormalizedProviderRate,
    actor: FxActor,
  ): Promise<ExchangeRateSnapshotDocument> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const session = await mongoose.startSession();
      let result: ExchangeRateSnapshotDocument | null = null;
      try {
        await session.withTransaction(async () => {
          const existing = await exchangeRateSnapshotRepository.findByKey(
            normalized.snapshotKey, session,
          );
          if (existing) {
            this.validatePersisted(existing);
            await fxRateAuditRepository.createOnce({
              auditKey: this.auditKey(FxRateAuditAction.SNAPSHOT_REUSED,
                normalized.snapshotKey),
              action: FxRateAuditAction.SNAPSHOT_REUSED,
              result: "REUSED", snapshotReference: existing.snapshotReference,
              provider: existing.provider, baseCurrency: existing.baseCurrency,
              quoteCurrency: existing.quoteCurrency,
              effectiveDate: existing.effectiveDate,
              rate: scaledRateToDecimal({ value: existing.rateValue,
                scale: existing.rateScale }), actorType: actor.type,
              actorId: actor.id,
            } as any, session);
            result = existing;
            return;
          }
          const current = await exchangeRateSnapshotRepository.findCurrentPair(
            normalized.provider, normalized.baseCurrency,
            normalized.quoteCurrency, session,
          );
          if (current) this.validatePersisted(current);
          const snapshotReference = generateFinancialReference("FX_RATE_SNAPSHOT");
          const becomesCurrent = !current ||
            normalized.effectiveDate >= current.effectiveDate;
          if (current && becomesCurrent) {
            const superseded = await exchangeRateSnapshotRepository.supersedeActive(
              current.snapshotReference, snapshotReference, this.now(), session,
            );
            if (!superseded) {
              throw new FxRateSnapshotError("Current FX authority changed.",
                "FX_RATE_CURRENT_AUTHORITY_CONFLICT", 409);
            }
            await this.inject("AFTER_SUPERSESSION");
          }
          const created = await exchangeRateSnapshotRepository.create({
            snapshotReference, ...normalized,
            status: becomesCurrent ? ExchangeRateSnapshotStatus.ACTIVE :
              ExchangeRateSnapshotStatus.SUPERSEDED,
            createdByType: actor.type, createdBy: actor.id, version: 1,
          } as any, session);
          await this.inject("AFTER_SNAPSHOT_CREATION");
          await this.inject("BEFORE_AUDIT");
          await fxRateAuditRepository.createOnce({
            auditKey: this.auditKey(FxRateAuditAction.SNAPSHOT_CREATED,
              normalized.snapshotKey),
            action: FxRateAuditAction.SNAPSHOT_CREATED,
            result: "SUCCEEDED", snapshotReference,
            previousSnapshotReference: current?.snapshotReference,
            provider: normalized.provider,
            baseCurrency: normalized.baseCurrency,
            quoteCurrency: normalized.quoteCurrency,
            effectiveDate: normalized.effectiveDate,
            rate: scaledRateToDecimal({ value: normalized.rateValue,
              scale: normalized.rateScale }), actorType: actor.type,
            actorId: actor.id,
          } as any, session);
          if (current && becomesCurrent) {
            await fxRateAuditRepository.createOnce({
              auditKey: this.auditKey(FxRateAuditAction.SNAPSHOT_SUPERSEDED,
                `${current.snapshotReference}|${snapshotReference}`),
              action: FxRateAuditAction.SNAPSHOT_SUPERSEDED,
              result: "SUCCEEDED",
              snapshotReference: current.snapshotReference,
              previousSnapshotReference: current.snapshotReference,
              provider: current.provider, baseCurrency: current.baseCurrency,
              quoteCurrency: current.quoteCurrency,
              effectiveDate: current.effectiveDate,
              rate: scaledRateToDecimal({ value: current.rateValue,
                scale: current.rateScale }), actorType: actor.type,
              actorId: actor.id,
            } as any, session);
          }
          await this.inject("BEFORE_COMMIT");
          result = created;
        });
        if (result) return result;
      } catch (error: any) {
        const raced = await exchangeRateSnapshotRepository.findByKey(
          normalized.snapshotKey,
        );
        if (raced) {
          this.validatePersisted(raced);
          return raced;
        }
        if (attempt === 2 || (error?.code !== 11000 &&
          !error?.errorLabels?.includes?.("TransientTransactionError") &&
          !(error instanceof FxRateSnapshotError &&
            error.code === "FX_RATE_CURRENT_AUTHORITY_CONFLICT"))) throw error;
      } finally {
        await session.endSession();
      }
    }
    throw new FxRateSnapshotError("FX snapshot could not be persisted.",
      "FX_RATE_CURRENT_AUTHORITY_CONFLICT", 409);
  }

  private async recordFailure(pair: Pair, actor: FxActor, error: unknown) {
    const code = error instanceof FxRateSnapshotError
      ? error.code : "FX_RATE_PROVIDER_UNAVAILABLE";
    await fxRateAuditRepository.createOnce({
      auditKey: this.auditKey(FxRateAuditAction.REFRESH_FAILED,
        `${this.provider.providerName}|${pair.baseCurrency}|${pair.quoteCurrency}|${code}|${this.now().toISOString().slice(0, 10)}`),
      action: FxRateAuditAction.REFRESH_FAILED,
      result: "FAILED", provider: this.provider.providerName,
      baseCurrency: pair.baseCurrency, quoteCurrency: pair.quoteCurrency,
      failureCode: code, actorType: actor.type, actorId: actor.id,
    } as any);
  }

  async requireCurrentSnapshot(base: unknown, quote: unknown) {
    const pair = this.pair(base, quote);
    const now = this.now();
    const current = await exchangeRateSnapshotRepository.findCurrentPair(
      this.provider.providerName, pair.baseCurrency, pair.quoteCurrency,
    );
    if (!current) throw new FxRateSnapshotError("FX snapshot was not found.",
      "FX_RATE_SNAPSHOT_NOT_FOUND", 404);
    this.validatePersisted(current);
    if (!this.isFresh(current, now)) {
      throw new FxRateSnapshotError("FX snapshot is expired.",
        "FX_RATE_SNAPSHOT_EXPIRED", 409);
    }
    return current;
  }

  async validateStoredSnapshot(snapshotReference: string) {
    const snapshot = await exchangeRateSnapshotRepository.findByReference(
      snapshotReference,
    );
    if (!snapshot) throw new FxRateSnapshotError("FX snapshot was not found.",
      "FX_RATE_SNAPSHOT_NOT_FOUND", 404);
    this.validatePersisted(snapshot);
    if (snapshot.status === ExchangeRateSnapshotStatus.INVALIDATED) {
      throw new FxRateSnapshotError("FX snapshot is invalidated.",
        "FX_RATE_REPLAY_CONFLICT", 409);
    }
    return snapshot;
  }

  async requireStoredSnapshotEligible(snapshotReference: string) {
    const snapshot = await this.validateStoredSnapshot(snapshotReference);
    const now = this.now();
    if (snapshot.validFrom > now || snapshot.expiresAt <= now ||
      now.getTime() - snapshot.effectiveDate.getTime() > this.config.maxAgeMs) {
      throw new FxRateSnapshotError("FX snapshot is expired.",
        "FX_RATE_SNAPSHOT_EXPIRED", 409);
    }
    return snapshot;
  }

  async getCurrent(base: unknown, quote: unknown) {
    const now = this.now();
    const current = await this.requireCurrentSnapshot(base, quote);
    return toFxRateSnapshotResponseDto(current, { now, cached: true });
  }

  async lookupOrRefresh(base: unknown, quote: unknown,
    actor: FxActor = { type: "SYSTEM" }) {
    return this.refresh(base, quote, false, actor);
  }

  async refresh(base: unknown, quote: unknown, force: boolean,
    actor: FxActor) {
    const pair = this.pair(base, quote);
    const now = this.now();
    const current = await exchangeRateSnapshotRepository.findCurrentPair(
      this.provider.providerName, pair.baseCurrency, pair.quoteCurrency,
    );
    if (current) this.validatePersisted(current);
    if (!force && current && this.isFresh(current, now)) {
      return toFxRateSnapshotResponseDto(current, { now, cached: true });
    }
    try {
      // The external call deliberately occurs before any MongoDB transaction.
      const providerResult = await this.provider.getReferenceRate(pair);
      const normalized = this.normalize(providerResult, pair);
      await this.inject("AFTER_PROVIDER_VALIDATION");
      const snapshot = await this.persist(normalized, actor);
      return toFxRateSnapshotResponseDto(snapshot, { now: this.now() });
    } catch (error) {
      await this.recordFailure(pair, actor, error);
      if (current && this.isFresh(current, this.now())) {
        return toFxRateSnapshotResponseDto(current, {
          now: this.now(), cached: true, cachedFallback: true,
        });
      }
      if (error instanceof FxRateSnapshotError) throw error;
      throw new FxRateSnapshotError("FX provider is unavailable.",
        "FX_RATE_PROVIDER_UNAVAILABLE", 502, error);
    }
  }
}

export const fxRateSnapshotService = new FxRateSnapshotService();
