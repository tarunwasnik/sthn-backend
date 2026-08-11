import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditLog } from "../../../models/auditLog.model";
import { Booking } from "../../../models/booking.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import InternalPaymentModel from "../../../models/internalProvider/internalPayment.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { Refund } from "../../../models/refund.model";
import { Settlement } from "../../../models/settlement.model";
import { Slot } from "../../../models/slot.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { BookingFundReservationStatus } from "../../../enums/financial/bookingFundReservationStatus.enum";
import { BookingWalletReleaseCause } from "../../../enums/financial/bookingWalletReleaseCause.enum";
import { LedgerAccount } from "../../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../../enums/financial/moneyDirection.enum";
import { PaymentStatus } from "../../../enums/financial/paymentStatus.enum";
import {
  createActiveWalletBooking,
  postCreatorDecision,
  startReleaseHttpServer,
} from "./fixtures/bookingWalletReleaseFixtures";

export const registerBookingWalletReleaseRejectionTests = () => {
  test("phase8b Creator rejection atomically reverses the uncaptured Wallet reservation", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { fixture, booking, creatorToken } = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      const before = await Wallet.findById(fixture.actors.wallet._id).orFail();
      assert.equal(before.availableBalance, 580);
      assert.equal(before.reservedBalance, 420);

      const response = await postCreatorDecision(
        server.baseUrl,
        booking._id.toString(),
        creatorToken,
        "REJECT",
      );
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(response.body.financialAction, "RELEASE");
      assert.equal("_id" in response.body.booking, false);
      assert.equal("walletId" in response.body.reservation, false);

      const [releasedBooking, payment, reservation, wallet, slots, entries, projections] =
        await Promise.all([
          Booking.findById(booking._id).orFail(),
          Payment.findById(booking.paymentId).orFail(),
          BookingFundReservation.findOne({ bookingId: booking._id })
            .select("+releaseLedgerEntryIds +releaseTransactionId +releaseProjectionOperationId")
            .orFail(),
          Wallet.findById(fixture.actors.wallet._id).orFail(),
          Slot.find({ _id: { $in: booking.slotIds } }),
          LedgerEntry.find({
            bookingId: booking._id,
            source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
          }),
          WalletProjectionOperation.find({
            walletId: fixture.actors.wallet._id,
            "deltas.reservedBalance": -420,
          }),
        ]);
      assert.equal(releasedBooking.status, "REJECTED");
      assert.ok(slots.every((slot) => slot.status === "AVAILABLE"));
      assert.equal(payment.status, PaymentStatus.CANCELLED);
      assert.equal(payment.releaseCause, BookingWalletReleaseCause.CREATOR_REJECTED);
      assert.equal(reservation.status, BookingFundReservationStatus.RELEASED);
      assert.equal(reservation.releaseCause, BookingWalletReleaseCause.CREATOR_REJECTED);
      assert.ok(reservation.releasedAt);
      assert.equal(wallet.availableBalance, 1_000);
      assert.equal(wallet.reservedBalance, 0);
      assert.equal(wallet.lockedBalance, 0);
      assert.equal(wallet.currentBalance, 1_000);
      assert.equal(entries.length, 2);
      assert.equal(new Set(entries.map((entry) => entry.transactionId)).size, 1);
      const reservedDebit = entries.find((entry) =>
        entry.account === LedgerAccount.WALLET_RESERVED);
      const availableCredit = entries.find((entry) =>
        entry.account === LedgerAccount.WALLET_AVAILABLE);
      assert.equal(reservedDebit?.direction, MoneyDirection.DEBIT);
      assert.equal(availableCredit?.direction, MoneyDirection.CREDIT);
      assert.equal(reservedDebit?.type, LedgerEntryType.BOOKING_FUNDS_RELEASED);
      assert.equal(reservedDebit?.amount, 420);
      assert.equal(availableCredit?.amount, 420);
      assert.equal(projections.length, 1);
      assert.equal(projections[0].deltas.availableBalance, 420);
      assert.equal(projections[0].deltas.reservedBalance, -420);
      assert.equal(projections[0].deltas.lockedBalance, 0);
      assert.equal(await InternalPaymentModel.countDocuments({ paymentId: payment._id }), 0);
      assert.equal(await Wallet.countDocuments({ userId: fixture.actors.creatorId }), 0);
      assert.equal(await Settlement.countDocuments({ paymentId: payment._id }), 0);
      assert.equal(await Refund.countDocuments({ paymentId: payment._id }), 0);
      assert.equal(await LedgerEntry.countDocuments({
        paymentId: payment._id,
        type: LedgerEntryType.COMMISSION,
      }), 0);
      const audit = await AuditLog.findOne({
        action: "BOOKING_WALLET_RESERVATION_RELEASED",
        entityId: reservation._id,
      }).orFail();
      assert.equal(audit.actorType, "CREATOR");
      assert.ok(audit.actorId?.equals(fixture.actors.creatorId));
      assert.equal(audit.financialContext?.domain, "BOOKING_WALLET");
    } finally {
      await server.close();
    }
  });
};
