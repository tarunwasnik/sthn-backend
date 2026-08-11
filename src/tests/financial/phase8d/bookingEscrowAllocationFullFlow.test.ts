import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { BookingEscrowAllocationStatus } from "../../../enums/financial/bookingEscrowAllocationStatus.enum";
import { BookingFundReservationStatus } from "../../../enums/financial/bookingFundReservationStatus.enum";
import { LedgerAccount } from "../../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../../enums/financial/moneyDirection.enum";
import { PaymentStatus } from "../../../enums/financial/paymentStatus.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { Booking } from "../../../models/booking.model";
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
import { bookingEscrowAllocationService } from "../../../services/financial/bookingEscrowAllocation.service";
import {
  createCapturedWalletBooking,
  startAllocationHttpServer,
} from "./fixtures/bookingEscrowAllocationFixtures";

const accountBalance = (
  entries: Awaited<ReturnType<typeof LedgerEntry.find>>,
  account: LedgerAccount,
) => entries.filter((entry) => entry.account === account)
  .reduce((total, entry) =>
    total + (entry.direction === MoneyDirection.CREDIT ? entry.amount : -entry.amount), 0);

export const registerBookingEscrowAllocationFullFlowTests = () => {
  test("phase8d full flow allocates captured escrow into fee revenue, commission payable, and Creator payable", async () => {
    const server = await startAllocationHttpServer();
    try {
      const captured = await createCapturedWalletBooking(server.baseUrl, {
        walletAmount: 1_050,
        slotAmounts: [1_000],
      });
      const beforeWallet = await Wallet.findById(captured.fixture.actors.wallet._id).orFail();
      const beforeProjectionCount = await WalletProjectionOperation.countDocuments();
      const beforeTopUpCount = await InternalTopUpFunding.countDocuments();
      assert.deepEqual(
        [
          beforeWallet.availableBalance,
          beforeWallet.reservedBalance,
          beforeWallet.lockedBalance,
          beforeWallet.currentBalance,
        ],
        [0, 0, 0, 0],
      );

      const result = await bookingEscrowAllocationService.allocate(
        captured.booking._id.toString(),
      );
      assert.equal(result.replay, false);
      assert.equal(result.allocation.status, BookingEscrowAllocationStatus.ALLOCATED);
      assert.equal(result.allocation.bookingAmount, 1_050);
      assert.equal(result.allocation.serviceAmount, 1_000);
      assert.equal(result.allocation.platformFeeAmount, 50);
      assert.equal(result.allocation.totalAmount, 1_050);
      assert.equal(result.allocation.commissionRateBps, 2_000);
      assert.equal(result.allocation.commissionAmount, 200);
      assert.equal(result.allocation.creatorAmount, 800);
      assert.equal("_id" in result.allocation, false);
      assert.equal("allocationKey" in result.allocation, false);
      assert.equal("allocationFingerprint" in result.allocation, false);
      assert.equal("allocationLedgerTransaction" in result.allocation, false);

      const [booking, payment, reservation, allocation, wallet, entries] =
        await Promise.all([
          Booking.findById(captured.booking._id).orFail(),
          Payment.findById(captured.payment._id).orFail(),
          BookingFundReservation.findById(captured.reservation._id).orFail(),
          BookingEscrowAllocation.findOne({ bookingId: captured.booking._id })
            .select(
              "+allocationKey +escrowLedgerTransaction " +
              "+allocationLedgerTransaction +allocationLedgerEntryIds " +
              "+allocationFingerprint",
            ).orFail(),
          Wallet.findById(captured.fixture.actors.wallet._id).orFail(),
          LedgerEntry.find({ bookingId: captured.booking._id }),
        ]);
      assert.equal(booking.status, "COMPLETED");
      assert.equal(payment.status, PaymentStatus.CAPTURED);
      assert.equal(reservation.status, BookingFundReservationStatus.CAPTURED);
      assert.equal(allocation.status, BookingEscrowAllocationStatus.ALLOCATED);
      assert.equal(allocation.allocationLedgerEntryIds.length, 4);
      assert.equal(accountBalance(entries, LedgerAccount.PLATFORM_ESCROW), 0);
      assert.equal(
        accountBalance(entries, LedgerAccount.PLATFORM_CREATOR_COMMISSION_REVENUE),
        200,
      );
      assert.equal(accountBalance(entries, LedgerAccount.CREATOR_PAYABLE), 800);
      assert.equal(
        accountBalance(entries, LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE),
        50,
      );
      const allocationEntries = entries.filter((entry) =>
        entry.source === LedgerSource.BOOKING_ESCROW_ALLOCATION);
      assert.equal(allocationEntries.length, 4);
      assert.equal(new Set(allocationEntries.map((entry) => entry.transactionId)).size, 1);
      assert.ok(allocationEntries.every((entry) =>
        entry.type === LedgerEntryType.BOOKING_ESCROW_ALLOCATED &&
        !entry.walletId));
      assert.equal(
        allocationEntries.filter((entry) => entry.direction === MoneyDirection.DEBIT)
          .reduce((sum, entry) => sum + entry.amount, 0),
        1_050,
      );
      assert.equal(
        allocationEntries.filter((entry) => entry.direction === MoneyDirection.CREDIT)
          .reduce((sum, entry) => sum + entry.amount, 0),
        1_050,
      );
      assert.deepEqual(
        [
          wallet.availableBalance,
          wallet.reservedBalance,
          wallet.lockedBalance,
          wallet.currentBalance,
        ],
        [
          beforeWallet.availableBalance,
          beforeWallet.reservedBalance,
          beforeWallet.lockedBalance,
          beforeWallet.currentBalance,
        ],
      );
      assert.equal(await WalletProjectionOperation.countDocuments(), beforeProjectionCount);
      assert.equal(await Wallet.countDocuments({
        userId: captured.fixture.actors.creatorId,
      }), 0);
      assert.equal(await InternalPaymentModel.countDocuments({
        paymentId: payment._id,
      }), 0);
      assert.equal(await InternalTopUpFunding.countDocuments(), beforeTopUpCount);
      assert.equal(await Settlement.countDocuments({ bookingId: booking._id }), 0);
      assert.equal(await Payout.countDocuments(), 0);
      assert.equal(await Withdrawal.countDocuments(), 0);
      assert.equal(await Refund.countDocuments({ paymentId: payment._id }), 0);
      const audit = await AuditLog.findOne({
        action: AuditAction.BOOKING_ESCROW_ALLOCATED,
        entityId: allocation._id,
      }).orFail();
      assert.equal(audit.actorType, "SYSTEM");
      assert.equal(audit.financialContext?.domain, "ESCROW");
      assert.equal(audit.metadata?.commissionAmount, 200);
      assert.equal(audit.metadata?.creatorAmount, 800);
      assert.equal(audit.metadata?.platformFeeAmount, 50);
      assert.equal(audit.metadata?.totalAmount, 1_050);
    } finally {
      await server.close();
    }
  });
};
