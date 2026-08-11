import assert from "node:assert/strict";
import { test } from "node:test";

import { Booking } from "../../../models/booking.model";
import { BookingCreatorSettlement } from
  "../../../models/bookingCreatorSettlement.model";
import { BookingEscrowAllocation } from
  "../../../models/bookingEscrowAllocation.model";
import { BookingFundReservation } from
  "../../../models/bookingFundReservation.model";
import { CreatorWithdrawalRequest } from
  "../../../models/creatorWithdrawalRequest.model";
import { ExchangeRateSnapshot } from
  "../../../models/exchangeRateSnapshot.model";
import InternalProviderEvent from
  "../../../models/internalProvider/internalProviderEvent.model";
import { InternalTopUpFunding } from
  "../../../models/internalTopUpFunding.model";
import { InternalWithdrawalProviderRequest } from
  "../../../models/internalProvider/internalWithdrawalProviderRequest.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { WalletTopUpRequest } from "../../../models/walletTopUpRequest.model";
import { approve, createDecisionFixture } from
  "./fixtures/walletConversionDecisionFixtures";

const frozenCounts = () => Promise.all([
  Wallet.countDocuments({}), LedgerEntry.countDocuments({}),
  WalletProjectionOperation.countDocuments({}), Booking.countDocuments({}),
  Payment.countDocuments({}), BookingFundReservation.countDocuments({}),
  BookingEscrowAllocation.countDocuments({}),
  BookingCreatorSettlement.countDocuments({}),
  CreatorWithdrawalRequest.countDocuments({}),
  InternalWithdrawalProviderRequest.countDocuments({}),
  InternalProviderEvent.countDocuments({}),
  WalletTopUpRequest.countDocuments({}), InternalTopUpFunding.countDocuments({}),
]);

export const registerRegressionTests = () => {
  test("phase10g no-money-movement proof changes only decision and audit", async () => {
    const fixture = await createDecisionFixture();
    const beforeCounts = await frozenCounts();
    const beforeWallets = await Wallet.find({}).sort({ _id: 1 }).lean();
    const beforeSnapshots = await ExchangeRateSnapshot.find({})
      .sort({ snapshotReference: 1 })
      .select("+snapshotFingerprint +responseFingerprint").lean();
    const providerCalls = fixture.provider.callCount;
    const requestCount = await WalletConversionRequest.countDocuments({});
    const auditCount = await WalletConversionAudit.countDocuments({});
    await approve(fixture);
    await approve(fixture);
    assert.deepEqual(await frozenCounts(), beforeCounts);
    assert.deepEqual(await Wallet.find({}).sort({ _id: 1 }).lean(), beforeWallets);
    assert.deepEqual(await ExchangeRateSnapshot.find({})
      .sort({ snapshotReference: 1 })
      .select("+snapshotFingerprint +responseFingerprint").lean(),
    beforeSnapshots);
    assert.equal(fixture.provider.callCount, providerCalls);
    assert.equal(await WalletConversionRequest.countDocuments({}), requestCount);
    assert.equal(await WalletConversionAudit.countDocuments({}), auditCount + 1);
  });

  test("phase10g verifies decision queue and audit indexes without duplicating identity indexes", async () => {
    const requestIndexes = await WalletConversionRequest.collection.indexes();
    const auditIndexes = await WalletConversionAudit.collection.indexes();
    assert.ok(requestIndexes.some((index) => index.key.status === 1 &&
      index.key.requestedAt === 1));
    assert.ok(requestIndexes.some((index) => index.key.status === 1 &&
      index.key.decidedAt === -1));
    assert.equal(requestIndexes.filter((index) => index.unique &&
      index.key.conversionReference === 1).length, 1);
    assert.equal(requestIndexes.filter((index) => index.unique &&
      index.key.userId === 1 && index.key.idempotencyKey === 1).length, 1);
    assert.ok(auditIndexes.some((index) => index.key.action === 1 &&
      index.key.decidedAt === -1));
    assert.ok(auditIndexes.some((index) => index.unique &&
      index.key.auditKey === 1));
  });

  test("phase10g never creates an absent target Wallet", async () => {
    const fixture = await createDecisionFixture();
    const before = await Wallet.countDocuments({
      userId: fixture.actors.userId, currency: "USD",
    });
    assert.equal(fixture.request.targetWalletId, undefined);
    await approve(fixture);
    assert.equal(await Wallet.countDocuments({
      userId: fixture.actors.userId, currency: "USD",
    }), before);
  });
};
