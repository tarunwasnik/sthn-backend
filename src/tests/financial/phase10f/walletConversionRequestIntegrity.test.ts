import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";

import { FX_RATE_DEFAULT_SNAPSHOT_VALIDITY_MS } from
  "../../../constants/financial/fxRate.constants";
import { ExchangeRateSnapshot } from "../../../models/exchangeRateSnapshot.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { FxRateSnapshotService } from
  "../../../services/financial/fxRateSnapshot.service";
import { WalletConversionRequestService } from
  "../../../services/financial/walletConversionRequest.service";
import { systemActor, fxConfig, FIXED_NOW } from
  "../phase10e/fixtures/fxRateSnapshotFixtures";
import { createConversionFixture, fundWallet, requestInput } from
  "./fixtures/walletConversionRequestFixtures";

export const registerIntegrityTests = () => {
  test("phase10f integrity rejects unsupported, identical, and invalid amounts", async () => {
    const fixture = await createConversionFixture();
    for (const input of [
      { sourceCurrency: "XXX", targetCurrency: "USD", sourceAmount: 1 },
      { sourceCurrency: "INR", targetCurrency: "XXX", sourceAmount: 1 },
      { sourceCurrency: "INR", targetCurrency: "INR", sourceAmount: 1 },
      { sourceCurrency: "INR", targetCurrency: "USD", sourceAmount: 0 },
      { sourceCurrency: "INR", targetCurrency: "USD", sourceAmount: -1 },
      { sourceCurrency: "INR", targetCurrency: "USD", sourceAmount: 1.5 },
      { sourceCurrency: "INR", targetCurrency: "USD",
        sourceAmount: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      await assert.rejects(() => fixture.service.create(
        fixture.actors.userId.toString(), { ...input,
          idempotencyKey: `phase10f-invalid-${JSON.stringify(input)}` },
      ));
    }
    assert.equal(await WalletConversionRequest.countDocuments({}), 0);
  });

  test("phase10f integrity rejects missing Wallet and insufficient balance", async () => {
    const missing = await createConversionFixture();
    await fundWallet(new Types.ObjectId(), "USD", 1_000);
    await assert.rejects(() => missing.service.create(
      missing.actors.userId.toString(), { sourceCurrency: "USD",
        targetCurrency: "JPY", sourceAmount: 1,
        idempotencyKey: "phase10f-missing-wallet" },
    ), (error: any) => error.code === "WALLET_CONVERSION_SOURCE_WALLET_NOT_FOUND");
    const insufficient = await createConversionFixture();
    await assert.rejects(() => insufficient.service.create(
      insufficient.actors.userId.toString(), { ...requestInput("insufficient"),
        sourceAmount: 2_000_001 },
    ), (error: any) => error.code ===
      "WALLET_CONVERSION_INSUFFICIENT_AVAILABLE_BALANCE");
  });

  test("phase10f integrity requires the exact stored directed snapshot and valid pagination", async () => {
    const fixture = await createConversionFixture();
    await fundWallet(fixture.actors.userId, "USD", 10_000);
    await assert.rejects(() => fixture.service.create(
      fixture.actors.userId.toString(), { sourceCurrency: "USD",
        targetCurrency: "INR", sourceAmount: 1_000,
        idempotencyKey: "phase10f-wrong-directed-pair" }),
    (error: any) => error.code === "WALLET_CONVERSION_FX_SNAPSHOT_NOT_FOUND");
    await assert.rejects(() => fixture.service.listOwn(
      fixture.actors.userId.toString(), "0", "20"),
    (error: any) => error.code === "WALLET_CONVERSION_INVALID_PAGINATION");
  });

  test("phase10f integrity rejects expired, invalidated, and corrupted snapshots", async () => {
    const expired = await createConversionFixture();
    const lateFx = new FxRateSnapshotService(expired.provider, { config: fxConfig,
      now: () => new Date(FIXED_NOW.getTime() +
        FX_RATE_DEFAULT_SNAPSHOT_VALIDITY_MS + 1) });
    const lateService = new WalletConversionRequestService(lateFx);
    await assert.rejects(() => lateService.create(expired.actors.userId.toString(),
      requestInput("phase10f-expired")), (error: any) => error.code ===
      "WALLET_CONVERSION_FX_SNAPSHOT_EXPIRED");

    const invalidated = await createConversionFixture();
    await ExchangeRateSnapshot.updateOne({ baseCurrency: "INR",
      quoteCurrency: "USD" }, { $set: { status: "INVALIDATED" } });
    await assert.rejects(() => invalidated.service.create(
      invalidated.actors.userId.toString(), requestInput("phase10f-invalidated")));

    const corrupted = await createConversionFixture();
    await ExchangeRateSnapshot.collection.updateOne({ baseCurrency: "INR",
      quoteCurrency: "EUR" }, { $set: { rateValue: "999" } });
    await assert.rejects(() => corrupted.service.create(
      corrupted.actors.userId.toString(), { sourceCurrency: "INR",
        targetCurrency: "EUR", sourceAmount: 100_000,
        idempotencyKey: "phase10f-corrupt-rate" }),
    (error: any) => error.code === "WALLET_CONVERSION_FX_SNAPSHOT_CONFLICT");

    await ExchangeRateSnapshot.collection.updateOne({ baseCurrency: "INR",
      quoteCurrency: "JPY" }, { $set: { snapshotFingerprint: "0".repeat(64) } });
    await assert.rejects(() => corrupted.service.create(
      corrupted.actors.userId.toString(), { sourceCurrency: "INR",
        targetCurrency: "JPY", sourceAmount: 100_000,
        idempotencyKey: "phase10f-snapshot-fingerprint" }),
    (error: any) => error.code === "WALLET_CONVERSION_FX_SNAPSHOT_CONFLICT");
  });

  test("phase10f integrity rejects disabled pair and zero-minor target quote", async () => {
    const disabled = await createConversionFixture();
    const restrictedFx = new FxRateSnapshotService(disabled.provider, {
      config: { ...fxConfig, enabledPairs: new Set(["INR:EUR"]) },
      now: () => new Date(FIXED_NOW),
    });
    await assert.rejects(() => new WalletConversionRequestService(restrictedFx)
      .create(disabled.actors.userId.toString(), requestInput("disabled-pair")),
    (error: any) => error.code === "WALLET_CONVERSION_UNSUPPORTED_PAIR");

    const zero = await createConversionFixture();
    zero.provider.setRate("INR", "USD", { rate: "0.000001",
      effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
      providerReference: "PHASE10F-TINY-RATE" });
    await zero.fxService.refresh("INR", "USD", true, systemActor);
    await assert.rejects(() => zero.service.create(zero.actors.userId.toString(), {
      sourceCurrency: "INR", targetCurrency: "USD", sourceAmount: 1,
      idempotencyKey: "phase10f-zero-target",
    }), (error: any) => error.code === "WALLET_CONVERSION_TARGET_AMOUNT_ZERO");
  });

  test("phase10f integrity detects request fingerprint mismatch", async () => {
    const fixture = await createConversionFixture();
    const input = requestInput("phase10f-fingerprint");
    const created = await fixture.service.create(
      fixture.actors.userId.toString(), input,
    );
    await WalletConversionRequest.collection.updateOne({
      conversionReference: created.conversionReference,
    }, { $set: { requestFingerprint: "0".repeat(64) } });
    await assert.rejects(() => fixture.service.create(
      fixture.actors.userId.toString(), input,
    ), (error: any) => error.code === "WALLET_CONVERSION_INTEGRITY_ERROR");
  });

  test("phase10f minor units cover zero-decimal source and maximum bounded amount", async () => {
    const zeroSource = await createConversionFixture();
    await fundWallet(zeroSource.actors.userId, "JPY", 1_000);
    const smallest = await zeroSource.service.create(
      zeroSource.actors.userId.toString(), { sourceCurrency: "JPY",
        targetCurrency: "USD", sourceAmount: 1,
        idempotencyKey: "phase10f-jpy-usd-smallest" });
    assert.equal(smallest.targetAmount, 1);

    const roundedUp = await zeroSource.service.create(
      zeroSource.actors.userId.toString(), { sourceCurrency: "INR",
        targetCurrency: "JPY", sourceAmount: 12_375,
        idempotencyKey: "phase10f-inr-jpy-round-up" });
    assert.equal(roundedUp.targetAmount, 213);

    const maximum = await createConversionFixture();
    const max = 999_999_999_999;
    await Wallet.findByIdAndUpdate(maximum.actors.wallet._id, { $set: {
      currentBalance: max, availableBalance: max,
    } }, { runValidators: true });
    const result = await maximum.service.create(maximum.actors.userId.toString(), {
      sourceCurrency: "INR", targetCurrency: "USD", sourceAmount: max,
      idempotencyKey: "phase10f-maximum",
    });
    assert.equal(Number.isSafeInteger(result.targetAmount), true);
    assert.ok(result.targetAmount > 0);
  });
};
