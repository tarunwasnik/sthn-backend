import crypto from "crypto";

import { SupportedCurrency } from
  "../../../../constants/financial/supportedCurrencies";
import { FxRateSnapshotError } from
  "../../../../errors/financial/FxRateSnapshotError";
import {
  FxRateProvider,
  FxRateProviderRequest,
  FxRateProviderResult,
} from "../../../../providers/fx/fxRateProvider";

interface DeterministicRate {
  rate: string;
  effectiveDate: Date;
  inverseRate?: string;
  providerReference?: string;
  providerPublishedAt?: Date;
  returnedBaseCurrency?: SupportedCurrency;
  returnedQuoteCurrency?: SupportedCurrency;
}

export class DeterministicFxRateProvider implements FxRateProvider {
  readonly providerName = "DETERMINISTIC_FX";
  callCount = 0;
  delayMs = 0;
  failure?: FxRateSnapshotError;
  private readonly rates = new Map<string, DeterministicRate>();
  private readonly queuedRates: DeterministicRate[] = [];

  constructor(private readonly now: () => Date) {}

  setRate(baseCurrency: SupportedCurrency, quoteCurrency: SupportedCurrency,
    value: DeterministicRate) {
    this.rates.set(`${baseCurrency}:${quoteCurrency}`, { ...value });
  }

  setFailure(error?: FxRateSnapshotError) {
    this.failure = error;
  }

  enqueueRate(value: DeterministicRate) {
    this.queuedRates.push({ ...value });
  }

  async getReferenceRate(
    input: FxRateProviderRequest,
  ): Promise<FxRateProviderResult> {
    this.callCount += 1;
    const captured = this.queuedRates.shift() ?? this.rates.get(
      `${input.baseCurrency}:${input.quoteCurrency}`,
    );
    const failure = this.failure;
    if (this.delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (failure) throw failure;
    if (!captured) {
      throw new FxRateSnapshotError("Deterministic rate is unavailable.",
        "FX_RATE_PROVIDER_UNAVAILABLE", 502);
    }
    const fingerprintSource = JSON.stringify({
      provider: this.providerName,
      baseCurrency: captured.returnedBaseCurrency ?? input.baseCurrency,
      quoteCurrency: captured.returnedQuoteCurrency ?? input.quoteCurrency,
      rate: captured.rate,
      inverseRate: captured.inverseRate,
      effectiveDate: captured.effectiveDate.toISOString(),
      providerReference: captured.providerReference,
    });
    return {
      provider: this.providerName,
      baseCurrency: captured.returnedBaseCurrency ?? input.baseCurrency,
      quoteCurrency: captured.returnedQuoteCurrency ?? input.quoteCurrency,
      rate: captured.rate,
      inverseRate: captured.inverseRate,
      effectiveDate: new Date(captured.effectiveDate),
      fetchedAt: this.now(),
      providerReference: captured.providerReference,
      providerPublishedAt: captured.providerPublishedAt,
      rawResponseFingerprint: crypto.createHash("sha256")
        .update(fingerprintSource).digest("hex"),
    };
  }
}
