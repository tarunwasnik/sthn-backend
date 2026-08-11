import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { LedgerAccount } from "../../../enums/financial/ledgerAccount.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { BookingCreatorSettlement } from "../../../models/bookingCreatorSettlement.model";
import { InternalTopUpFunding } from "../../../models/internalTopUpFunding.model";
import InternalPaymentModel from "../../../models/internalProvider/internalPayment.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payout } from "../../../models/payout.model";
import { Refund } from "../../../models/refund.model";
import { Settlement } from "../../../models/settlement.model";
import { Withdrawal } from "../../../models/withdrawal.model";
import { bookingCreatorSettlementService } from "../../../services/financial/bookingCreatorSettlement.service";
import {
  createAllocatedCreatorSettlementFixture,
  startSettlementHttpServer,
} from "./fixtures/bookingCreatorSettlementFixtures";

export const registerBookingCreatorSettlementRegressionTests = () => {
  test("phase8e settlement does not enter provider, top-up, payout, withdrawal, refund, or legacy settlement domains", async () => {
    const server = await startSettlementHttpServer();
    try {
      const fixture = await createAllocatedCreatorSettlementFixture(server.baseUrl);
      const beforeTopUps = await InternalTopUpFunding.countDocuments();
      await bookingCreatorSettlementService.settle(
        fixture.booking._id.toString(),
      );
      assert.equal(await InternalPaymentModel.countDocuments({
        paymentId: fixture.payment._id,
      }), 0);
      assert.equal(await InternalTopUpFunding.countDocuments(), beforeTopUps);
      assert.equal(await Settlement.countDocuments({
        bookingId: fixture.booking._id,
      }), 0);
      assert.equal(await Payout.countDocuments(), 0);
      assert.equal(await Withdrawal.countDocuments(), 0);
      assert.equal(await Refund.countDocuments({
        paymentId: fixture.payment._id,
      }), 0);
      assert.equal(await LedgerEntry.countDocuments({
        bookingId: fixture.booking._id,
        source: LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
        account: LedgerAccount.PLATFORM_ESCROW,
      }), 0);
      assert.equal(await LedgerEntry.countDocuments({
        bookingId: fixture.booking._id,
        source: LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
        account: LedgerAccount.PLATFORM_COMMISSION_PAYABLE,
      }), 0);
    } finally {
      await server.close();
    }
  });

  test("phase8e settlement authority indexes exist in MongoDB", async () => {
    const indexes = await BookingCreatorSettlement.collection.indexes();
    for (const field of [
      "settlementReference",
      "settlementKey",
      "allocationId",
      "bookingId",
      "paymentId",
      "reservationId",
      "settlementTransactionId",
      "settlementProjectionOperationReference",
    ]) {
      const index = indexes.find((candidate) => candidate.key[field] === 1);
      assert.ok(index, `${field} index is missing`);
      assert.equal(index.unique, true);
    }
    assert.ok(indexes.find((candidate) =>
      candidate.key.status === 1 && candidate.key.settledAt === -1));
    assert.ok(indexes.find((candidate) =>
      candidate.key.creatorId === 1 && candidate.key.settledAt === -1));
    assert.ok(indexes.find((candidate) =>
      candidate.key.creatorUserId === 1 && candidate.key.settledAt === -1));
    assert.ok(indexes.find((candidate) =>
      candidate.key.creatorWalletId === 1 && candidate.key.settledAt === -1));
  });

  test("phase8e exact replay rejects missing success audit", async () => {
    const server = await startSettlementHttpServer();
    try {
      const fixture = await createAllocatedCreatorSettlementFixture(server.baseUrl);
      const settled = await bookingCreatorSettlementService.settle(
        fixture.booking._id.toString(),
      );
      await AuditLog.deleteOne({
        action: AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
        "financialContext.primaryReference":
          settled.settlement.settlementReference,
      });
      await assert.rejects(
        bookingCreatorSettlementService.validateReplay(
          fixture.booking._id.toString(),
        ),
        (error: any) => {
          assert.equal(
            error?.code,
            "BOOKING_CREATOR_SETTLEMENT_INTEGRITY_ERROR",
          );
          return true;
        },
      );
    } finally {
      await server.close();
    }
  });
};
