import assert from "node:assert/strict";
import { test } from "node:test";

import { ExchangeRateSnapshot } from
  "../../../models/exchangeRateSnapshot.model";
import { FxRateAudit } from "../../../models/fxRateAudit.model";
import {
  adminActor,
  createFxFixture,
  setRate,
  systemActor,
} from "./fixtures/fxRateSnapshotFixtures";

const allFulfilled = (items: PromiseSettledResult<unknown>[]) =>
  items.filter((item) => item.status === "fulfilled").length;

export const registerConcurrencyTests = () => {
  test("phase10e concurrency: ten normal empty-cache lookups converge on one immutable snapshot", async () => {
    const { service } = await createFxFixture();
    const settled = await Promise.allSettled(Array.from({ length: 10 }, () =>
      service.lookupOrRefresh("INR", "USD", systemActor)));
    assert.equal(allFulfilled(settled), 10);
    const references = settled.filter(
      (item): item is PromiseFulfilledResult<any> => item.status === "fulfilled",
    ).map((item) => item.value.snapshotReference);
    assert.equal(new Set(references).size, 1);
    assert.equal(await ExchangeRateSnapshot.countDocuments({}), 1);
    assert.equal(await ExchangeRateSnapshot.countDocuments({ status: "ACTIVE" }), 1);
    assert.equal(await FxRateAudit.countDocuments({
      action: "FX_RATE_SNAPSHOT_CREATED",
    }), 1);
  });

  test("phase10e concurrency: ten identical forced refreshes converge", async () => {
    const { actors, service } = await createFxFixture();
    const settled = await Promise.allSettled(Array.from({ length: 10 }, () =>
      service.refresh("INR", "USD", true, adminActor(actors))));
    assert.equal(allFulfilled(settled), 10);
    assert.equal(await ExchangeRateSnapshot.countDocuments({}), 1);
    assert.equal(await ExchangeRateSnapshot.countDocuments({ status: "ACTIVE" }), 1);
  });

  test("phase10e concurrency: current lookups remain available while a new refresh commits", async () => {
    const { actors, provider, service } = await createFxFixture();
    const first = await service.lookupOrRefresh("INR", "USD", systemActor);
    setRate(provider, "INR", "USD", "0.011700",
      "2026-08-03T00:00:00.000Z", "20260803-V2");
    provider.delayMs = 80;
    const refresh = service.refresh("INR", "USD", true, adminActor(actors));
    const reads = await Promise.all(Array.from({ length: 5 }, () =>
      service.getCurrent("INR", "USD")));
    assert.ok(reads.every((item) =>
      item.snapshotReference === first.snapshotReference));
    const second = await refresh;
    assert.notEqual(second.snapshotReference, first.snapshotReference);
    assert.equal((await service.getCurrent("INR", "USD")).snapshotReference,
      second.snapshotReference);
  });

  test("phase10e concurrency: old/new effective-date race leaves newest current and both historical", async () => {
    const { actors, provider, service } = await createFxFixture();
    provider.enqueueRate({
      rate: "0.011500",
      effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
      providerReference: "DAILY-INR-USD-20260802-V1",
    });
    provider.enqueueRate({
      rate: "0.011700",
      effectiveDate: new Date("2026-08-03T00:00:00.000Z"),
      providerReference: "DAILY-INR-USD-20260803-V2",
    });
    const oldRefresh = service.refresh(
      "INR", "USD", true, adminActor(actors),
    );
    const newRefresh = service.refresh(
      "INR", "USD", true, adminActor(actors),
    );
    const settled = await Promise.allSettled([oldRefresh, newRefresh]);
    assert.equal(allFulfilled(settled), 2);
    const snapshots = await ExchangeRateSnapshot.find({}).sort({ effectiveDate: 1 });
    assert.equal(snapshots.length, 2);
    assert.deepEqual(snapshots.map((item) => item.status),
      ["SUPERSEDED", "ACTIVE"]);
    assert.equal(snapshots[1].effectiveDate.toISOString().slice(0, 10),
      "2026-08-03");
  });
};
