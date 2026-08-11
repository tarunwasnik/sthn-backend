import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditLog } from "../../../models/auditLog.model";
import { Booking } from "../../../models/booking.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import InternalPaymentModel from "../../../models/internalProvider/internalPayment.model";
import { InternalTopUpFunding } from "../../../models/internalTopUpFunding.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { Refund } from "../../../models/refund.model";
import { Settlement } from "../../../models/settlement.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { AuditAction } from "../../../enums/financial/auditAction.enum";
import {
  BookingCompletionActorType,
  BookingWalletCaptureCause,
} from "../../../enums/financial/bookingWalletCaptureCause.enum";
import { BookingFundReservationStatus } from "../../../enums/financial/bookingFundReservationStatus.enum";
import { LedgerAccount } from "../../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../../enums/financial/moneyDirection.enum";
import { PaymentStatus } from "../../../enums/financial/paymentStatus.enum";
import { completeBookingsJob } from "../../../jobs/completeBookings.job";
import {
  createAcceptedWalletBooking,
  makeBookingAutoCompletionEligible,
  postCreatorCompletion,
  startCaptureHttpServer,
} from "./fixtures/bookingWalletCaptureFixtures";

const assertCaptureGraph = async (
  bookingId: string,
  expectedCause: BookingWalletCaptureCause,
  amount = 420,
) => {
  const booking = await Booking.findById(bookingId).orFail();
  const [payment, reservation, wallet, entries, projections] = await Promise.all([
    Payment.findById(booking.paymentId).orFail(),
    BookingFundReservation.findOne({ bookingId }).select(
      "+walletId +captureTransactionId +captureLedgerEntryIds " +
      "+captureProjectionOperationId +captureProjectionOperationReference " +
      "+captureKey +captureFingerprint +capturedById",
    ).orFail(),
    Wallet.findOne({ userId: booking.userId }).orFail(),
    LedgerEntry.find({ bookingId, source: LedgerSource.BOOKING_WALLET_CAPTURE }),
    WalletProjectionOperation.find({ walletId: { $exists: true }, "deltas.reservedBalance": -amount }),
  ]);
  assert.equal(booking.status, "COMPLETED");
  assert.equal(booking.paymentStatus, "PAID");
  assert.equal(booking.isPayable, false);
  assert.equal(booking.isPayoutEligible, false);
  assert.equal(booking.creatorEarningSnapshot, undefined);
  assert.equal(booking.platformCommissionSnapshot, undefined);
  assert.ok(booking.completedAt);
  assert.ok(booking.settlementEligibleAt);
  assert.equal(booking.completionCause, expectedCause);
  assert.equal(payment.status, PaymentStatus.CAPTURED);
  assert.equal(payment.capturedAmount, amount);
  assert.equal(payment.captureCause, expectedCause);
  assert.equal(reservation.status, BookingFundReservationStatus.CAPTURED);
  assert.equal(reservation.captureCause, expectedCause);
  assert.equal(reservation.captureLedgerEntryIds.length, 2);
  assert.equal(entries.length, 2);
  assert.equal(new Set(entries.map((entry) => entry.transactionId)).size, 1);
  const debit = entries.find((entry) => entry.account === LedgerAccount.WALLET_RESERVED);
  const credit = entries.find((entry) => entry.account === LedgerAccount.PLATFORM_ESCROW);
  assert.equal(debit?.direction, MoneyDirection.DEBIT);
  assert.equal(debit?.walletId?.toString(), wallet._id.toString());
  assert.equal(credit?.direction, MoneyDirection.CREDIT);
  assert.equal(credit?.walletId, undefined);
  assert.ok(entries.every((entry) =>
    entry.type === LedgerEntryType.BOOKING_FUNDS_CAPTURED &&
    entry.amount === amount));
  assert.equal(projections.length, 1);
  assert.equal(projections[0].deltas.availableBalance, 0);
  assert.equal(projections[0].deltas.reservedBalance, -amount);
  assert.equal(projections[0].deltas.lockedBalance, 0);
  assert.equal(wallet.availableBalance, 580);
  assert.equal(wallet.reservedBalance, 0);
  assert.equal(wallet.lockedBalance, 0);
  assert.equal(wallet.currentBalance, 580);
  assert.equal(await LedgerEntry.countDocuments({
    bookingId,
    source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
  }), 0);
  assert.equal(await Wallet.countDocuments({ userId: booking.creatorId }), 0);
  assert.equal(await InternalPaymentModel.countDocuments({ paymentId: payment._id }), 0);
  assert.equal(await Settlement.countDocuments({ paymentId: payment._id }), 0);
  assert.equal(await Refund.countDocuments({ paymentId: payment._id }), 0);
  assert.equal(await LedgerEntry.countDocuments({
    bookingId,
    type: LedgerEntryType.COMMISSION,
  }), 0);
  return { booking, payment, reservation, wallet, entries, projection: projections[0] };
};

