import assert from "node:assert/strict";
import { test } from "node:test";

import { Booking } from "../../../models/booking.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import InternalPaymentModel from "../../../models/internalProvider/internalPayment.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { Settlement } from "../../../models/settlement.model";
import { Slot } from "../../../models/slot.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { BookingFundReservationStatus } from "../../../enums/financial/bookingFundReservationStatus.enum";
import { LedgerAccount } from "../../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../../enums/financial/moneyDirection.enum";
import { PaymentMethod } from "../../../enums/financial/paymentMethod.enum";
import { PaymentStatus } from "../../../enums/financial/paymentStatus.enum";
import {
  createBookingWalletFixture,
  postWalletBooking,
  startBookingHttpServer,
} from "./fixtures/bookingWalletFixtures";

export const registerBookingWalletReservationFullFlowTests = () => {
  test("phase8a full flow: Wallet booking atomically reserves the exact booking snapshot", async () => {
    const fixture = await createBookingWalletFixture({ walletAmount: 1_000, slotAmounts: [400] });
    const before = await Wallet.findById(fixture.actors.wallet._id).orFail();
    const server = await startBookingHttpServer();
    try {
      const response = await postWalletBooking(server.baseUrl, fixture, "phase8a-full-flow");
      assert.equal(response.status, 201, JSON.stringify(response.body));

      const [booking, payment, reservation, wallet, slots, entries, operations] =
        await Promise.all([
          Booking.findOne({ bookingReference: response.body.booking.bookingReference }),
          Payment.findOne({ paymentReference: response.body.payment.paymentReference }),
          BookingFundReservation.findOne({
            reservationReference: response.body.reservation.reservationReference,
          }).select("+walletId +ledgerTransactionId +ledgerEntryIds +projectionOperationId"),
          Wallet.findById(fixture.actors.wallet._id),
          Slot.find({ _id: { $in: fixture.slotIds } }),
          LedgerEntry.find({ source: LedgerSource.BOOKING_WALLET_AUTHORIZATION }),
          WalletProjectionOperation.find({
            operationReference: { $regex: /^WPO-/ },
            "deltas.reservedBalance": fixture.totalAmount,
          }),
        ]);

      assert.ok(booking);
      assert.ok(payment);
      assert.ok(reservation);
      assert.ok(wallet);
      assert.equal(booking.status, "REQUESTED");
      assert.ok(slots.every((slot) => slot.status === "LOCKED"));
      assert.equal(payment.method, PaymentMethod.WALLET);
      assert.equal(payment.status, PaymentStatus.AUTHORIZED);
      assert.equal(payment.amount, fixture.totalAmount);
      assert.equal(payment.serviceAmount, fixture.serviceAmount);
      assert.equal(payment.customerFeeAmount, fixture.platformFeeAmount);
      assert.equal(reservation.status, BookingFundReservationStatus.ACTIVE);
      assert.equal(reservation.amount, fixture.totalAmount);
      assert.equal(entries.length, 2);
      assert.equal(new Set(entries.map((entry) => entry.transactionId)).size, 1);
      assert.ok(entries.every((entry) => entry.userId?.equals(fixture.actors.userId)));
      assert.ok(entries.every((entry) => entry.walletId?.equals(fixture.actors.wallet._id)));
      const available = entries.find((entry) => entry.account === LedgerAccount.WALLET_AVAILABLE);
      const reserved = entries.find((entry) => entry.account === LedgerAccount.WALLET_RESERVED);
      assert.equal(available?.direction, MoneyDirection.DEBIT);
      assert.equal(reserved?.direction, MoneyDirection.CREDIT);
      assert.equal(available?.type, LedgerEntryType.BOOKING_FUNDS_RESERVED);
      assert.equal(available?.amount, fixture.totalAmount);
      assert.equal(reserved?.amount, fixture.totalAmount);
      assert.equal(operations.length, 1);
      assert.equal(operations[0].deltas.availableBalance, -fixture.totalAmount);
      assert.equal(operations[0].deltas.reservedBalance, fixture.totalAmount);
      assert.equal(operations[0].deltas.lockedBalance, 0);
      assert.equal(wallet.availableBalance, before.availableBalance - fixture.totalAmount);
      assert.equal(wallet.reservedBalance, before.reservedBalance + fixture.totalAmount);
      assert.equal(wallet.lockedBalance, before.lockedBalance);
      assert.equal(wallet.currentBalance, before.currentBalance);
      assert.equal(await InternalPaymentModel.countDocuments({ paymentId: payment._id }), 0);
      assert.equal(await Wallet.countDocuments({ userId: fixture.actors.creatorId }), 0);
      assert.equal(await Settlement.countDocuments({ paymentId: payment._id }), 0);
      assert.equal(await LedgerEntry.countDocuments({
        paymentId: payment._id,
        type: LedgerEntryType.COMMISSION,
      }), 0);
      assert.equal("_id" in response.body.booking, false);
      assert.equal("walletId" in response.body.reservation, false);
      assert.equal("ledgerEntryIds" in response.body.reservation, false);
      assert.equal("idempotencyKey" in response.body.payment, false);
    } finally {
      await server.close();
    }
  });
};
