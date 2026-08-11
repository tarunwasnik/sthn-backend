import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { BookingCreatorSettlement } from "../../../models/bookingCreatorSettlement.model";
import { BookingCreatorSettlementRetryAttempt } from "../../../models/bookingCreatorSettlementRetryAttempt.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { bookingCreatorSettlementReconciliationService } from "../../../services/financial/bookingCreatorSettlementReconciliation.service";
import { bookingCreatorSettlementRetryService } from "../../../services/financial/bookingCreatorSettlementRetry.service";
import {
  createSettledOperationalFixture,
  startOperationalHttpServer,
} from "./fixtures/bookingCreatorSettlementOperationalFixtures";

const makeGuardPending = async (fixture: any) => {
  await BookingCreatorSettlement.collection.updateOne({
    _id: fixture.settlement._id,
  }, { $set: { status: "PENDING" }, $unset: { settledAt: "" } });
  return bookingCreatorSettlementReconciliationService.reconcile(
    fixture.settlement.settlementReference,
  );
};

export const registerBookingCreatorSettlementRetryTests = () => {
  test("phase8f concurrent retries apply one PENDING-to-SETTLED guard with no accounting effect", async () => {
    const server = await startOperationalHttpServer();
    try {
      const fixture = await createSettledOperationalFixture(server.baseUrl);
      const reconciliation = await makeGuardPending(fixture);
      const walletBefore = await Wallet.findById(fixture.creatorWallet._id).orFail();
      const ledgerCount = await LedgerEntry.countDocuments();
      const projectionCount = await WalletProjectionOperation.countDocuments();
      const attempts = await Promise.allSettled(Array.from({ length: 8 }, () =>
        bookingCreatorSettlementRetryService.retry(
          reconciliation.reconciliationReference as string,
        )));
      assert.ok(attempts.every((item) => item.status === "fulfilled"),
        attempts.map((item) => item.status === "fulfilled"
          ? "fulfilled" : String(item.reason)).join(" | "));
      assert.equal((await BookingCreatorSettlement.findById(
        fixture.settlement._id,
      ).orFail()).status, "SETTLED");
      assert.equal(await BookingCreatorSettlementRetryAttempt.countDocuments(), 1);
      assert.equal(await AuditLog.countDocuments({
        action: AuditAction.BOOKING_CREATOR_SETTLEMENT_RETRIED,
      }), 1);
      assert.equal(await LedgerEntry.countDocuments(), ledgerCount);
      assert.equal(await WalletProjectionOperation.countDocuments(), projectionCount);
      const walletAfter = await Wallet.findById(fixture.creatorWallet._id).orFail();
      assert.equal(walletAfter.currentBalance, walletBefore.currentBalance);
      assert.equal(walletAfter.projectionVersion, walletBefore.projectionVersion);
    } finally {
      await server.close();
    }
  });

  test("phase8f retry rejects a healthy completed settlement", async () => {
    const server = await startOperationalHttpServer();
    try {
      const fixture = await createSettledOperationalFixture(server.baseUrl);
      const reconciliation =
        await bookingCreatorSettlementReconciliationService.reconcile(
          fixture.settlement.settlementReference,
        );
      await assert.rejects(
        bookingCreatorSettlementRetryService.retry(
          reconciliation.reconciliationReference as string,
        ),
        (error: any) => {
          assert.equal(
            error.code,
            "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_RETRY_NOT_ALLOWED",
          );
          return true;
        },
      );
    } finally {
      await server.close();
    }
  });
};
