import crypto from "crypto";

import { FxRateConfiguration, loadFxRateConfiguration } from
  "../../constants/financial/fxRate.constants";
import { FxRateSnapshotError } from
  "../../errors/financial/FxRateSnapshotError";
import { parseScaledRate } from "../../utils/financial/fxDecimal.util";
import {
  FxRateProvider,
  FxRateProviderRequest,
  FxRateProviderResult,
} from "./fxRateProvider";

const INTERNAL_PROVIDER_NAME = "INTERNAL_FX_SIMULATOR";

export class InternalFxRateProvider implements FxRateProvider {
  constructor(
    private readonly config: FxRateConfiguration = loadFxRateConfiguration(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  get providerName(): string {
    return INTERNAL_PROVIDER_NAME;
  }

  async getReferenceRate(
    input: FxRateProviderRequest,
  ): Promise<FxRateProviderResult> {
    if (input.baseCurrency !== "INR" || input.quoteCurrency !== "USD") {
      throw new FxRateSnapshotError("FX currency pair is not enabled.",
        "FX_RATE_PAIR_NOT_SUPPORTED", 422);
    }
    const configuredRate = this.config.internalInrUsdRate;
    if (!configuredRate) {
      throw new FxRateSnapshotError("Internal FX simulator rate is not configured.",
        "FX_RATE_PROVIDER_NOT_CONFIGURED", 502);
    }
    const normalizedRate = parseScaledRate(configuredRate);
    const rate = configuredRate.trim();
    const fetchedAt = this.now();
    const effectiveDate = new Date(Date.UTC(
      fetchedAt.getUTCFullYear(), fetchedAt.getUTCMonth(), fetchedAt.getUTCDate(),
    ));
    const providerReference = `INTERNAL-INR-USD-${effectiveDate.toISOString().slice(0, 10)}`;
    return {
      provider: this.providerName,
      baseCurrency: input.baseCurrency,
      quoteCurrency: input.quoteCurrency,
      rate,
      effectiveDate,
      fetchedAt,
      providerReference,
      rawResponseFingerprint: crypto.createHash("sha256").update([
        this.providerName, input.baseCurrency, input.quoteCurrency,
        normalizedRate.value, normalizedRate.scale, effectiveDate.toISOString(),
      ].join("|")).digest("hex"),
    };
  }
}
