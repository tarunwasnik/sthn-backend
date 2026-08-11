import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { BookingEscrowAllocationStatus } from "../../../enums/financial/bookingEscrowAllocationStatus.enum";
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

export const registerBookingEscrowAllocationConcurrencyTests = () => {
  test("phase8d ten identical concurrent allocations converge on one record, transaction, and audit", async () => {
    const server = await startAllocationHttpServer();
    try {
      const captured = await createCapturedWalletBooking(server.baseUrl, {
        walletAmount: 1_050,
        slotAmounts: [1_000],
      });
      const walletBefore = await Wallet.findById(captured.fixture.actors.wallet._id).orFail();
      const projectionCount = await WalletProjectionOperation.countDocuments();
      const contenders = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          bookingEscrowAllocationService.allocate(captured.booking._id.toString())),
      );
      assert.ok(contenders.every((entry) => entry.status === "fulfilled"),
        contenders.map((entry) => entry.status === "fulfilled"
          ? "fulfilled"
          : String(entry.reason)).join(" | "));
      const fulfilled = contenders.filter((entry) => entry.status === "fulfilled");
      assert.equal(fulfilled.filter((entry) => entry.value.replay === false).length, 1);
      const allocation = await BookingEscrowAllocation.findOne({
        bookingId: captured.booking._id,
      }).orFail();
      assert.equal(allocation.status, BookingEscrowAllocationStatus.ALLOCATED);
      assert.equal(await BookingEscrowAllocation.countDocuments(), 1);
      assert.equal(await LedgerEntry.countDocuments({
        bookingId: captured.booking._id,
        source: LedgerSource.BOOKING_ESCROW_ALLOCATION,
      }), 4);
      assert.equal(await AuditLog.countDocuments({
        action: AuditAction.BOOKING_ESCROW_ALLOCATED,
        entityId: allocation._id,
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
