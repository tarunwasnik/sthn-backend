import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { BookingCreatorSettlement } from "../../../models/bookingCreatorSettlement.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { bookingCreatorSettlementService } from "../../../services/financial/bookingCreatorSettlement.service";
import {
  createAllocatedCreatorSettlementFixture,
  startSettlementHttpServer,
} from "./fixtures/bookingCreatorSettlementFixtures";

export const registerBookingCreatorSettlementConcurrencyTests = () => {
  test("phase8e ten identical concurrent settlements converge on one credit", async () => {
    const server = await startSettlementHttpServer();
    try {
      const fixture = await createAllocatedCreatorSettlementFixture(server.baseUrl);
      const contenders = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          bookingCreatorSettlementService.settle(
            fixture.booking._id.toString(),
          )),
      );
      assert.ok(contenders.every((entry) => entry.status === "fulfilled"),
        contenders.map((entry) => entry.status === "fulfilled"
          ? "fulfilled"
          : `${entry.reason?.code}:${entry.reason?.message}`).join(" | "));
      const fulfilled = contenders.filter((entry) => entry.status === "fulfilled");
      assert.equal(fulfilled.filter((entry) => entry.value.replay === false).length, 1);
      assert.equal(await BookingCreatorSettlement.countDocuments(), 1);
      assert.equal(await LedgerEntry.countDocuments({
        source: LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
      }), 2);
      assert.equal(await WalletProjectionOperation.countDocuments({
        walletId: fixture.creatorWallet._id,
      }), 1);
      assert.equal(await AuditLog.countDocuments({
        action: AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
      }), 1);
      const wallet = await Wallet.findById(fixture.creatorWallet._id).orFail();
      assert.deepEqual([
        wallet.availableBalance,
        wallet.reservedBalance,
        wallet.lockedBalance,
        wallet.currentBalance,
      ], [900, 0, 0, 900]);
    } finally {
      await server.close();
    }
  });

  test("phase8e distinct concurrent settlements into one Creator Wallet avoid lost updates", async () => {
    const server = await startSettlementHttpServer();
    try {
      const first = await createAllocatedCreatorSettlementFixture(
        server.baseUrl,
        { bookingAmount: 1_000, creatorWalletAmount: 100 },
      );
      const second = await createAllocatedCreatorSettlementFixture(
        server.baseUrl,
        {
          bookingAmount: 500,
          customerWalletAmount: 525,
          actors: first.fixture.actors,
        },
      );
      assert.equal(
        second.creatorWallet._id.toString(),
        first.creatorWallet._id.toString(),
      );
      const attempts = await Promise.allSettled([
        bookingCreatorSettlementService.settle(first.booking._id.toString()),
        bookingCreatorSettlementService.settle(second.booking._id.toString()),
      ]);
      assert.ok(attempts.every((entry) => entry.status === "fulfilled"),
        attempts.map((entry) => entry.status === "fulfilled"
          ? "fulfilled"
          : String(entry.reason)).join(" | "));
      const wallet = await Wallet.findById(first.creatorWallet._id).orFail();
      assert.deepEqual([
        wallet.availableBalance,
        wallet.reservedBalance,
        wallet.lockedBalance,
        wallet.currentBalance,
      ], [1_300, 0, 0, 1_300]);
      assert.equal(await BookingCreatorSettlement.countDocuments(), 2);
      assert.equal(await LedgerEntry.countDocuments({
        source: LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
      }), 4);
      assert.equal(await WalletProjectionOperation.countDocuments({
        walletId: wallet._id,
      }), 2);
    } finally {
      await server.close();
    }
  });
};
