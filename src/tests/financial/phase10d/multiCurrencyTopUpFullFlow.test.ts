import assert from "node:assert/strict";
import mongoose from "mongoose";
import { test } from "node:test";

import { LedgerEntry } from "../../../models/ledgerEntry.model";
import InternalProviderEvent from
  "../../../models/internalProvider/internalProviderEvent.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import {
  approveTopUp,
  completeAccounting,
  createMultiCurrencyActors,
  getWallet,
  reloadTopUp,
  requestTopUp,
  succeedFunding,
} from "./fixtures/multiCurrencyTopUpFixtures";

export const registerFullFlowTests = () => {
  test("phase10d full flow: USD and EUR direct top-ups preserve the funded currency end to end", async () => {
    const actors = await createMultiCurrencyActors(100_000);
    const usd = await requestTopUp(actors, "USD", 10_000);
    const eur = await requestTopUp(actors, "EUR", 5_000);

    assert.equal((await reloadTopUp(usd.topUpReference)).status, "PENDING");
    assert.equal((await reloadTopUp(eur.topUpReference)).status, "PENDING");
    assert.deepEqual(
      [(await getWallet(actors.userId, "USD")).availableBalance,
        (await getWallet(actors.userId, "EUR")).availableBalance],
      [0, 0],
    );

    await approveTopUp(actors, usd.topUpReference);
    await approveTopUp(actors, eur.topUpReference);
    assert.equal((await reloadTopUp(usd.topUpReference)).status, "APPROVED");
    assert.equal((await reloadTopUp(eur.topUpReference)).status, "APPROVED");

    const usdFunding = await succeedFunding(usd.topUpReference);
    const eurFunding = await succeedFunding(eur.topUpReference);
    assert.deepEqual(
      [usdFunding.providerStatus, eurFunding.providerStatus],
      ["SUCCEEDED", "SUCCEEDED"],
    );
    assert.equal((await reloadTopUp(usd.topUpReference)).status, "PROCESSING");
    assert.equal((await reloadTopUp(eur.topUpReference)).status, "PROCESSING");

    await completeAccounting(usd.topUpReference);
    await completeAccounting(eur.topUpReference);
    const [inrWallet, usdWallet, eurWallet, usdRequest, eurRequest] =
      await Promise.all([
        getWallet(actors.userId, "INR"),
        getWallet(actors.userId, "USD"),
        getWallet(actors.userId, "EUR"),
        reloadTopUp(usd.topUpReference),
        reloadTopUp(eur.topUpReference),
      ]);
    assert.deepEqual(
      [inrWallet.availableBalance, inrWallet.currentBalance],
      [100_000, 100_000],
    );
    assert.deepEqual(
      [usdWallet.availableBalance, usdWallet.currentBalance],
      [10_000, 10_000],
    );
    assert.deepEqual(
      [eurWallet.availableBalance, eurWallet.currentBalance],
      [5_000, 5_000],
    );
    assert.deepEqual([usdRequest.status, eurRequest.status],
      ["COMPLETED", "COMPLETED"]);
    assert.ok(usdRequest.completedAt && eurRequest.completedAt);
    assert.ok(usdRequest.walletProjectionOperationId);
    assert.ok(eurRequest.walletProjectionOperationId);

    const ledgers = await LedgerEntry.find({
      "metadata.topUpReference": {
        $in: [usd.topUpReference, eur.topUpReference],
      },
    }).sort({ currency: 1 });
    assert.deepEqual(ledgers.map((entry) =>
      [entry.currency, entry.amount, entry.type, entry.source]), [
      ["EUR", 5_000, "WALLET_TOP_UP", "INTERNAL_TOP_UP_FUNDING"],
      ["USD", 10_000, "WALLET_TOP_UP", "INTERNAL_TOP_UP_FUNDING"],
    ]);

    const operations = await WalletProjectionOperation.find({
      _id: { $in: [
        usdRequest.walletProjectionOperationId!,
        eurRequest.walletProjectionOperationId!,
      ] },
    }).sort({ currency: 1 });
    assert.equal(operations.length, 2);
    assert.deepEqual(operations.map((operation) => [
      operation.currency,
      operation.deltas.availableBalance,
      operation.deltas.reservedBalance,
      operation.deltas.lockedBalance,
    ]), [
      ["EUR", 5_000, 0, 0],
      ["USD", 10_000, 0, 0],
    ]);
    assert.ok(operations.find((item) => item.currency === "USD")
      ?.walletId.equals(usdWallet._id));
    assert.ok(operations.find((item) => item.currency === "EUR")
      ?.walletId.equals(eurWallet._id));

    for (const request of [usdRequest, eurRequest]) {
      const events = await InternalProviderEvent.find({
        entityId: request.providerFundingId,
      }).sort({ occurredAt: 1 });
      assert.deepEqual(events.map((event) => event.eventType), [
        "TOP_UP_FUNDING_CREATED",
        "TOP_UP_FUNDING_PROCESSING_STARTED",
        "TOP_UP_FUNDING_SUCCEEDED",
      ]);
      assert.equal(new Set(events.map((event) => event.transitionKey)).size, 3);
    }

    assert.equal(mongoose.modelNames().some((name) =>
      /ConversionExecution|ConversionAccounting|ConversionProvider/i.test(name)),
    false);
  });
};
