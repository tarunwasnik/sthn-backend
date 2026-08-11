import assert from "node:assert/strict";
import { test } from "node:test";

import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { createConversionFixture, fundWallet, requestInput } from
  "./fixtures/walletConversionRequestFixtures";

export const registerFullFlowTests = () => {
  test("phase10f full flow records PENDING intent bound to INR-to-USD snapshot", async () => {
    const fixture = await createConversionFixture();
    const walletBefore = await Wallet.findById(fixture.actors.wallet._id).lean();
    const providerCalls = fixture.provider.callCount;
    const result = await fixture.service.create(
      fixture.actors.userId.toString(), requestInput(),
    );
    assert.deepEqual({ status: result.status, sourceAmount: result.sourceAmount,
      targetAmount: result.targetAmount, rate: result.rate }, {
      status: "PENDING", sourceAmount: 870_000, targetAmount: 10_005,
      rate: "0.0115",
    });
    const stored = await WalletConversionRequest.findOne({
      conversionReference: result.conversionReference,
    }).select("+sourceWalletId +targetWalletId +fxSnapshotId");
    assert.ok(stored?.sourceWalletId.equals(fixture.actors.wallet._id));
    assert.equal(stored?.targetWalletId, undefined);
    assert.equal(await Wallet.exists({ userId: fixture.actors.userId,
      currency: "USD" }), null);
    assert.deepEqual(await Wallet.findById(fixture.actors.wallet._id).lean(),
      walletBefore);
    assert.equal(await LedgerEntry.countDocuments({}), 0);
    assert.equal(await WalletProjectionOperation.countDocuments({}), 0);
    assert.equal(await WalletConversionAudit.countDocuments({}), 1);
    assert.equal(fixture.provider.callCount, providerCalls,
      "Conversion request must not call the provider.");
  });

  test("phase10f binds an existing target Wallet without changing its balance", async () => {
    const fixture = await createConversionFixture();
    const target = await fundWallet(fixture.actors.userId, "USD", 12_345);
    const targetBefore = target.toObject();
    const result = await fixture.service.create(fixture.actors.userId.toString(),
      requestInput("phase10f-existing-target"));
    const stored = await WalletConversionRequest.findOne({
      conversionReference: result.conversionReference,
    }).select("+targetWalletId");
    assert.ok(stored?.targetWalletId?.equals(target._id));
    assert.deepEqual((await Wallet.findById(target._id))?.toObject(), targetBefore);
  });

  test("phase10f quote uses target minor units with deterministic half-up rounding", async () => {
    const fixture = await createConversionFixture();
    const result = await fixture.service.create(fixture.actors.userId.toString(), {
      sourceCurrency: "INR", targetCurrency: "JPY", sourceAmount: 12_345,
      idempotencyKey: "phase10f-inr-jpy-rounding",
    });
    assert.equal(result.targetAmount, 212);
    assert.equal(result.rate, "1.72");
  });
};
