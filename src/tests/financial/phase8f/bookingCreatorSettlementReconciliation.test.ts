import assert from "node:assert/strict";
import { test } from "node:test";

import { BookingCreatorSettlementFailureClassification as Classification } from "../../../enums/financial/bookingCreatorSettlementFailureClassification.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { BookingCreatorSettlement } from "../../../models/bookingCreatorSettlement.model";
import { BookingCreatorSettlementReconciliation } from "../../../models/bookingCreatorSettlementReconciliation.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { bookingCreatorSettlementReconciliationService } from "../../../services/financial/bookingCreatorSettlementReconciliation.service";
import {
  createSettledOperationalFixture,
  startOperationalHttpServer,
} from "./fixtures/bookingCreatorSettlementOperationalFixtures";

export const registerBookingCreatorSettlementReconciliationTests = () => {
  test("phase8f reconciliation validates the complete Phase 8E graph without financial mutation", async () => {
    const server = await startOperationalHttpServer();
    try {
      const fixture = await createSettledOperationalFixture(server.baseUrl);
      const walletBefore = await Wallet.findById(fixture.creatorWallet._id).orFail();
      const ledgerCount = await LedgerEntry.countDocuments();
      const projectionCount = await WalletProjectionOperation.countDocuments();
      const result = await bookingCreatorSettlementReconciliationService.reconcile(
        fixture.settlement.settlementReference,
      );
      assert.equal(result.classification, Classification.HEALTHY);
      assert.equal(result.status, "RESOLVED");
      assert.equal(result.result, "VALID");
      assert.equal("_id" in result, false);
      assert.equal("snapshotFingerprint" in result, false);
      const walletAfter = await Wallet.findById(fixture.creatorWallet._id).orFail();
      assert.deepEqual([
        walletAfter.currentBalance,
        walletAfter.availableBalance,
        walletAfter.reservedBalance,
        walletAfter.lockedBalance,
        walletAfter.projectionVersion,
      ], [
        walletBefore.currentBalance,
        walletBefore.availableBalance,
        walletBefore.reservedBalance,
        walletBefore.lockedBalance,
        walletBefore.projectionVersion,
      ]);
      assert.equal(await LedgerEntry.countDocuments(), ledgerCount);
      assert.equal(await WalletProjectionOperation.countDocuments(), projectionCount);
    } finally {
      await server.close();
    }
  });

  test("phase8f ten concurrent reconciliation runs converge on one authority", async () => {
    const server = await startOperationalHttpServer();
    try {
      const fixture = await createSettledOperationalFixture(server.baseUrl);
      const results = await Promise.all(Array.from({ length: 10 }, () =>
        bookingCreatorSettlementReconciliationService.reconcile(
          fixture.settlement.settlementReference,
        )));
      assert.equal(new Set(results.map((item) =>
        item.reconciliationReference)).size, 1);
      assert.equal(await BookingCreatorSettlementReconciliation.countDocuments(), 1);
    } finally {
      await server.close();
    }
  });

  test("phase8f reconciliation classifies Ledger, projection, settlement, audit, and PENDING failures", async () => {
    const cases = [
      {
        expected: Classification.CORRUPTED_LEDGER,
        corrupt: async (fixture: any) => LedgerEntry.collection.updateOne({
          transactionId: fixture.settlement.settlementTransactionId,
          account: "CREATOR_PAYABLE",
        }, { $set: { amount: 799 } }),
      },
      {
        expected: Classification.CORRUPTED_PROJECTION,
        corrupt: async (fixture: any) => WalletProjectionOperation.collection.updateOne({
          operationReference:
            fixture.settlement.settlementProjectionOperationReference,
        }, { $set: { "deltas.reservedBalance": 1 } }),
      },
      {
        expected: Classification.CORRUPTED_SETTLEMENT,
        corrupt: async (fixture: any) => BookingCreatorSettlement.collection.updateOne({
          _id: fixture.settlement._id,
        }, { $set: { creatorAmount: 799 } }),
      },
      {
        expected: Classification.MISSING_AUDIT,
        corrupt: async (fixture: any) => AuditLog.deleteOne({
          action: "BOOKING_CREATOR_WALLET_SETTLED",
          entityId: fixture.settlement._id,
        }),
      },
      {
        expected: Classification.REPLAY_REQUIRED,
        corrupt: async (fixture: any) => BookingCreatorSettlement.collection.updateOne({
          _id: fixture.settlement._id,
        }, { $set: { status: "PENDING" }, $unset: { settledAt: "" } }),
      },
      {
        expected: Classification.PENDING,
        corrupt: async (fixture: any) => {
          await Promise.all([
            LedgerEntry.deleteMany({
              transactionId: fixture.settlement.settlementTransactionId,
            }),
            WalletProjectionOperation.deleteOne({
              operationReference:
                fixture.settlement.settlementProjectionOperationReference,
            }),
            AuditLog.deleteOne({
              action: "BOOKING_CREATOR_WALLET_SETTLED",
              entityId: fixture.settlement._id,
            }),
            BookingCreatorSettlement.collection.updateOne({
              _id: fixture.settlement._id,
            }, {
              $set: { status: "PENDING", settlementLedgerEntryIds: [] },
              $unset: { settledAt: "" },
            }),
            Wallet.collection.updateOne({
              _id: fixture.creatorWallet._id,
            }, {
              $inc: {
                currentBalance: -fixture.settlement.creatorAmount,
                availableBalance: -fixture.settlement.creatorAmount,
                projectionVersion: -1,
              },
            }),
          ]);
        },
      },
    ];
    for (const candidate of cases) {
      const server = await startOperationalHttpServer();
      try {
        const fixture = await createSettledOperationalFixture(server.baseUrl);
        await candidate.corrupt(fixture);
        const result =
          await bookingCreatorSettlementReconciliationService.reconcile(
            fixture.settlement.settlementReference,
          );
        assert.equal(result.classification, candidate.expected);
        assert.equal(result.status, "OPEN");
      } finally {
        await server.close();
      }
    }
  });
};
