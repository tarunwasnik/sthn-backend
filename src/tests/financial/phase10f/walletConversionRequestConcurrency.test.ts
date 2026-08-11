import assert from "node:assert/strict";
import { test } from "node:test";

import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { createConversionFixture, fundWallet, requestInput } from
  "./fixtures/walletConversionRequestFixtures";

export const registerConcurrencyTests = () => {
  test("phase10f concurrency: ten identical requests converge", async () => {
    const fixture = await createConversionFixture();
    const settled = await Promise.allSettled(Array.from({ length: 10 }, () =>
      fixture.service.create(fixture.actors.userId.toString(),
        requestInput("phase10f-ten-identical"))));
    assert.equal(settled.filter((item) => item.status === "fulfilled").length, 10);
    const references = settled.map((item) => item.status === "fulfilled"
      ? item.value.conversionReference : "FAILED");
    assert.equal(new Set(references).size, 1);
    assert.equal(await WalletConversionRequest.countDocuments({}), 1);
    assert.equal(await WalletConversionAudit.countDocuments({}), 1);
  });

  test("phase10f concurrency: independent directed pairs bind independent snapshots", async () => {
    const fixture = await createConversionFixture();
    await fundWallet(fixture.actors.userId, "USD", 100_000);
    const settled = await Promise.allSettled([
      fixture.service.create(fixture.actors.userId.toString(), {
        sourceCurrency: "INR", targetCurrency: "USD", sourceAmount: 100_000,
        idempotencyKey: "phase10f-independent-usd" }),
      fixture.service.create(fixture.actors.userId.toString(), {
        sourceCurrency: "INR", targetCurrency: "EUR", sourceAmount: 100_000,
        idempotencyKey: "phase10f-independent-eur" }),
      fixture.service.create(fixture.actors.userId.toString(), {
        sourceCurrency: "USD", targetCurrency: "JPY", sourceAmount: 10_000,
        idempotencyKey: "phase10f-independent-jpy" }),
    ]);
    assert.equal(settled.every((item) => item.status === "fulfilled"), true);
    const requests = await WalletConversionRequest.find({});
    assert.equal(requests.length, 3);
    assert.equal(new Set(requests.map((item) => item.fxSnapshotReference)).size, 3);
  });

  test("phase10f concurrency: conflicting idempotency race has one authority", async () => {
    const fixture = await createConversionFixture();
    const key = "phase10f-race-conflict";
    const settled = await Promise.allSettled(Array.from({ length: 10 }, (_, index) =>
      fixture.service.create(fixture.actors.userId.toString(), {
        sourceCurrency: "INR", targetCurrency: "USD",
        sourceAmount: index % 2 === 0 ? 100_000 : 200_000,
        idempotencyKey: key,
      })));
    assert.ok(settled.some((item) => item.status === "fulfilled"));
    assert.ok(settled.some((item) => item.status === "rejected"));
    assert.equal(await WalletConversionRequest.countDocuments({}), 1);
    const stored = await WalletConversionRequest.findOne({});
    const successes = settled.filter((item): item is PromiseFulfilledResult<any> =>
      item.status === "fulfilled");
    assert.ok(successes.every((item) => item.value.sourceAmount ===
      stored?.sourceAmount));
  });
};
