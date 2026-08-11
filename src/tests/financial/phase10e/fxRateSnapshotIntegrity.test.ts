import assert from "node:assert/strict";
import { test } from "node:test";

import { FxRateSnapshotError } from
  "../../../errors/financial/FxRateSnapshotError";
import { ExchangeRateSnapshot } from
  "../../../models/exchangeRateSnapshot.model";
import { FxRateSnapshotService } from
  "../../../services/financial/fxRateSnapshot.service";
import {
  createFxFixture,
  fixedClock,
  fxConfig,
  systemActor,
} from "./fixtures/fxRateSnapshotFixtures";

export const registerIntegrityTests = () => {
  test("phase10e integrity rejects unsupported, identical, and disabled pairs", async () => {
    const { provider, service } = await createFxFixture();
    await assert.rejects(() => service.lookupOrRefresh("XYZ", "USD", systemActor),
      (error: any) => error.code === "FX_RATE_UNSUPPORTED_BASE_CURRENCY");
    await assert.rejects(() => service.lookupOrRefresh("INR", "XYZ", systemActor),
      (error: any) => error.code === "FX_RATE_UNSUPPORTED_QUOTE_CURRENCY");
    await assert.rejects(() => service.lookupOrRefresh("INR", "INR", systemActor),
      (error: any) => error.code === "FX_RATE_IDENTICAL_CURRENCIES");
    const restricted = new FxRateSnapshotService(provider, {
      config: { ...fxConfig, enabledPairs: new Set(["INR:USD"]) },
      now: fixedClock,
    });
    await assert.rejects(() => restricted.lookupOrRefresh(
      "INR", "EUR", systemActor,
    ), (error: any) => error.code === "FX_RATE_PAIR_NOT_SUPPORTED");
    assert.equal(await ExchangeRateSnapshot.countDocuments({}), 0);
  });

  for (const [label, rate] of [
    ["zero", "0"], ["negative", "-0.1"], ["malformed", "1.2.3"],
    ["excessive scale", "0.1234567890123"],
  ] as const) {
    test(`phase10e integrity rejects ${label} provider rate`, async () => {
      const { provider, service } = await createFxFixture();
      provider.setRate("INR", "USD", {
        rate, effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
        providerReference: `INVALID-${label}`,
      });
      await assert.rejects(() => service.lookupOrRefresh(
        "INR", "USD", systemActor,
      ), (error: unknown) => error instanceof FxRateSnapshotError &&
        error.code === "FX_RATE_INVALID_RATE");
      assert.equal(await ExchangeRateSnapshot.countDocuments({}), 0);
    });
  }

  test("phase10e integrity rejects future, stale, wrong-pair, and inverse-mismatch responses", async () => {
    const future = await createFxFixture();
    future.provider.setRate("INR", "USD", { rate: "0.0115",
      effectiveDate: new Date("2026-08-05T00:00:00.000Z") });
    await assert.rejects(() => future.service.lookupOrRefresh(
      "INR", "USD", systemActor,
    ), (error: any) => error.code === "FX_RATE_INVALID_EFFECTIVE_DATE");

    const stale = await createFxFixture();
    stale.provider.setRate("INR", "USD", { rate: "0.0115",
      effectiveDate: new Date("2026-07-20T00:00:00.000Z") });
    await assert.rejects(() => stale.service.lookupOrRefresh(
      "INR", "USD", systemActor,
    ), (error: any) => error.code === "FX_RATE_STALE_PROVIDER_RESPONSE");

    const wrong = await createFxFixture();
    wrong.provider.setRate("INR", "USD", { rate: "0.0115",
      effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
      returnedQuoteCurrency: "EUR" });
    await assert.rejects(() => wrong.service.lookupOrRefresh(
      "INR", "USD", systemActor,
    ), (error: any) => error.code === "FX_RATE_PROVIDER_INVALID_RESPONSE");

    const inverse = await createFxFixture();
    inverse.provider.setRate("INR", "USD", { rate: "0.0115",
      inverseRate: "90", effectiveDate: new Date("2026-08-02T00:00:00.000Z") });
    await assert.rejects(() => inverse.service.lookupOrRefresh(
      "INR", "USD", systemActor,
    ), (error: any) => error.code === "FX_RATE_INVALID_RATE");
  });

  test("phase10e integrity detects corrupted immutable fingerprint and duplicate ACTIVE authority", async () => {
    const { service } = await createFxFixture();
    const dto = await service.lookupOrRefresh("INR", "USD", systemActor);
    const original = await ExchangeRateSnapshot.findOne({
      snapshotReference: dto.snapshotReference,
    }).select("+snapshotKey +responseFingerprint +snapshotFingerprint +createdBy")
      .lean().orFail();
    const duplicate = { ...original, _id: undefined,
      snapshotReference: "FXR-20260802-DEADBEEF",
      snapshotKey: "f".repeat(64), createdAt: undefined, updatedAt: undefined };
    await assert.rejects(() => ExchangeRateSnapshot.create(duplicate),
      (error: any) => error?.code === 11000);

    await ExchangeRateSnapshot.collection.updateOne(
      { snapshotReference: dto.snapshotReference },
      { $set: { rateValue: "999" } },
    );
    await assert.rejects(() => service.getCurrent("INR", "USD"),
      (error: any) => error.code === "FX_RATE_REPLAY_CONFLICT");
  });
};
