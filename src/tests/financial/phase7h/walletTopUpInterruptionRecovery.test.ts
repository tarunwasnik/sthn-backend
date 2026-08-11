import assert from "node:assert/strict";
import { test } from "node:test";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import {
  completeFundedTopUp,
  createActors,
  createFundedTopUp,
  establishLedgerStage,
  establishProjectionStage,
  reloadRequest,
} from "./fixtures/topUpFixtures";

export const registerInterruptionTests = () => {
  test("phase7h interruption: provider success with no accounting resumes completely", async () => {
    const actors = await createActors();
    const { request } = await createFundedTopUp(actors, 300);
    await completeFundedTopUp(request.topUpReference);
    assert.equal((await reloadRequest(request.topUpReference)).status, "COMPLETED");
    assert.equal(await LedgerEntry.countDocuments({ "metadata.topUpReference": request.topUpReference }), 1);
    assert.equal(await WalletProjectionOperation.countDocuments({ walletId: actors.wallet._id }), 1);
    assert.equal((await Wallet.findById(actors.wallet._id))?.availableBalance, 300);
  });

  test("phase7h interruption: Ledger-only state reuses Ledger and credits once", async () => {
    const actors = await createActors();
    const { request, funding } = await createFundedTopUp(actors, 450);
    const { ledger } = await establishLedgerStage(request, funding);
    await completeFundedTopUp(request.topUpReference);
    const persisted = await LedgerEntry.find({ "metadata.topUpReference": request.topUpReference });
    assert.equal(persisted.length, 1);
    assert.ok(persisted[0]._id.equals(ledger._id));
    assert.equal(await WalletProjectionOperation.countDocuments({ walletId: actors.wallet._id }), 1);
    assert.equal((await Wallet.findById(actors.wallet._id))?.availableBalance, 450);
    assert.equal((await reloadRequest(request.topUpReference)).status, "COMPLETED");
  });

  test("phase7h interruption: Ledger-plus-projection state completes without another credit", async () => {
    const actors = await createActors();
    const { request, funding } = await createFundedTopUp(actors, 900);
    const stage = await establishProjectionStage(request, funding);
    const before = await Wallet.findById(actors.wallet._id);
    await completeFundedTopUp(request.topUpReference);
    const after = await Wallet.findById(actors.wallet._id);
    assert.equal(before?.availableBalance, 900);
    assert.equal(after?.availableBalance, 900);
    assert.equal(await LedgerEntry.countDocuments({ "metadata.topUpReference": request.topUpReference }), 1);
    assert.equal(await WalletProjectionOperation.countDocuments({ operationKey: stage.identity.operationKey }), 1);
    const completed = await reloadRequest(request.topUpReference);
    assert.ok(completed.ledgerEntryId?.equals(stage.ledger._id));
    assert.ok(completed.walletProjectionOperationId?.equals(stage.operation._id));
  });
};
