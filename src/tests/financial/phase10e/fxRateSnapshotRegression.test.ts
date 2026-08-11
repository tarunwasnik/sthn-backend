import assert from "node:assert/strict";
import mongoose from "mongoose";
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
import { InternalTopUpFunding } from
  "../../../models/internalTopUpFunding.model";
import { InternalWithdrawalProviderRequest } from
  "../../../models/internalProvider/internalWithdrawalProviderRequest.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { WalletTopUpRequest } from
  "../../../models/walletTopUpRequest.model";
import { FxRateAudit } from "../../../models/fxRateAudit.model";
import {
  createFxFixture,
  systemActor,
} from "./fixtures/fxRateSnapshotFixtures";

const moneyCounts = async () => Promise.all([
  Wallet.countDocuments({}),
  WalletProjectionOperation.countDocuments({}),
  LedgerEntry.countDocuments({}),
  WalletTopUpRequest.countDocuments({}),
  InternalTopUpFunding.countDocuments({}),
  Booking.countDocuments({}),
  Payment.countDocuments({}),
  BookingFundReservation.countDocuments({}),
  BookingEscrowAllocation.countDocuments({}),
  BookingCreatorSettlement.countDocuments({}),
  CreatorWithdrawalRequest.countDocuments({}),
  InternalWithdrawalProviderRequest.countDocuments({}),
]);

export const registerRegressionTests = () => {
  test("phase10e no-money-movement proof changes only snapshots and safe FX audits", async () => {
    const { actors, service } = await createFxFixture();
    const beforeCounts = await moneyCounts();
    const beforeWallets = await Wallet.find({ userId: actors.userId }).lean();
    await Promise.all([
      service.lookupOrRefresh("INR", "USD", systemActor),
      service.lookupOrRefresh("USD", "INR", systemActor),
      service.lookupOrRefresh("INR", "EUR", systemActor),
      service.lookupOrRefresh("INR", "JPY", systemActor),
    ]);
    const afterCounts = await moneyCounts();
    const afterWallets = await Wallet.find({ userId: actors.userId }).lean();
    assert.deepEqual(afterCounts, beforeCounts);
    assert.deepEqual(afterWallets, beforeWallets);
    assert.equal(await ExchangeRateSnapshot.countDocuments({}), 4);
    assert.equal(await FxRateAudit.countDocuments({
      action: "FX_RATE_SNAPSHOT_CREATED",
    }), 4);
    assert.equal(mongoose.modelNames().some((name) =>
      /ConversionExecution|ConversionAccounting/i.test(name)),
    false);
  });

  test("phase10e indexes enforce immutable identity and one ACTIVE directed-pair authority", async () => {
    const snapshotIndexes = await ExchangeRateSnapshot.collection.indexes();
    const auditIndexes = await FxRateAudit.collection.indexes();
    assert.ok(snapshotIndexes.some((index) => index.unique &&
      index.key.snapshotReference === 1));
    assert.ok(snapshotIndexes.some((index) => index.unique &&
      index.key.snapshotKey === 1));
    assert.ok(snapshotIndexes.some((index) => index.unique &&
      index.key.provider === 1 && index.key.baseCurrency === 1 &&
      index.key.quoteCurrency === 1 && index.key.status === 1 &&
      (index.partialFilterExpression as any)?.status === "ACTIVE"));
    assert.ok(snapshotIndexes.some((index) =>
      index.key.effectiveDate === -1));
    assert.ok(auditIndexes.some((index) => index.unique &&
      index.key.auditKey === 1));
  });
};
