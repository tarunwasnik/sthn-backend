import assert from "node:assert/strict";
import { test } from "node:test";

import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { WalletConversionRequestService } from
  "../../../services/financial/walletConversionRequest.service";
import { systemActor } from "../phase10e/fixtures/fxRateSnapshotFixtures";
import { createConversionFixture, requestInput } from
  "./fixtures/walletConversionRequestFixtures";

export const registerReplayTests = () => {
  test("phase10f replay and service reload return one unchanged request", async () => {
    const fixture = await createConversionFixture();
    const input = requestInput("phase10f-reload");
    const first = await fixture.service.create(fixture.actors.userId.toString(), input);
    const immediate = await fixture.service.create(
      fixture.actors.userId.toString(), input,
    );
    const reloadedService = new WalletConversionRequestService(fixture.fxService);
    const reloaded = await reloadedService.create(
      fixture.actors.userId.toString(), input,
    );
    assert.equal(immediate.conversionReference, first.conversionReference);
    assert.equal(reloaded.conversionReference, first.conversionReference);
    assert.equal(await WalletConversionRequest.countDocuments({}), 1);
  });

  test("phase10f replay retains the original snapshot after a newer rate", async () => {
    const fixture = await createConversionFixture();
    const input = requestInput("phase10f-stale-replay");
    const first = await fixture.service.create(fixture.actors.userId.toString(), input);
    fixture.provider.setRate("INR", "USD", { rate: "0.012000",
      effectiveDate: new Date("2026-08-03T00:00:00.000Z"),
      providerReference: "PHASE10F-INR-USD-V2" });
    await fixture.fxService.refresh("INR", "USD", true, systemActor);
    const replay = await fixture.service.create(fixture.actors.userId.toString(), input);
    assert.equal(replay.conversionReference, first.conversionReference);
    assert.equal(replay.fxSnapshotReference, first.fxSnapshotReference);
    assert.equal(replay.targetAmount, 10_005);
    assert.equal(await WalletConversionRequest.countDocuments({}), 1);
  });

  test("phase10f cross-intent replay conflicts while another User key is independent", async () => {
    const first = await createConversionFixture();
    const key = "phase10f-conflict";
    await first.service.create(first.actors.userId.toString(), requestInput(key));
    for (const conflicting of [
      { sourceCurrency: "USD", targetCurrency: "INR", sourceAmount: 870_000,
        idempotencyKey: key },
      { sourceCurrency: "INR", targetCurrency: "EUR", sourceAmount: 870_000,
        idempotencyKey: key },
      { sourceCurrency: "INR", targetCurrency: "USD", sourceAmount: 870_001,
        idempotencyKey: key },
    ]) {
      await assert.rejects(() => first.service.create(
        first.actors.userId.toString(), conflicting,
      ), (error: any) => error.code === "WALLET_CONVERSION_IDEMPOTENCY_CONFLICT");
    }
    const second = await createConversionFixture();
    const independent = await second.service.create(
      second.actors.userId.toString(), requestInput(key),
    );
    assert.ok(independent.conversionReference);
    assert.equal(await WalletConversionRequest.countDocuments({}), 2);
  });
};
