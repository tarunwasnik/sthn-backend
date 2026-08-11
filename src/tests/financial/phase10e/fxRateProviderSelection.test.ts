import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FxRateConfiguration,
  FxRateProviderMode,
} from "../../../constants/financial/fxRate.constants";
import { FxRateSnapshotError } from
  "../../../errors/financial/FxRateSnapshotError";
import { ConfiguredReferenceFxRateProvider } from
  "../../../providers/fx/configuredReferenceFxRate.provider";
import { createFxRateProvider } from
  "../../../providers/fx/fxRateProvider.selector";
import { InternalFxRateProvider } from
  "../../../providers/fx/internalFxRate.provider";
import { ExchangeRateSnapshot } from
  "../../../models/exchangeRateSnapshot.model";
import { FxRateSnapshotService } from
  "../../../services/financial/fxRateSnapshot.service";
import { systemActor } from "./fixtures/fxRateSnapshotFixtures";

const internalConfig = (): FxRateConfiguration => ({
  providerMode: FxRateProviderMode.INTERNAL,
  providerName: "",
  baseUrl: "",
  timeoutMs: 1_000,
  maxAgeMs: 72 * 60 * 60 * 1000,
  snapshotValidityMs: 24 * 60 * 60 * 1000,
  requestEnabled: false,
  enabledPairs: new Set(["INR:USD"]),
  internalInrUsdRate: "0.01050",
});

export const registerProviderSelectionTests = () => {
  test("phase10e provider selector chooses the configured reference provider", () => {
    const provider = createFxRateProvider({
      ...internalConfig(), providerMode: FxRateProviderMode.REFERENCE,
      providerName: "REFERENCE_TEST", baseUrl: "https://unused.test/fx",
      requestEnabled: true,
    });
    assert.ok(provider instanceof ConfiguredReferenceFxRateProvider);
  });

  test("phase10e provider selector chooses the internal simulator outside production", () => {
    const provider = createFxRateProvider(internalConfig(), { NODE_ENV: "test" });
    assert.ok(provider instanceof InternalFxRateProvider);
  });

  test("phase10e invalid provider mode fails closed", () => {
    assert.throws(() => createFxRateProvider({
      ...internalConfig(), providerMode: "UNKNOWN" as FxRateProviderMode,
    }), (error: unknown) => error instanceof FxRateSnapshotError &&
      error.code === "FX_RATE_PROVIDER_NOT_CONFIGURED");
  });

  test("phase10e internal provider is blocked in production", () => {
    assert.throws(() => createFxRateProvider(internalConfig(), {
      NODE_ENV: "production",
    }), (error: unknown) => error instanceof FxRateSnapshotError &&
      error.code === "FX_RATE_PROVIDER_NOT_CONFIGURED");
  });

  test("phase10e internal provider returns only the configured INR to USD direction", async () => {
    const provider = new InternalFxRateProvider(internalConfig(), () =>
      new Date("2026-08-09T12:00:00.000Z"));
    const result = await provider.getReferenceRate({
      baseCurrency: "INR", quoteCurrency: "USD",
    });
    assert.equal(result.provider, "INTERNAL_FX_SIMULATOR");
    assert.equal(result.rate, "0.01050");
    assert.equal(result.baseCurrency, "INR");
    assert.equal(result.quoteCurrency, "USD");
    await assert.rejects(provider.getReferenceRate({
      baseCurrency: "USD", quoteCurrency: "INR",
    }), (error: unknown) => error instanceof FxRateSnapshotError &&
      error.code === "FX_RATE_PAIR_NOT_SUPPORTED");
  });

  test("phase10e internal provider rejects missing or malformed configured rates", async () => {
    const missing = new InternalFxRateProvider({
      ...internalConfig(), internalInrUsdRate: undefined,
    });
    await assert.rejects(missing.getReferenceRate({
      baseCurrency: "INR", quoteCurrency: "USD",
    }), (error: unknown) => error instanceof FxRateSnapshotError &&
      error.code === "FX_RATE_PROVIDER_NOT_CONFIGURED");
    const malformed = new InternalFxRateProvider({
      ...internalConfig(), internalInrUsdRate: "not-a-rate",
    });
    await assert.rejects(malformed.getReferenceRate({
      baseCurrency: "INR", quoteCurrency: "USD",
    }), (error: unknown) => error instanceof FxRateSnapshotError &&
      error.code === "FX_RATE_INVALID_RATE");
  });

  test("phase10e reference-provider failures do not fall back to the simulator", async () => {
    const provider = createFxRateProvider({
      ...internalConfig(), providerMode: FxRateProviderMode.REFERENCE,
      providerName: "REFERENCE_TEST", baseUrl: "https://unused.test/fx",
      requestEnabled: false,
    });
    await assert.rejects(provider.getReferenceRate({
      baseCurrency: "INR", quoteCurrency: "USD",
    }), (error: unknown) => error instanceof FxRateSnapshotError &&
      error.code === "FX_RATE_PROVIDER_NOT_CONFIGURED");
  });

  test("phase10e internal refresh persists and reads an eligible INR to USD snapshot", async () => {
    const service = new FxRateSnapshotService(undefined, {
      config: internalConfig(), now: () => new Date(),
    });
    const refreshed = await service.refresh("INR", "USD", true, systemActor);
    const current = await service.getCurrent("INR", "USD");
    assert.equal(refreshed.provider, "INTERNAL_FX_SIMULATOR");
    assert.equal(refreshed.rate, "0.0105");
    assert.equal(current.snapshotReference, refreshed.snapshotReference);
    assert.equal(await ExchangeRateSnapshot.countDocuments({
      provider: "INTERNAL_FX_SIMULATOR", baseCurrency: "INR", quoteCurrency: "USD",
    }), 1);
  });
};
