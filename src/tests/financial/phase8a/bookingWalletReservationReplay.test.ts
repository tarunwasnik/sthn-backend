import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";

import { Booking } from "../../../models/booking.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { bookingWalletReservationService } from "../../../services/financial/bookingWalletReservation.service";
import {
  createBookingWalletFixture,
  postWalletBooking,
  startBookingHttpServer,
} from "./fixtures/bookingWalletFixtures";

export const registerBookingWalletReservationReplayTests = () => {
  test("phase8a replay: sequential, reloaded, and concurrent API submissions converge", async () => {
    const fixture = await createBookingWalletFixture({ walletAmount: 1_000, slotAmounts: [350] });
    const server = await startBookingHttpServer();
    try {
      const first = await postWalletBooking(server.baseUrl, fixture, "phase8a-replay");
      const second = await postWalletBooking(server.baseUrl, fixture, "phase8a-replay");
      const concurrent = await Promise.all([
        postWalletBooking(server.baseUrl, fixture, "phase8a-replay"),
        postWalletBooking(server.baseUrl, fixture, "phase8a-replay"),
      ]);
      assert.equal(first.status, 201, JSON.stringify(first.body));
      assert.equal(second.status, 200, JSON.stringify(second.body));
      assert.ok(concurrent.every((result) => result.status === 200));
      assert.ok([
        second,
        ...concurrent,
      ].every((result) =>
        result.body.reservation.reservationReference ===
        first.body.reservation.reservationReference));

      const [bookings, payments, reservations, ledgers, projections, wallet] =
        await Promise.all([
          Booking.find({ userId: fixture.actors.userId }),
          Payment.find({ userId: fixture.actors.userId }),
          BookingFundReservation.find({ userId: fixture.actors.userId }),
          LedgerEntry.find({ source: LedgerSource.BOOKING_WALLET_AUTHORIZATION }),
          WalletProjectionOperation.find({ "deltas.reservedBalance": fixture.totalAmount }),
          Wallet.findById(fixture.actors.wallet._id),
        ]);
      assert.equal(bookings.length, 1);
      assert.equal(payments.length, 1);
      assert.equal(reservations.length, 1);
      assert.equal(ledgers.length, 2);
      assert.equal(projections.length, 1);
      assert.equal(wallet?.availableBalance, 1_000 - fixture.totalAmount);
      assert.equal(wallet?.reservedBalance, fixture.totalAmount);
      assert.equal(
        reservations[0].authorizedAt?.getTime(),
        new Date(first.body.reservation.authorizedAt).getTime(),
      );

      const session = await mongoose.startSession();
      try {
        session.startTransaction();
        const reloadedBooking = await Booking.findById(bookings[0]._id).session(session).orFail();
        const reloadedPayment = await Payment.findById(payments[0]._id).session(session).orFail();
        const serviceReplay = await bookingWalletReservationService.authorize({
          booking: reloadedBooking,
          payment: reloadedPayment,
          authenticatedUserId: fixture.actors.userId,
          currency: "INR",
          session,
        });
        await session.commitTransaction();
        assert.equal(
          serviceReplay.reservation.reservationReference,
          first.body.reservation.reservationReference,
        );
      } finally {
        if (session.inTransaction()) await session.abortTransaction();
        await session.endSession();
      }
      assert.equal(await LedgerEntry.countDocuments({
        source: LedgerSource.BOOKING_WALLET_AUTHORIZATION,
      }), 2);
      assert.equal(await WalletProjectionOperation.countDocuments({
        "deltas.reservedBalance": fixture.totalAmount,
      }), 1);
    } finally {
      await server.close();
    }
  });

  test("phase8a replay: concurrent first submissions create one complete booking graph", async () => {
    const fixture = await createBookingWalletFixture({ walletAmount: 1_000, slotAmounts: [300] });
    const server = await startBookingHttpServer();
    try {
      const results = await Promise.all([
        postWalletBooking(server.baseUrl, fixture, "phase8a-first-race"),
        postWalletBooking(server.baseUrl, fixture, "phase8a-first-race"),
      ]);
      assert.equal(results.filter((result) => result.status === 201).length, 1, JSON.stringify(results));
      assert.equal(results.filter((result) => result.status === 200).length, 1, JSON.stringify(results));
      assert.equal(await Booking.countDocuments({ userId: fixture.actors.userId }), 1);
      assert.equal(await Payment.countDocuments({ userId: fixture.actors.userId }), 1);
      assert.equal(await BookingFundReservation.countDocuments({ userId: fixture.actors.userId }), 1);
      assert.equal(await LedgerEntry.countDocuments({
        source: LedgerSource.BOOKING_WALLET_AUTHORIZATION,
      }), 2);
      assert.equal(await WalletProjectionOperation.countDocuments({
        "deltas.reservedBalance": fixture.totalAmount,
      }), 1);
      const wallet = await Wallet.findById(fixture.actors.wallet._id).orFail();
      assert.equal(wallet.availableBalance, 685);
      assert.equal(wallet.reservedBalance, 315);
    } finally {
      await server.close();
    }
  });

  test("phase8a replay: reused request key with different immutable intent fails closed", async () => {
    const fixture = await createBookingWalletFixture({ walletAmount: 1_000, slotAmounts: [200, 200] });
    const firstRequest = { ...fixture, slotIds: [fixture.slotIds[0]], amount: 200 };
    const conflictingRequest = { ...fixture, slotIds: [fixture.slotIds[1]], amount: 200 };
    const server = await startBookingHttpServer();
    try {
      const first = await postWalletBooking(server.baseUrl, firstRequest, "phase8a-key-conflict");
      const conflict = await postWalletBooking(server.baseUrl, conflictingRequest, "phase8a-key-conflict");
      assert.equal(first.status, 201);
      assert.equal(conflict.status, 409);
      assert.equal(
        conflict.body.code,
        "BOOKING_WALLET_RESERVATION_IDENTITY_CONFLICT",
      );
      assert.equal(await Booking.countDocuments({ userId: fixture.actors.userId }), 1);
      assert.equal(await BookingFundReservation.countDocuments({ userId: fixture.actors.userId }), 1);
    } finally {
      await server.close();
    }
  });
};
