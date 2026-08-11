import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { BookingCreatorSettlementStatus } from "../../../enums/financial/bookingCreatorSettlementStatus.enum";
import { LedgerAccount } from "../../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../../enums/financial/moneyDirection.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { Booking } from "../../../models/booking.model";
import { BookingCreatorSettlement } from "../../../models/bookingCreatorSettlement.model";
import { BookingEscrowAllocation } from "../../../models/bookingEscrowAllocation.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import { InternalTopUpFunding } from "../../../models/internalTopUpFunding.model";
import InternalPaymentModel from "../../../models/internalProvider/internalPayment.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { Payout } from "../../../models/payout.model";
import { Refund } from "../../../models/refund.model";
import { Settlement } from "../../../models/settlement.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { Withdrawal } from "../../../models/withdrawal.model";
import { bookingCreatorSettlementService } from "../../../services/financial/bookingCreatorSettlement.service";
import {
  createAllocatedCreatorSettlementFixture,
  startSettlementHttpServer,
} from "./fixtures/bookingCreatorSettlementFixtures";

const accountBalance = (
  entries: Awaited<ReturnType<typeof LedgerEntry.find>>,
  account: LedgerAccount,
) => entries.filter((entry) => entry.account === account)
  .reduce((total, entry) =>
    total + (entry.direction === MoneyDirection.CREDIT ? entry.amount : -entry.amount), 0);

export const registerBookingCreatorSettlementFullFlowTests = () => {
  test("phase8e full flow settles Creator payable 800 into the existing User-owned Wallet", async () => {
    const server = await startSettlementHttpServer();
    try {
      const fixture = await createAllocatedCreatorSettlementFixture(
        server.baseUrl,
        {
          bookingAmount: 1_000,
          customerWalletAmount: 1_600,
          creatorWalletAmount: 100,
        },
      );
      const customerBefore = await Wallet.findById(
        fixture.fixture.actors.wallet._id,
      ).orFail();
      const topUpCount = await InternalTopUpFunding.countDocuments();
      const result = await bookingCreatorSettlementService.settle(
        fixture.booking._id.toString(),
      );
      assert.equal(result.replay, false);
      assert.equal(
        result.settlement.status,
        BookingCreatorSettlementStatus.SETTLED,
      );
      assert.equal(result.settlement.creatorAmount, 800);
      assert.equal(result.settlement.currency, "INR");
      assert.deepEqual([
        result.wallet.availableBalance,
        result.wallet.reservedBalance,
        result.wallet.lockedBalance,
        result.wallet.currentBalance,
      ], [900, 0, 0, 900]);
      assert.equal("_id" in result.settlement, false);
      assert.equal("settlementKey" in result.settlement, false);
      assert.equal("settlementFingerprint" in result.settlement, false);
      assert.equal("creatorWalletId" in result.wallet, false);

      const [booking, payment, reservation, allocation, settlement, wallet] =
        await Promise.all([
          Booking.findById(fixture.booking._id).orFail(),
          Payment.findById(fixture.payment._id).orFail(),
          BookingFundReservation.findById(fixture.reservation._id).orFail(),
          BookingEscrowAllocation.findById(fixture.allocation._id).orFail(),
          BookingCreatorSettlement.findOne({
            bookingId: fixture.booking._id,
          }).select(
            "+settlementKey +settlementTransactionId " +
            "+settlementProjectionOperationReference " +
            "+settlementLedgerEntryIds +settlementFingerprint",
          ).orFail(),
          Wallet.findById(fixture.creatorWallet._id).orFail(),
        ]);
      assert.equal(booking.status, "COMPLETED");
      assert.equal(payment.status, "CAPTURED");
      assert.equal(reservation.status, "CAPTURED");
      assert.equal(allocation.status, "ALLOCATED");
      assert.equal(settlement.status, "SETTLED");
      assert.equal(settlement.settlementLedgerEntryIds.length, 2);
      assert.deepEqual([
        wallet.availableBalance,
        wallet.reservedBalance,
        wallet.lockedBalance,
        wallet.currentBalance,
      ], [900, 0, 0, 900]);

      const entries = await LedgerEntry.find({ bookingId: booking._id });
      assert.equal(
        accountBalance(entries, LedgerAccount.PLATFORM_CREATOR_COMMISSION_REVENUE),
        200,
      );
      assert.equal(accountBalance(entries, LedgerAccount.CREATOR_PAYABLE), 0);
      assert.equal(accountBalance(
        entries.filter((entry) =>
          entry.userId?.toString() === fixture.fixture.actors.creatorId.toString()),
        LedgerAccount.WALLET_AVAILABLE,
      ), 800);
      const settlementEntries = entries.filter((entry) =>
        entry.source === LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT);
      assert.equal(settlementEntries.length, 2);
      assert.ok(settlementEntries.every((entry) =>
        entry.type === LedgerEntryType.BOOKING_CREATOR_SETTLED &&
        entry.userId?.toString() === fixture.fixture.actors.creatorId.toString()));
      assert.equal(
        settlementEntries.filter((entry) =>
          entry.account === LedgerAccount.CREATOR_PAYABLE &&
          entry.direction === MoneyDirection.DEBIT &&
          !entry.walletId).length,
        1,
      );
      assert.equal(
        settlementEntries.filter((entry) =>
          entry.account === LedgerAccount.WALLET_AVAILABLE &&
          entry.direction === MoneyDirection.CREDIT &&
          entry.walletId?.toString() === wallet._id.toString()).length,
        1,
      );
      assert.equal(
        settlementEntries.filter((entry) =>
          entry.direction === MoneyDirection.DEBIT)
          .reduce((sum, entry) => sum + entry.amount, 0),
        800,
      );
      assert.equal(
        settlementEntries.filter((entry) =>
          entry.direction === MoneyDirection.CREDIT)
          .reduce((sum, entry) => sum + entry.amount, 0),
        800,
      );
      const projection = await WalletProjectionOperation.findOne({
        operationReference:
          settlement.settlementProjectionOperationReference,
      }).orFail();
      assert.deepEqual([
        projection.deltas.availableBalance,
        projection.deltas.reservedBalance,
        projection.deltas.lockedBalance,
      ], [800, 0, 0]);
      assert.equal(projection.walletId.toString(), wallet._id.toString());
      assert.equal(projection.userId.toString(), wallet.userId.toString());
      assert.equal(projection.ledgerEntryIds.length, 2);
      const customerAfter = await Wallet.findById(customerBefore._id).orFail();
      assert.deepEqual([
        customerAfter.availableBalance,
        customerAfter.reservedBalance,
        customerAfter.lockedBalance,
        customerAfter.currentBalance,
        customerAfter.projectionVersion,
      ], [
        customerBefore.availableBalance,
        customerBefore.reservedBalance,
        customerBefore.lockedBalance,
        customerBefore.currentBalance,
        customerBefore.projectionVersion,
      ]);
      assert.equal(await AuditLog.countDocuments({
        action: AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
        entityId: settlement._id,
      }), 1);
      assert.equal(await InternalPaymentModel.countDocuments({
        paymentId: payment._id,
      }), 0);
      assert.equal(await InternalTopUpFunding.countDocuments(), topUpCount);
      assert.equal(await Settlement.countDocuments({ bookingId: booking._id }), 0);
      assert.equal(await Payout.countDocuments(), 0);
      assert.equal(await Withdrawal.countDocuments(), 0);
      assert.equal(await Refund.countDocuments({ paymentId: payment._id }), 0);
    } finally {
      await server.close();
    }
  });
};
