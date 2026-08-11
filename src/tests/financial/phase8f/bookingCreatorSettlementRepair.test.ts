import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { BookingCreatorSettlementRepairAction as RepairAction } from "../../../enums/financial/bookingCreatorSettlementReconciliation.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { BookingCreatorSettlement } from "../../../models/bookingCreatorSettlement.model";
import { BookingCreatorSettlementRepairOperation } from "../../../models/bookingCreatorSettlementRepairOperation.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { bookingCreatorSettlementReconciliationService } from "../../../services/financial/bookingCreatorSettlementReconciliation.service";
import { bookingCreatorSettlementRepairService } from "../../../services/financial/bookingCreatorSettlementRepair.service";
import {
  createSettledOperationalFixture,
  startOperationalHttpServer,
} from "./fixtures/bookingCreatorSettlementOperationalFixtures";

export const registerBookingCreatorSettlementRepairTests = () => {
  test("phase8f missing audit repair is bounded, idempotent, and financially read-only", async () => {
    const server = await startOperationalHttpServer();
    try {
      const fixture = await createSettledOperationalFixture(server.baseUrl);
      await AuditLog.deleteOne({
        action: AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
        entityId: fixture.settlement._id,
      });
      const reconciliation =
        await bookingCreatorSettlementReconciliationService.reconcile(
          fixture.settlement.settlementReference,
        );
      const walletBefore = await Wallet.findById(fixture.creatorWallet._id).orFail();
      const ledgerCount = await LedgerEntry.countDocuments();
      const first = await bookingCreatorSettlementRepairService.repair(
        reconciliation.reconciliationReference as string,
        RepairAction.RESTORE_MISSING_AUDIT,
        fixture.fixture.actors.adminId.toString(),
      );
      const replay = await bookingCreatorSettlementRepairService.repair(
        reconciliation.reconciliationReference as string,
        RepairAction.RESTORE_MISSING_AUDIT,
        fixture.fixture.actors.adminId.toString(),
      );
      assert.equal(first.operationReference, replay.operationReference);
      assert.equal(await BookingCreatorSettlementRepairOperation.countDocuments(), 1);
      assert.equal(await AuditLog.countDocuments({
        action: AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
        entityId: fixture.settlement._id,
      }), 1);
      assert.equal(await AuditLog.countDocuments({
        action: AuditAction.BOOKING_CREATOR_SETTLEMENT_REPAIRED,
      }), 1);
      assert.equal(await LedgerEntry.countDocuments(), ledgerCount);
      const walletAfter = await Wallet.findById(fixture.creatorWallet._id).orFail();
      assert.equal(walletAfter.currentBalance, walletBefore.currentBalance);
      assert.equal(walletAfter.projectionVersion, walletBefore.projectionVersion);
    } finally {
      await server.close();
    }
  });

  test("phase8f concurrent replay-metadata repairs converge on one operation", async () => {
    const server = await startOperationalHttpServer();
    try {
      const fixture = await createSettledOperationalFixture(server.baseUrl);
      await BookingCreatorSettlement.collection.updateOne({
        _id: fixture.settlement._id,
      }, { $set: { settlementLedgerEntryIds: [] } });
      const reconciliation =
        await bookingCreatorSettlementReconciliationService.reconcile(
          fixture.settlement.settlementReference,
        );
      const attempts = await Promise.allSettled(Array.from({ length: 8 }, () =>
        bookingCreatorSettlementRepairService.repair(
          reconciliation.reconciliationReference as string,
          RepairAction.RESTORE_REPLAY_METADATA,
          fixture.fixture.actors.adminId.toString(),
        )));
      assert.ok(attempts.every((item) => item.status === "fulfilled"),
        attempts.map((item) => item.status === "fulfilled"
          ? "fulfilled" : String(item.reason)).join(" | "));
      assert.equal(await BookingCreatorSettlementRepairOperation.countDocuments(), 1);
      const repaired = await BookingCreatorSettlement.findById(
        fixture.settlement._id,
      ).select("+settlementLedgerEntryIds").orFail();
      assert.equal(repaired.settlementLedgerEntryIds.length, 2);
    } finally {
      await server.close();
    }
  });

  test("phase8f forbids repair of corrupted accounting", async () => {
    const server = await startOperationalHttpServer();
    try {
      const fixture = await createSettledOperationalFixture(server.baseUrl);
      await LedgerEntry.collection.updateOne({
        transactionId: fixture.settlement.settlementTransactionId,
        account: "CREATOR_PAYABLE",
      }, { $set: { amount: 799 } });
      const reconciliation =
        await bookingCreatorSettlementReconciliationService.reconcile(
          fixture.settlement.settlementReference,
        );
      await assert.rejects(
        bookingCreatorSettlementRepairService.repair(
          reconciliation.reconciliationReference as string,
          RepairAction.RESTORE_REPLAY_METADATA,
          fixture.fixture.actors.adminId.toString(),
        ),
      );
      assert.equal(await BookingCreatorSettlementRepairOperation.countDocuments(), 0);
    } finally {
      await server.close();
    }
  });
};
