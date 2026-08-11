import assert from "node:assert/strict";
import mongoose, { Types } from "mongoose";
import { test } from "node:test";

import { InternalTopUpFunding } from
  "../../../models/internalTopUpFunding.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import InternalProviderEvent from
  "../../../models/internalProvider/internalProviderEvent.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { WalletTopUpRequest } from
  "../../../models/walletTopUpRequest.model";
import { walletTopUpRequestRepository } from
  "../../../repositories/walletTopUpRequest.repository";
import ProviderEventService from
  "../../../services/internalProvider/events/providerEvent.service";
import { walletProjectionService } from
  "../../../services/wallet/walletProjection.service";
import {
  establishLedgerStage,
} from "../phase7h/fixtures/topUpFixtures";
import {
  approveTopUp,
  completeAccounting,
  createMultiCurrencyActors,
  getWallet,
  reloadTopUp,
  requestTopUp,
  succeedFunding,
} from "./fixtures/multiCurrencyTopUpFixtures";

const processingTopUp = async (currency: "USD" | "EUR", amount: number) => {
  const actors = await createMultiCurrencyActors();
  const dto = await requestTopUp(actors, currency, amount);
  await approveTopUp(actors, dto.topUpReference);
  await succeedFunding(dto.topUpReference);
  const request = await reloadTopUp(dto.topUpReference);
  const funding = await InternalTopUpFunding.findById(request.providerFundingId)
    .select("+requestFingerprint").orFail();
  return { actors, dto, request, funding };
};

export const registerRollbackTests = () => {
  test("phase10d rollback: request persistence failure leaves only the intentional zero-balance Wallet stage", async () => {
    const actors = await createMultiCurrencyActors();
    const original = walletTopUpRequestRepository.createPending;
    (walletTopUpRequestRepository as any).createPending = async () => {
      throw new Error("PHASE10D_REQUEST_PERSISTENCE_FAILURE");
    };
    try {
      await assert.rejects(() => requestTopUp(actors, "USD", 300));
    } finally {
      (walletTopUpRequestRepository as any).createPending = original;
    }
    const wallet = await getWallet(actors.userId, "USD");
    assert.deepEqual([wallet.availableBalance, wallet.currentBalance], [0, 0]);
    assert.equal(await WalletTopUpRequest.countDocuments({}), 0);
    assert.equal(await LedgerEntry.countDocuments({}), 0);
    assert.equal(await WalletProjectionOperation.countDocuments({}), 0);
  });

  test("phase10d rollback: provider event failure aborts provider authority and preserves APPROVED request", async () => {
    const actors = await createMultiCurrencyActors();
    const request = await requestTopUp(actors, "EUR", 425);
    await approveTopUp(actors, request.topUpReference);
    const original = ProviderEventService.recordEvent;
    (ProviderEventService as any).recordEvent = async () => {
      throw new Error("PHASE10D_PROVIDER_EVENT_FAILURE");
    };
    try {
      await assert.rejects(() => succeedFunding(request.topUpReference));
    } finally {
      (ProviderEventService as any).recordEvent = original;
    }
    assert.equal(await InternalTopUpFunding.countDocuments({}), 0);
    assert.equal(await InternalProviderEvent.countDocuments({}), 0);
    assert.equal((await reloadTopUp(request.topUpReference)).status, "APPROVED");
    assert.equal((await getWallet(actors.userId, "EUR")).availableBalance, 0);

    await succeedFunding(request.topUpReference);
    await completeAccounting(request.topUpReference);
    assert.equal((await getWallet(actors.userId, "EUR")).availableBalance, 425);
  });

  test("phase10d rollback: USD Ledger-only interruption resumes without duplicate credit", async () => {
    const fixture = await processingTopUp("USD", 550);
    const staged = await establishLedgerStage(fixture.request, fixture.funding);
    await completeAccounting(fixture.dto.topUpReference);
    assert.equal(await LedgerEntry.countDocuments({
      "metadata.topUpReference": fixture.dto.topUpReference,
    }), 1);
    assert.ok((await LedgerEntry.findOne({
      "metadata.topUpReference": fixture.dto.topUpReference,
    }).orFail())._id.equals(staged.ledger._id));
    assert.equal(await WalletProjectionOperation.countDocuments({
      userId: fixture.actors.userId, currency: "USD",
    }), 1);
    assert.equal((await getWallet(
      fixture.actors.userId, "USD",
    )).availableBalance, 550);
  });

  test("phase10d rollback: aborted EUR projection transaction leaves no projection or balance delta", async () => {
    const fixture = await processingTopUp("EUR", 675);
    const { ledger, identity } = await establishLedgerStage(
      fixture.request, fixture.funding,
    );
    const session = await mongoose.startSession();
    try {
      await assert.rejects(() => session.withTransaction(async () => {
        await walletProjectionService.applyProjectionMutation({
          userId: fixture.request.userId,
          currency: fixture.request.currency,
          operationKey: identity.operationKey,
          deltas: { availableBalance: fixture.request.amount },
          ledgerEntryIds: [ledger._id as Types.ObjectId],
        }, session);
        throw new Error("PHASE10D_ABORT_PROJECTION");
      }));
    } finally {
      await session.endSession();
    }
    assert.equal(await WalletProjectionOperation.countDocuments({
      operationKey: identity.operationKey,
    }), 0);
    assert.equal((await getWallet(
      fixture.actors.userId, "EUR",
    )).availableBalance, 0);
    assert.equal(await LedgerEntry.countDocuments({
      "metadata.topUpReference": fixture.dto.topUpReference,
    }), 1, "The prior Ledger stage remains authoritative.");

    await completeAccounting(fixture.dto.topUpReference);
    assert.equal((await getWallet(
      fixture.actors.userId, "EUR",
    )).availableBalance, 675);
  });

  test("phase10d rollback: completion-link interruption recovers existing Ledger and projection", async () => {
    const fixture = await processingTopUp("USD", 825);
    const original = walletTopUpRequestRepository.completeProcessingWithAccounting;
    (walletTopUpRequestRepository as any).completeProcessingWithAccounting =
      async () => null;
    try {
      await assert.rejects(() => completeAccounting(fixture.dto.topUpReference));
    } finally {
      (walletTopUpRequestRepository as any).completeProcessingWithAccounting =
        original;
    }
    assert.equal((await reloadTopUp(fixture.dto.topUpReference)).status,
      "PROCESSING");
    assert.equal(await LedgerEntry.countDocuments({
      "metadata.topUpReference": fixture.dto.topUpReference,
    }), 1);
    assert.equal(await WalletProjectionOperation.countDocuments({
      userId: fixture.actors.userId, currency: "USD",
    }), 1);
    assert.equal((await getWallet(
      fixture.actors.userId, "USD",
    )).availableBalance, 825);

    await completeAccounting(fixture.dto.topUpReference);
    assert.equal((await reloadTopUp(fixture.dto.topUpReference)).status,
      "COMPLETED");
    assert.equal(await LedgerEntry.countDocuments({}), 1);
    assert.equal(await WalletProjectionOperation.countDocuments({}), 1);
    assert.equal((await getWallet(
      fixture.actors.userId, "USD",
    )).availableBalance, 825);
  });
};
