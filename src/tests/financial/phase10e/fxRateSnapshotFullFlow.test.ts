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

export const registerFullFlowTests = () => {
  test("phase10e full flow stores, reads, reuses, and supersedes immutable INR to USD snapshots", async () => {
    const { actors, provider, service } = await createFxFixture();
    const first = await service.lookupOrRefresh("INR", "USD", systemActor);
    assert.equal(first.provider, "DETERMINISTIC_FX");
    assert.equal(first.rate, "0.0115");
    assert.equal(first.inverseRate, "86.95652173913");
    assert.equal(first.effectiveDate, "2026-08-02");
    assert.equal(first.isCurrent, true);
    assert.equal(first.baseMinorUnits, 2);
    assert.equal(first.quoteMinorUnits, 2);
    assert.equal(await ExchangeRateSnapshot.countDocuments({}), 1);

    const current = await service.getCurrent("INR", "USD");
    const normalReplay = await service.lookupOrRefresh(
      "INR", "USD", systemActor,
    );
    const forcedReplay = await service.refresh(
      "INR", "USD", true, adminActor(actors),
    );
    assert.equal(current.snapshotReference, first.snapshotReference);
    assert.equal(normalReplay.snapshotReference, first.snapshotReference);
    assert.equal(forcedReplay.snapshotReference, first.snapshotReference);
    assert.equal(await ExchangeRateSnapshot.countDocuments({}), 1);

    const immutableBefore = await ExchangeRateSnapshot.findOne({
      snapshotReference: first.snapshotReference,
    }).select("+snapshotKey +responseFingerprint +snapshotFingerprint").lean();
    setRate(provider, "INR", "USD", "0.011700",
      "2026-08-03T00:00:00.000Z", "20260803-V2");
    const second = await service.refresh(
      "INR", "USD", true, adminActor(actors),
    );
    assert.notEqual(second.snapshotReference, first.snapshotReference);
    const history = await ExchangeRateSnapshot.find({
      provider: "DETERMINISTIC_FX", baseCurrency: "INR", quoteCurrency: "USD",
    }).select("+snapshotKey +responseFingerprint +snapshotFingerprint")
      .sort({ effectiveDate: 1 }).lean();
    assert.equal(history.length, 2);
    assert.deepEqual(history.map((item) => item.status),
      ["SUPERSEDED", "ACTIVE"]);
    const { status: _status, supersededAt: _at, supersededByReference: _by,
      updatedAt: _updated, ...oldImmutable } = history[0] as any;
    const { status: _beforeStatus, supersededAt: _beforeAt,
      supersededByReference: _beforeBy, updatedAt: _beforeUpdated,
      ...beforeImmutable } = immutableBefore as any;
    assert.deepEqual(oldImmutable, beforeImmutable);
    assert.equal(await FxRateAudit.countDocuments({
      action: "FX_RATE_SNAPSHOT_CREATED",
    }), 2);
    assert.equal(await FxRateAudit.countDocuments({
      action: "FX_RATE_SNAPSHOT_SUPERSEDED",
    }), 1);
  });

  test("phase10e pairs preserve explicit direction and zero-minor-unit metadata", async () => {
    const { service } = await createFxFixture();
    const rates = await Promise.all([
      service.lookupOrRefresh("INR", "USD", systemActor),
      service.lookupOrRefresh("USD", "INR", systemActor),
      service.lookupOrRefresh("INR", "EUR", systemActor),
      service.lookupOrRefresh("INR", "JPY", systemActor),
    ]);
    assert.deepEqual(rates.map((rate) =>
      `${rate.baseCurrency}:${rate.quoteCurrency}`),
    ["INR:USD", "USD:INR", "INR:EUR", "INR:JPY"]);
    assert.equal(rates[3].quoteMinorUnits, 0);
    assert.equal(await ExchangeRateSnapshot.countDocuments({}), 4);
  });
};
