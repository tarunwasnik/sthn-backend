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
import { ExchangeRateSnapshot } from "../../../models/exchangeRateSnapshot.model";
import { InternalTopUpFunding } from "../../../models/internalTopUpFunding.model";
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
import { createConversionFixture, requestInput } from
  "./fixtures/walletConversionRequestFixtures";

const frozenCounts = () => Promise.all([
  Wallet.countDocuments({}), LedgerEntry.countDocuments({}),
  WalletProjectionOperation.countDocuments({}), Booking.countDocuments({}),
  Payment.countDocuments({}), BookingFundReservation.countDocuments({}),
  BookingEscrowAllocation.countDocuments({}),
  BookingCreatorSettlement.countDocuments({}),
  CreatorWithdrawalRequest.countDocuments({}),
  InternalWithdrawalProviderRequest.countDocuments({}),
  WalletTopUpRequest.countDocuments({}), InternalTopUpFunding.countDocuments({}),
]);

export const registerRegressionTests = () => {
  test("phase10f no-money-movement proof changes only request and safe audit", async () => {
    const fixture = await createConversionFixture();
    const beforeCounts = await frozenCounts();
    const beforeWallets = await Wallet.find({}).sort({ _id: 1 }).lean();
    const beforeSnapshots = await ExchangeRateSnapshot.find({})
      .sort({ snapshotReference: 1 }).select("+snapshotFingerprint").lean();
    const providerCalls = fixture.provider.callCount;
    await fixture.service.create(fixture.actors.userId.toString(),
      requestInput("phase10f-no-money"));
    assert.deepEqual(await frozenCounts(), beforeCounts);
    assert.deepEqual(await Wallet.find({}).sort({ _id: 1 }).lean(), beforeWallets);
    assert.deepEqual(await ExchangeRateSnapshot.find({})
      .sort({ snapshotReference: 1 }).select("+snapshotFingerprint").lean(),
    beforeSnapshots);
    assert.equal(fixture.provider.callCount, providerCalls);
    assert.equal(await WalletConversionRequest.countDocuments({}), 1);
    assert.equal(await WalletConversionAudit.countDocuments({}), 1);
  });

  test("phase10f indexes enforce request, idempotency, listing, and snapshot identities", async () => {
    const requestIndexes = await WalletConversionRequest.collection.indexes();
    const auditIndexes = await WalletConversionAudit.collection.indexes();
    assert.ok(requestIndexes.some((index) => index.unique &&
      index.key.conversionReference === 1));
    assert.ok(requestIndexes.some((index) => index.unique &&
      index.key.conversionKey === 1));
    assert.ok(requestIndexes.some((index) => index.unique &&
      index.key.userId === 1 && index.key.idempotencyKey === 1));
    assert.ok(requestIndexes.some((index) => index.key.userId === 1 &&
      index.key.requestedAt === -1));
    assert.ok(requestIndexes.some((index) => index.key.fxSnapshotReference === 1));
    assert.ok(auditIndexes.some((index) => index.unique &&
      index.key.auditKey === 1));
  });
};
