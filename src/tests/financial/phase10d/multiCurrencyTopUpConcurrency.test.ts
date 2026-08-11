import assert from "node:assert/strict";
import { test } from "node:test";

import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { walletCreationService } from
  "../../../services/wallet/walletCreation.service";
import {
  approveTopUp,
  completeAccounting,
  completeDirectTopUp,
  createMultiCurrencyActors,
  requestTopUp,
  succeedFunding,
} from "./fixtures/multiCurrencyTopUpFixtures";

const fulfilled = (results: PromiseSettledResult<unknown>[]) =>
  results.filter((result) => result.status === "fulfilled").length;

export const registerConcurrencyTests = () => {
  test("phase10d concurrency: ten USD Wallet creations converge on one Wallet", async () => {
    const actors = await createMultiCurrencyActors();
    const settled = await Promise.allSettled(Array.from({ length: 10 }, () =>
      walletCreationService.createWallet(actors.userId, "USD")));
    assert.equal(fulfilled(settled), 10);
    const ids = settled
      .filter((item): item is PromiseFulfilledResult<any> =>
        item.status === "fulfilled")
      .map((item) => item.value._id.toString());
    assert.equal(new Set(ids).size, 1);
    assert.equal(await Wallet.countDocuments({
      userId: actors.userId, currency: "USD",
    }), 1);
  });

  test("phase10d concurrency: ten identical USD accounting calls converge", { timeout: 60_000 }, async () => {
    const actors = await createMultiCurrencyActors();
    const request = await requestTopUp(actors, "USD", 1_250);
    await approveTopUp(actors, request.topUpReference);
    await succeedFunding(request.topUpReference);
    const settled = await Promise.allSettled(Array.from({ length: 10 }, () =>
      completeAccounting(request.topUpReference)));
    assert.equal(fulfilled(settled), 10);
    assert.equal(await LedgerEntry.countDocuments({
      "metadata.topUpReference": request.topUpReference,
    }), 1);
    assert.equal(await WalletProjectionOperation.countDocuments({
      userId: actors.userId, currency: "USD",
    }), 1);
    const wallet = await Wallet.findOne({
      userId: actors.userId, currency: "USD",
    }).orFail();
    assert.equal(wallet.availableBalance, 1_250);
  });

  test("phase10d concurrency: INR, USD, and EUR top-ups remain independent", { timeout: 60_000 }, async () => {
    const actors = await createMultiCurrencyActors();
    const intents = [
      ["INR", 1_000], ["USD", 2_000], ["EUR", 3_000],
    ] as const;
    const settled = await Promise.allSettled(intents.map(([currency, amount]) =>
      completeDirectTopUp(actors, currency, amount)));
    assert.equal(fulfilled(settled), 3);
    const wallets = await Wallet.find({ userId: actors.userId })
      .sort({ currency: 1 });
    assert.deepEqual(wallets.map((wallet) => [
      wallet.currency, wallet.availableBalance, wallet.currentBalance,
    ]), [
      ["EUR", 3_000, 3_000],
      ["INR", 1_000, 1_000],
      ["USD", 2_000, 2_000],
    ]);
    const ledgers = await LedgerEntry.find({
      userId: actors.userId, type: "WALLET_TOP_UP",
    });
    const projections = await WalletProjectionOperation.find({
      userId: actors.userId,
    });
    assert.equal(ledgers.length, 3);
    assert.equal(projections.length, 3);
    for (const [currency, amount] of intents) {
      assert.equal(ledgers.filter((entry) =>
        entry.currency === currency && entry.amount === amount).length, 1);
      const wallet = wallets.find((item) => item.currency === currency)!;
      assert.equal(projections.filter((operation) =>
        operation.currency === currency && operation.walletId.equals(wallet._id) &&
        operation.deltas.availableBalance === amount).length, 1);
    }
  });

  test("phase10d concurrency: independent USD top-ups have no lost update", { timeout: 60_000 }, async () => {
    const actors = await createMultiCurrencyActors();
    const amounts = [1_000, 2_500, 400, 75];
    const requests = await Promise.all(amounts.map((amount) =>
      requestTopUp(actors, "USD", amount)));
    await Promise.all(requests.map((request) =>
      approveTopUp(actors, request.topUpReference)));
    await Promise.all(requests.map((request) =>
      succeedFunding(request.topUpReference)));
    const settled = await Promise.allSettled(requests.map((request) =>
      completeAccounting(request.topUpReference)));
    assert.equal(fulfilled(settled), amounts.length);
    const wallet = await Wallet.findOne({
      userId: actors.userId, currency: "USD",
    }).orFail();
    assert.equal(wallet.availableBalance, 3_975);
    assert.equal(await LedgerEntry.countDocuments({
      userId: actors.userId, currency: "USD", type: "WALLET_TOP_UP",
    }), amounts.length);
    assert.equal(await WalletProjectionOperation.countDocuments({
      userId: actors.userId, currency: "USD",
    }), amounts.length);
  });
};
