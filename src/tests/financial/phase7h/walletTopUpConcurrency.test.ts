import assert from "node:assert/strict";
import { test } from "node:test";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import {
  completeFundedTopUp,
  createActors,
  createFundedTopUp,
  establishProjectionStage,
  reloadRequest,
} from "./fixtures/topUpFixtures";

export const registerConcurrencyTests = () => {
  test("phase7h concurrency: 10 same-top-up calls converge to one Ledger and projection", { timeout: 60_000 }, async () => {
    const actors = await createActors();
    const { request } = await createFundedTopUp(actors, 1_250);
    const settled = await Promise.allSettled(
      Array.from({ length: 10 }, () => completeFundedTopUp(request.topUpReference)),
    );
    const rejected = settled
      .filter((item): item is PromiseRejectedResult => item.status === "rejected")
      .map((item) => item.reason instanceof Error
        ? { name: item.reason.name, message: item.reason.message, code: (item.reason as any).code }
        : item.reason);
    assert.equal(
      settled.filter((item) => item.status === "fulfilled").length,
      10,
      JSON.stringify(rejected),
    );
    const [ledgers, operations, wallet, completed] = await Promise.all([
      LedgerEntry.find({ "metadata.topUpReference": request.topUpReference }),
      WalletProjectionOperation.find({ walletId: actors.wallet._id }),
      Wallet.findById(actors.wallet._id),
      reloadRequest(request.topUpReference),
    ]);
    assert.equal(ledgers.length, 1, "Ledger duplicate race created more than one credit.");
    assert.equal(operations.length, 1, "Projection duplicate race created more than one operation.");
    assert.equal(wallet?.availableBalance, 1_250);
    assert.ok(completed.accountingTransactionId);
    assert.ok(completed.completedAt);
    const results = settled
      .filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof completeFundedTopUp>>> =>
        item.status === "fulfilled")
      .map((item) => item.value);
    assert.equal(new Set(results.map((item) => item.ledgerReference)).size, 1);
    assert.equal(new Set(results.map((item) => item.projectionOperationReference)).size, 1);
    assert.equal(new Set(results.map((item) => item.transactionId)).size, 1);
    assert.equal(new Set(results.map((item) => item.completedAt.getTime())).size, 1);
  });

  test("phase7h concurrency: independent top-ups 1000, 2500, and 400 have no lost update", { timeout: 60_000 }, async () => {
    const actors = await createActors();
    const funded = await Promise.all([
      createFundedTopUp(actors, 1_000),
      createFundedTopUp(actors, 2_500),
      createFundedTopUp(actors, 400),
    ]);
    const results = await Promise.all(
      funded.map(({ request }) => completeFundedTopUp(request.topUpReference)),
    );
    const [wallet, ledgerCount, projectionCount] = await Promise.all([
      Wallet.findById(actors.wallet._id),
      LedgerEntry.countDocuments({ userId: actors.userId, type: "WALLET_TOP_UP" }),
      WalletProjectionOperation.countDocuments({ walletId: actors.wallet._id }),
    ]);
    assert.equal(wallet?.availableBalance, 3_900);
    assert.equal(ledgerCount, 3);
    assert.equal(projectionCount, 3);
    assert.equal(new Set(results.map((item) => item.transactionId)).size, 3);
    assert.equal(new Set(results.map((item) => item.ledgerReference)).size, 3);
    assert.equal(new Set(results.map((item) => item.projectionOperationReference)).size, 3);
    for (const { request } of funded) assert.equal((await reloadRequest(request.topUpReference)).status, "COMPLETED");
  });

  test("phase7h completion guard race reuses existing effects and winner timestamp", { timeout: 60_000 }, async () => {
    const actors = await createActors();
    const { request, funding } = await createFundedTopUp(actors, 600);
    await establishProjectionStage(request, funding);
    const before = await Wallet.findById(actors.wallet._id);
    const settled = await Promise.allSettled(
      Array.from({ length: 10 }, () => completeFundedTopUp(request.topUpReference)),
    );
    assert.equal(settled.filter((item) => item.status === "fulfilled").length, 10);
    const after = await Wallet.findById(actors.wallet._id);
    const completed = await reloadRequest(request.topUpReference);
    assert.equal(before?.availableBalance, 600);
    assert.equal(after?.availableBalance, 600);
    assert.equal(await LedgerEntry.countDocuments({ "metadata.topUpReference": request.topUpReference }), 1);
    assert.equal(await WalletProjectionOperation.countDocuments({ walletId: actors.wallet._id }), 1);
    assert.ok(completed.completedAt);
  });
};
