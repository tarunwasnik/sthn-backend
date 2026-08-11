import assert from "node:assert/strict";
import { test } from "node:test";

import { FINANCIAL_LIMITS } from
  "../../../constants/financial/financialLimits";
import { WalletTopUpRequestError } from
  "../../../errors/financial/WalletTopUpRequestError";
import { InternalTopUpFunding } from
  "../../../models/internalTopUpFunding.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { WalletTopUpRequest } from
  "../../../models/walletTopUpRequest.model";
import { walletTopUpRequestService } from
  "../../../services/financial/walletTopUpRequest.service";
import {
  completeDirectTopUp,
  createMultiCurrencyActors,
  getWallet,
} from "./fixtures/multiCurrencyTopUpFixtures";

export const registerRegressionTests = () => {
  test("phase10d minor units: USD minimum, JPY zero-decimal amount, and maximum bound remain integer units", async () => {
    const minimumActors = await createMultiCurrencyActors();
    await completeDirectTopUp(minimumActors, "USD", 1);
    assert.equal((await getWallet(
      minimumActors.userId, "USD",
    )).availableBalance, 1);

    const jpyActors = await createMultiCurrencyActors();
    await completeDirectTopUp(jpyActors, "JPY", 5_000);
    assert.equal((await getWallet(
      jpyActors.userId, "JPY",
    )).availableBalance, 5_000);

    const maximumActors = await createMultiCurrencyActors();
    await completeDirectTopUp(
      maximumActors, "EUR", FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
    );
    assert.equal((await getWallet(
      maximumActors.userId, "EUR",
    )).availableBalance, FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT);
  });

  test("phase10d minor units: fractional, unsafe, over-limit, and unsupported inputs fail before persistence", async () => {
    const actors = await createMultiCurrencyActors();
    for (const amount of [
      1.5,
      Number.MAX_SAFE_INTEGER,
      FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT + 1,
    ]) {
      await assert.rejects(() => walletTopUpRequestService.create(
        actors.userId.toString(),
        { currency: "USD", amount, idempotencyKey: `invalid-${amount}` },
      ), (error: unknown) => error instanceof WalletTopUpRequestError &&
        error.code === "WALLET_TOP_UP_REQUEST_INVALID_AMOUNT");
    }
    await assert.rejects(() => walletTopUpRequestService.create(
      actors.userId.toString(),
      { currency: "XYZ", amount: 100, idempotencyKey: "unsupported-xyz" },
    ), (error: unknown) => error instanceof WalletTopUpRequestError &&
      error.code === "WALLET_TOP_UP_REQUEST_UNSUPPORTED_CURRENCY");
    assert.equal(await Wallet.countDocuments({
      userId: actors.userId, currency: { $ne: "INR" },
    }), 0);
    assert.equal(await WalletTopUpRequest.countDocuments({}), 0);
  });

  test("phase10d regression: INR direct top-up remains unchanged", async () => {
    const actors = await createMultiCurrencyActors();
    const completed = await completeDirectTopUp(actors, "INR", 4_200);
    assert.equal(completed.accounting.currency, "INR");
    assert.equal(completed.accounting.wallet.currency, "INR");
    assert.equal((await getWallet(
      actors.userId, "INR",
    )).availableBalance, 4_200);
    assert.equal(await Wallet.countDocuments({ userId: actors.userId }), 1);
  });

  test("phase10d indexes: Wallet, request, provider, Ledger, and projection identities remain unique", async () => {
    const indexes = await Promise.all([
      Wallet.collection.indexes(),
      WalletTopUpRequest.collection.indexes(),
      InternalTopUpFunding.collection.indexes(),
      LedgerEntry.collection.indexes(),
      WalletProjectionOperation.collection.indexes(),
    ]);
    assert.ok(indexes[0].some((index) => index.unique &&
      index.key.userId === 1 && index.key.currency === 1));
    assert.ok(indexes[1].some((index) => index.unique &&
      index.key.userId === 1 && index.key.idempotencyKey === 1));
    assert.ok(indexes[2].some((index) => index.unique &&
      index.key.topUpRequestId === 1));
    assert.ok(indexes[3].some((index) => index.unique &&
      index.key.postingKey === 1));
    assert.ok(indexes[4].some((index) => index.unique &&
      index.key.operationKey === 1));
  });
};
