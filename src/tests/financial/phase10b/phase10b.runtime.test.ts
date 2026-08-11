/// <reference path="../../../types/express.d.ts" />

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { LedgerAccount } from "../../../enums/financial/ledgerAccount.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../../enums/financial/moneyDirection.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { Booking } from "../../../models/booking.model";
import { BookingEscrowAllocation } from
  "../../../models/bookingEscrowAllocation.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { featureFlagCache } from
  "../../../services/controlPlane/featureFlagCache.service";
import { marketplacePricingService } from
  "../../../services/financial/marketplacePricing.service";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../phase7h/helpers/database";
import {
  createSuccessfulMarketplaceFlow,
  replaySuccessfulMarketplaceFlow,
  snapshotMarketplaceCounts,
} from "../phase10a/fixtures/marketplaceFixtures";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase10b-test-jwt-secret";

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => {
  await clearPhase7HDatabase();
  featureFlagCache.invalidate();
});
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

const accountBalance = async (account: LedgerAccount) => {
  const entries = await LedgerEntry.find({ account });
  return entries.reduce((sum, entry) => sum +
    (entry.direction === MoneyDirection.CREDIT ? entry.amount : -entry.amount),
  0);
};

test("phase10b central pricing produces the immutable 5/20 marketplace split", () => {
  assert.deepEqual(marketplacePricingService.calculate({
    serviceAmount: 1_000,
    currency: "INR",
  }), {
    serviceAmount: 1_000,
    platformFeeAmount: 50,
    commissionAmount: 200,
    creatorAmount: 800,
    totalAmount: 1_050,
    currency: "INR",
  });
  for (const field of ["serviceAmount", "platformFeeAmount", "totalAmount",
    "currency"] as const) {
    assert.equal(Booking.schema.path(field).options.immutable, true);
  }
});

test("phase10b exact-funded marketplace flow pays 1050 and preserves Creator earnings", async () => {
  const flow = await createSuccessfulMarketplaceFlow({
    customerTopUpAmount: 1_050,
  });
  try {
    assert.deepEqual(flow.walletTimeline.customerAfterReservation,
      { available: 0, reserved: 1_050, locked: 0, total: 1_050,
        version: 2 });
    assert.deepEqual(flow.walletTimeline.customerAfterCapture,
      { available: 0, reserved: 0, locked: 0, total: 0, version: 3 });
    assert.deepEqual(flow.walletTimeline.creatorAfterSettlement,
      { available: 800, reserved: 0, locked: 0, total: 800, version: 1 });
    assert.equal(flow.booking.serviceAmount, 1_000);
    assert.equal(flow.booking.platformFeeAmount, 50);
    assert.equal(flow.booking.commissionAmount, 200);
    assert.equal(flow.booking.creatorAmount, 800);
    assert.equal(flow.booking.totalAmount, 1_050);
    assert.equal(flow.payment.amount, 1_050);
    assert.equal(flow.reservation.amount, 1_050);
    assert.equal(flow.allocation.serviceAmount, 1_000);
    assert.equal(flow.allocation.platformFeeAmount, 50);
    assert.equal(flow.allocation.totalAmount, 1_050);
    assert.equal(flow.allocation.commissionAmount, 200);
    assert.equal(flow.allocation.creatorAmount, 800);
    assert.equal(await accountBalance(LedgerAccount.PLATFORM_ESCROW), 0);
    assert.equal(await accountBalance(
      LedgerAccount.PLATFORM_COMMISSION_PAYABLE), 200);
    assert.equal(await accountBalance(
      LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE), 50);
    assert.equal(await LedgerEntry.countDocuments({
      source: LedgerSource.BOOKING_ESCROW_ALLOCATION,
    }), 4);
    assert.equal(flow.withdrawalInput.amount.amount, 800);
    assert.equal(flow.withdrawalFinalized.status, "COMPLETED");
  } finally { await flow.server.close(); }
});

test("phase10b replay and ten-way concurrency create no duplicate effects", async () => {
  const flow = await createSuccessfulMarketplaceFlow({
    customerTopUpAmount: 1_050,
  });
  try {
    const before = await snapshotMarketplaceCounts();
    const attempts = await Promise.all(Array.from({ length: 10 }, () =>
      replaySuccessfulMarketplaceFlow(flow)));
    assert.deepEqual(await snapshotMarketplaceCounts(), before);
    assert.ok(attempts.every((result) =>
      result.allocation.replay && result.settlement.replay));
    assert.equal(new Set(attempts.map((result) =>
      result.allocation.allocation.allocationReference)).size, 1);
  } finally { await flow.server.close(); }
});

test("phase10b safe DTOs and allocation audit expose pricing without authority IDs", async () => {
  const flow = await createSuccessfulMarketplaceFlow({
    customerTopUpAmount: 1_050,
  });
  try {
    assert.deepEqual({
      serviceAmount: flow.allocationResult.allocation.serviceAmount,
      platformFeeAmount: flow.allocationResult.allocation.platformFeeAmount,
      totalAmount: flow.allocationResult.allocation.totalAmount,
      commissionAmount: flow.allocationResult.allocation.commissionAmount,
      creatorAmount: flow.allocationResult.allocation.creatorAmount,
    }, { serviceAmount: 1_000, platformFeeAmount: 50, totalAmount: 1_050,
      commissionAmount: 200, creatorAmount: 800 });
    assert.equal("allocationLedgerTransaction" in
      flow.allocationResult.allocation, false);
    assert.deepEqual({
      serviceAmount: flow.settlementResult.settlement.serviceAmount,
      platformFeeAmount: flow.settlementResult.settlement.platformFeeAmount,
      totalAmount: flow.settlementResult.settlement.totalAmount,
      commissionAmount: flow.settlementResult.settlement.commissionAmount,
      creatorAmount: flow.settlementResult.settlement.creatorAmount,
    }, { serviceAmount: 1_000, platformFeeAmount: 50, totalAmount: 1_050,
      commissionAmount: 200, creatorAmount: 800 });
    const allocation = await BookingEscrowAllocation.findOne({
      bookingId: flow.booking._id,
    }).orFail();
    const audit = await AuditLog.findOne({
      action: AuditAction.BOOKING_ESCROW_ALLOCATED,
      entityId: allocation._id,
    }).orFail();
    assert.deepEqual({
      serviceAmount: audit.metadata?.serviceAmount,
      platformFeeAmount: audit.metadata?.platformFeeAmount,
      totalAmount: audit.metadata?.totalAmount,
      commissionAmount: audit.metadata?.commissionAmount,
      creatorAmount: audit.metadata?.creatorAmount,
    }, { serviceAmount: 1_000, platformFeeAmount: 50, totalAmount: 1_050,
      commissionAmount: 200, creatorAmount: 800 });
    assert.equal("ledgerEntryIds" in (audit.metadata ?? {}), false);
    assert.equal(await Payment.countDocuments(), 1);
  } finally { await flow.server.close(); }
});
