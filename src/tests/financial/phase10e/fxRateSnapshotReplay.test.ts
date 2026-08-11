import assert from "node:assert/strict";
import { test } from "node:test";

import { ExchangeRateSnapshot } from
  "../../../models/exchangeRateSnapshot.model";
import { FxRateSnapshotService } from
  "../../../services/financial/fxRateSnapshot.service";
import {
  adminActor,
  createFxFixture,
  fixedClock,
  fxConfig,
  systemActor,
} from "./fixtures/fxRateSnapshotFixtures";

export const registerReplayTests = () => {
  test("phase10e replay returns one snapshot across normal, forced, and service reload calls", async () => {
    const { actors, provider, service } = await createFxFixture();
    const first = await service.lookupOrRefresh("INR", "USD", systemActor);
    const reloadedService = new FxRateSnapshotService(provider, {
      config: fxConfig, now: fixedClock,
    });
    const settled = await Promise.all([
      service.lookupOrRefresh("INR", "USD", systemActor),
      service.refresh("INR", "USD", true, adminActor(actors)),
      reloadedService.getCurrent("INR", "USD"),
      reloadedService.refresh("INR", "USD", true, adminActor(actors)),
    ]);
    assert.ok(settled.every((item) =>
      item.snapshotReference === first.snapshotReference));
    assert.equal(await ExchangeRateSnapshot.countDocuments({}), 1);
  });
};
