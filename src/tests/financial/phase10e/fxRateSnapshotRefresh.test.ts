import assert from "node:assert/strict";
import { test } from "node:test";

import { ExchangeRateSnapshot } from
  "../../../models/exchangeRateSnapshot.model";
import { FxRateSnapshotError } from
  "../../../errors/financial/FxRateSnapshotError";
import { FxRateSnapshotService } from
  "../../../services/financial/fxRateSnapshot.service";
import {
  adminActor,
  createFxFixture,
  FIXED_NOW,
  fxConfig,
  systemActor,
} from "./fixtures/fxRateSnapshotFixtures";

export const registerRefreshTests = () => {
  test("phase10e refresh failure returns a still-valid current snapshot explicitly as fallback", async () => {
    const { actors, provider, service } = await createFxFixture();
    const first = await service.lookupOrRefresh("INR", "USD", systemActor);
    provider.setFailure(new FxRateSnapshotError("Provider unavailable.",
      "FX_RATE_PROVIDER_UNAVAILABLE", 502));
    const fallback = await service.refresh(
      "INR", "USD", true, adminActor(actors),
    );
    assert.equal(fallback.snapshotReference, first.snapshotReference);
    assert.equal(fallback.cached, true);
    assert.equal(fallback.cachedFallback, true);
    assert.equal(await ExchangeRateSnapshot.countDocuments({}), 1);
  });

  test("phase10e refresh failure never returns an expired snapshot as current", async () => {
    const fixture = await createFxFixture();
    await fixture.service.lookupOrRefresh("INR", "USD", systemActor);
    fixture.provider.setFailure(new FxRateSnapshotError("Provider unavailable.",
      "FX_RATE_PROVIDER_UNAVAILABLE", 502));
    const expiredNow = () => new Date(
      FIXED_NOW.getTime() + fxConfig.snapshotValidityMs + 1,
    );
    const expiredService = new FxRateSnapshotService(fixture.provider, {
      config: fxConfig, now: expiredNow,
    });
    await assert.rejects(() => expiredService.refresh(
      "INR", "USD", true, adminActor(fixture.actors),
    ), (error: unknown) => error instanceof FxRateSnapshotError &&
      error.code === "FX_RATE_PROVIDER_UNAVAILABLE");
    await assert.rejects(() => expiredService.getCurrent("INR", "USD"),
      (error: unknown) => error instanceof FxRateSnapshotError &&
        error.code === "FX_RATE_SNAPSHOT_EXPIRED");
  });
};
