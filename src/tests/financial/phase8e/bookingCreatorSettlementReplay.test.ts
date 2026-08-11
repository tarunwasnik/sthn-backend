import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { BookingCreatorSettlement } from "../../../models/bookingCreatorSettlement.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { bookingAllocationSettlementOrchestrator } from "../../../services/financial/bookingAllocationSettlement.orchestrator";
import { bookingCreatorSettlementService } from "../../../services/financial/bookingCreatorSettlement.service";
import {
  createAllocatedCreatorSettlementFixture,
  startSettlementHttpServer,
} from "./fixtures/bookingCreatorSettlementFixtures";

export const registerBookingCreatorSettlementReplayTests = () => {
  test("phase8e service, orchestrator, model reload, and validation replay preserve one effect", async () => {
    const server = await startSettlementHttpServer();
    try {
      const fixture = await createAllocatedCreatorSettlementFixture(server.baseUrl);
      const first = await bookingCreatorSettlementService.settle(
        fixture.booking._id.toString(),
      );
      const before = await BookingCreatorSettlement.findOne({
        bookingId: fixture.booking._id,
      }).select(
        "+settlementKey +settlementTransactionId " +
        "+settlementProjectionOperationReference +settlementLedgerEntryIds " +
        "+settlementFingerprint",
      ).orFail();
      const walletBefore = await Wallet.findById(fixture.creatorWallet._id).orFail();
      const second = await bookingCreatorSettlementService.settle(
        fixture.booking._id.toString(),
      );
      const orchestrated =
        await bookingAllocationSettlementOrchestrator.allocateAndSettle(
          fixture.booking._id.toString(),
        );
      const validated = await bookingCreatorSettlementService.validateReplay(
        fixture.booking._id.toString(),
      );
      const after = await BookingCreatorSettlement.findById(before._id).select(
        "+settlementKey +settlementTransactionId " +
        "+settlementProjectionOperationReference +settlementLedgerEntryIds " +
        "+settlementFingerprint",
      ).orFail();
      assert.equal(first.replay, false);
      assert.equal(second.replay, true);
      assert.equal(orchestrated.replay, true);
      assert.equal(validated.replay, true);
      assert.equal(
        after.settlementReference,
        before.settlementReference,
      );
      assert.equal(after.settlementKey, before.settlementKey);
      assert.equal(after.settlementTransactionId, before.settlementTransactionId);
      assert.equal(
        after.settlementProjectionOperationReference,
        before.settlementProjectionOperationReference,
      );
      assert.deepEqual(after.settlementLedgerEntryIds, before.settlementLedgerEntryIds);
      assert.equal(after.settledAt?.getTime(), before.settledAt?.getTime());
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
      const walletAfter = await Wallet.findById(fixture.creatorWallet._id).orFail();
      assert.equal(walletAfter.currentBalance, walletBefore.currentBalance);
      assert.equal(walletAfter.projectionVersion, walletBefore.projectionVersion);
    } finally {
      await server.close();
    }
  });
};
