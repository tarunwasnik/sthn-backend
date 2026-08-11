import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { BookingEscrowAllocation } from "../../../models/bookingEscrowAllocation.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { bookingEscrowAllocationService } from "../../../services/financial/bookingEscrowAllocation.service";
import {
  createCapturedWalletBooking,
  startAllocationHttpServer,
} from "./fixtures/bookingEscrowAllocationFixtures";

export const registerBookingEscrowAllocationReplayTests = () => {
  test("phase8d service and model-reload replay preserve one authoritative allocation", async () => {
    const server = await startAllocationHttpServer();
    try {
      const captured = await createCapturedWalletBooking(server.baseUrl, {
        walletAmount: 1_050,
        slotAmounts: [1_000],
      });
      const walletBefore = await Wallet.findById(captured.fixture.actors.wallet._id).orFail();
      const projectionCount = await WalletProjectionOperation.countDocuments();
      const first = await bookingEscrowAllocationService.allocate(
        captured.booking._id.toString(),
      );
      const persistedBefore = await BookingEscrowAllocation.findOne({
        bookingId: captured.booking._id,
      }).select(
        "+allocationKey +allocationLedgerTransaction " +
        "+allocationLedgerEntryIds +allocationFingerprint",
      ).orFail();
      const second = await bookingEscrowAllocationService.allocate(
        captured.booking._id.toString(),
      );
      const validated = await bookingEscrowAllocationService.validateReplay(
        captured.booking._id.toString(),
      );
      const persistedAfter = await BookingEscrowAllocation.findOne({
        bookingId: captured.booking._id,
      }).select(
        "+allocationKey +allocationLedgerTransaction " +
        "+allocationLedgerEntryIds +allocationFingerprint",
      ).orFail();
      assert.equal(first.replay, false);
      assert.equal(second.replay, true);
      assert.equal(validated.replay, true);
      assert.equal(second.allocation.allocationReference, first.allocation.allocationReference);
      assert.equal(
        persistedAfter.allocatedAt?.getTime(),
        persistedBefore.allocatedAt?.getTime(),
      );
      assert.equal(persistedAfter.allocationKey, persistedBefore.allocationKey);
      assert.equal(
        persistedAfter.allocationLedgerTransaction,
        persistedBefore.allocationLedgerTransaction,
      );
      assert.deepEqual(
        persistedAfter.allocationLedgerEntryIds,
        persistedBefore.allocationLedgerEntryIds,
      );
      assert.equal(await BookingEscrowAllocation.countDocuments({
        bookingId: captured.booking._id,
      }), 1);
      assert.equal(await LedgerEntry.countDocuments({
        bookingId: captured.booking._id,
        source: LedgerSource.BOOKING_ESCROW_ALLOCATION,
      }), 4);
      assert.equal(await AuditLog.countDocuments({
        action: AuditAction.BOOKING_ESCROW_ALLOCATED,
        entityId: persistedAfter._id,
      }), 1);
      assert.equal(await WalletProjectionOperation.countDocuments(), projectionCount);
      const walletAfter = await Wallet.findById(captured.fixture.actors.wallet._id).orFail();
      assert.equal(walletAfter.currentBalance, walletBefore.currentBalance);
      assert.equal(walletAfter.projectionVersion, walletBefore.projectionVersion);
    } finally {
      await server.close();
    }
  });
};
