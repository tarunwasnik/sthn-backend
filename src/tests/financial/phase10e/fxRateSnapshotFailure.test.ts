import assert from "node:assert/strict";
import { test } from "node:test";

import { ExchangeRateSnapshot } from
  "../../../models/exchangeRateSnapshot.model";
import { FxRateAudit } from "../../../models/fxRateAudit.model";
import {
  createFxFixture,
  setRate,
  systemActor,
} from "./fixtures/fxRateSnapshotFixtures";

export const registerFailureTests = () => {
  for (const point of ["AFTER_PROVIDER_VALIDATION", "AFTER_SNAPSHOT_CREATION",
    "BEFORE_AUDIT", "BEFORE_COMMIT"] as const) {
    test(`phase10e rollback: ${point} leaves no successful snapshot authority`, async () => {
      const fixture = await createFxFixture({
        failureInjector: (actual) => {
          if (actual === point) throw new Error(`INJECT_${point}`);
        },
      });
      await assert.rejects(() => fixture.service.lookupOrRefresh(
        "INR", "USD", systemActor,
      ));
      assert.equal(await ExchangeRateSnapshot.countDocuments({}), 0);
      assert.equal(await FxRateAudit.countDocuments({
        result: { $ne: "FAILED" },
      }), 0);
    });
  }

  test("phase10e rollback: supersession interruption preserves prior ACTIVE snapshot", async () => {
    const firstFixture = await createFxFixture();
    const first = await firstFixture.service.lookupOrRefresh(
      "INR", "USD", systemActor,
    );
    setRate(firstFixture.provider, "INR", "USD", "0.011700",
      "2026-08-03T00:00:00.000Z", "20260803-V2");
    const failing = new (firstFixture.service.constructor as any)(
      firstFixture.provider,
      {
        config: {
          providerName: "DETERMINISTIC_FX",
          baseUrl: "https://unused.test/fx",
          timeoutMs: 1000,
          maxAgeMs: 72 * 60 * 60 * 1000,
          snapshotValidityMs: 24 * 60 * 60 * 1000,
          requestEnabled: true,
        },
        now: () => new Date("2026-08-02T12:00:00.000Z"),
        failureInjector: (point: string) => {
          if (point === "AFTER_SUPERSESSION") throw new Error("ABORT_SUPERSESSION");
        },
      },
    );
    const fallback = await failing.refresh(
      "INR", "USD", true, systemActor,
    );
    assert.equal(fallback.snapshotReference, first.snapshotReference);
    assert.equal(fallback.cachedFallback, true);
    const snapshots = await ExchangeRateSnapshot.find({});
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].snapshotReference, first.snapshotReference);
    assert.equal(snapshots[0].status, "ACTIVE");
  });
};