export const registerBookingWalletCaptureFullFlowTests = () => {
  test("phase8c full flow: Creator completion captures reserved Wallet funds into platform escrow", async () => {
    const server = await startCaptureHttpServer();
    try {
      const { booking, creatorToken, fixture } = await createAcceptedWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      const before = await Wallet.findById(fixture.actors.wallet._id).orFail();
      const topUpFundingCount = await InternalTopUpFunding.countDocuments();
      assert.deepEqual(
        [before.availableBalance, before.reservedBalance, before.lockedBalance, before.currentBalance],
        [580, 420, 0, 1_000],
      );
      const response = await postCreatorCompletion(
        server.baseUrl,
        booking._id.toString(),
        creatorToken,
      );
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(response.body.replay, false);
      assert.equal(response.body.booking.status, "COMPLETED");
      assert.equal(response.body.payment.status, PaymentStatus.CAPTURED);
      assert.equal(response.body.reservation.status, BookingFundReservationStatus.CAPTURED);
      assert.equal("_id" in response.body.booking, false);
      assert.equal("walletId" in response.body.reservation, false);
      assert.equal("captureLedgerEntryIds" in response.body.reservation, false);
      await assertCaptureGraph(
        booking._id.toString(),
        BookingWalletCaptureCause.CREATOR_COMPLETED,
      );
      assert.equal(await InternalTopUpFunding.countDocuments(), topUpFundingCount);
      const audit = await AuditLog.findOne({
        action: AuditAction.BOOKING_WALLET_RESERVATION_CAPTURED,
        "financialContext.bookingReference": booking.bookingReference,
      }).orFail();
      assert.equal(audit.actorType, "CREATOR");
      assert.equal(audit.actorId?.toString(), fixture.actors.creatorId.toString());
      assert.equal(audit.financialContext?.domain, "BOOKING_WALLET");
    } finally {
      await server.close();
    }
  });

  test("phase8c automatic completion captures through the same orchestrator and replays safely", async () => {
    const server = await startCaptureHttpServer();
    try {
      const { booking } = await createAcceptedWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      await makeBookingAutoCompletionEligible(booking._id.toString());
      const first = await completeBookingsJob();
      const second = await completeBookingsJob();
      assert.equal(first.completed, 1);
      assert.equal(second.completed, 0);
      const graph = await assertCaptureGraph(
        booking._id.toString(),
        BookingWalletCaptureCause.AUTO_COMPLETED,
      );
      assert.equal(graph.booking.completedByType, BookingCompletionActorType.SYSTEM);
      assert.equal(graph.reservation.capturedByType, BookingCompletionActorType.SYSTEM);
      assert.equal(await AuditLog.countDocuments({
        action: AuditAction.BOOKING_WALLET_RESERVATION_CAPTURED,
        "financialContext.bookingReference": graph.booking.bookingReference,
      }), 1);
    } finally {
      await server.close();
    }
  });
};
