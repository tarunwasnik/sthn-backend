import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";

import { InternalTopUpFunding } from
  "../../../models/internalTopUpFunding.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { WalletTopUpRequest } from
  "../../../models/walletTopUpRequest.model";
import { topUpAccountingOrchestratorService } from
  "../../../services/financial/topUpAccountingOrchestrator.service";
import { walletCreationService } from
  "../../../services/wallet/walletCreation.service";
import {
  establishLedgerStage,
  establishProjectionStage,
} from "../phase7h/fixtures/topUpFixtures";
import {
  approveTopUp,
  completeDirectTopUp,
  createMultiCurrencyActors,
  getWallet,
  reloadTopUp,
  requestTopUp,
  succeedFunding,
} from "./fixtures/multiCurrencyTopUpFixtures";

const processingUsd = async () => {
  const actors = await createMultiCurrencyActors();
  const dto = await requestTopUp(actors, "USD", 600);
  await approveTopUp(actors, dto.topUpReference);
  await succeedFunding(dto.topUpReference);
  const request = await reloadTopUp(dto.topUpReference);
  const funding = await InternalTopUpFunding.findById(request.providerFundingId)
    .select("+requestFingerprint").orFail();
  return { actors, dto, request, funding };
};

const assertNoAccountingEffect = async (
  actors: Awaited<ReturnType<typeof createMultiCurrencyActors>>,
) => {
  assert.equal(await LedgerEntry.countDocuments({}), 0);
  assert.equal(await WalletProjectionOperation.countDocuments({}), 0);
  const usd = await Wallet.findOne({
    userId: actors.userId, currency: "USD",
  });
  assert.equal(usd?.availableBalance ?? 0, 0);
};

export const registerIsolationTests = () => {
  test("phase10d integrity: request-to-Wallet currency and ownership mismatches fail closed", async () => {
    const { actors, dto, request } = await processingUsd();
    const eurWallet = await walletCreationService.createWallet(
      actors.userId, "EUR",
    );
    await WalletTopUpRequest.collection.updateOne(
      { _id: request._id },
      { $set: { walletId: eurWallet._id } },
    );
    await assert.rejects(() =>
      topUpAccountingOrchestratorService.complete(dto.topUpReference));
    await assertNoAccountingEffect(actors);

    await WalletTopUpRequest.collection.updateOne(
      { _id: request._id },
      { $set: { walletId: request.walletId } },
    );
    await Wallet.collection.updateOne(
      { _id: request.walletId },
      { $set: { userId: new Types.ObjectId() } },
    );
    await assert.rejects(() =>
      topUpAccountingOrchestratorService.complete(dto.topUpReference));
    assert.equal(await LedgerEntry.countDocuments({}), 0);
    assert.equal(await WalletProjectionOperation.countDocuments({}), 0);
  });

  test("phase10d integrity: provider currency or amount mismatch fails before accounting", async () => {
    const currencyCase = await processingUsd();
    await InternalTopUpFunding.collection.updateOne(
      { _id: currencyCase.funding._id },
      { $set: { currency: "EUR" } },
    );
    await assert.rejects(() => topUpAccountingOrchestratorService.complete(
      currencyCase.dto.topUpReference,
    ));
    await assertNoAccountingEffect(currencyCase.actors);
  });

  test("phase10d integrity: provider amount mismatch fails before accounting", async () => {
    const amountCase = await processingUsd();
    await InternalTopUpFunding.collection.updateOne(
      { _id: amountCase.funding._id },
      { $set: { amount: 601 } },
    );
    await assert.rejects(() => topUpAccountingOrchestratorService.complete(
      amountCase.dto.topUpReference,
    ));
    await assertNoAccountingEffect(amountCase.actors);
  });

  test("phase10d integrity: Ledger currency and amount mismatches cannot project", async () => {
    const currencyCase = await processingUsd();
    const currencyLedger = await establishLedgerStage(
      currencyCase.request, currencyCase.funding,
    );
    await LedgerEntry.collection.updateOne(
      { _id: currencyLedger.ledger._id },
      { $set: { currency: "EUR" } },
    );
    await assert.rejects(() => topUpAccountingOrchestratorService.complete(
      currencyCase.dto.topUpReference,
    ));
    assert.equal(await WalletProjectionOperation.countDocuments({}), 0);
    assert.equal((await getWallet(
      currencyCase.actors.userId, "USD",
    )).availableBalance, 0);
  });

  test("phase10d integrity: Ledger amount mismatch cannot project", async () => {
    const amountCase = await processingUsd();
    const amountLedger = await establishLedgerStage(
      amountCase.request, amountCase.funding,
    );
    await LedgerEntry.collection.updateOne(
      { _id: amountLedger.ledger._id },
      { $set: { amount: 601 } },
    );
    await assert.rejects(() => topUpAccountingOrchestratorService.complete(
      amountCase.dto.topUpReference,
    ));
    assert.equal(await WalletProjectionOperation.countDocuments({}), 0);
    assert.equal((await getWallet(
      amountCase.actors.userId, "USD",
    )).availableBalance, 0);
  });

  test("phase10d integrity: projection currency corruption blocks completion without cross-currency mutation", async () => {
    const fixture = await processingUsd();
    const stage = await establishProjectionStage(
      fixture.request, fixture.funding,
    );
    await WalletProjectionOperation.collection.updateOne(
      { _id: stage.operation._id },
      { $set: { currency: "EUR" } },
    );
    await assert.rejects(() => topUpAccountingOrchestratorService.complete(
      fixture.dto.topUpReference,
    ));
    assert.equal((await getWallet(
      fixture.actors.userId, "USD",
    )).availableBalance, 600);
    assert.equal(await Wallet.countDocuments({
      userId: fixture.actors.userId, currency: "EUR",
    }), 0);
    assert.equal((await reloadTopUp(fixture.dto.topUpReference)).status,
      "PROCESSING");
  });

  test("phase10d integrity: completed USD request cannot link to EUR projection", async () => {
    const actors = await createMultiCurrencyActors();
    const [usd, eur] = await Promise.all([
      completeDirectTopUp(actors, "USD", 300),
      completeDirectTopUp(actors, "EUR", 450),
    ]);
    const eurRequest = await reloadTopUp(eur.request.topUpReference);
    await WalletTopUpRequest.collection.updateOne(
      { topUpReference: usd.request.topUpReference },
      { $set: {
        walletProjectionOperationId: eurRequest.walletProjectionOperationId,
        walletProjectionOperationReference:
          eurRequest.walletProjectionOperationReference,
      } },
    );
    await assert.rejects(() => topUpAccountingOrchestratorService.complete(
      usd.request.topUpReference,
    ));
    assert.equal((await getWallet(actors.userId, "USD")).availableBalance, 300);
    assert.equal((await getWallet(actors.userId, "EUR")).availableBalance, 450);
  });

  test("phase10d integrity: conflicting deterministic accounting identity fails replay", async () => {
    const actors = await createMultiCurrencyActors();
    const completed = await completeDirectTopUp(actors, "USD", 725);
    await WalletTopUpRequest.collection.updateOne(
      { topUpReference: completed.request.topUpReference },
      { $set: { accountingTransactionId: "TUA-CROSS-CURRENCY-CONFLICT" } },
    );
    await assert.rejects(() => topUpAccountingOrchestratorService.complete(
      completed.request.topUpReference,
    ));
    assert.equal(await LedgerEntry.countDocuments({}), 1);
    assert.equal(await WalletProjectionOperation.countDocuments({}), 1);
    assert.equal((await getWallet(actors.userId, "USD")).availableBalance, 725);
  });
};
