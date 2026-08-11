import assert from "node:assert/strict";
import { test } from "node:test";

import { Booking } from "../../../models/booking.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { Slot } from "../../../models/slot.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import {
  BookingTerminationActorType,
  BookingTerminationType,
} from "../../../enums/booking/bookingTerminationType.enum";
import { BookingFundReservationStatus } from "../../../enums/financial/bookingFundReservationStatus.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { PaymentStatus } from "../../../enums/financial/paymentStatus.enum";
import { expireBookingsJob } from "../../../jobs/expireBookings.job";
import { bookingFinancialTerminationService } from "../../../services/financial/bookingFinancialTermination.service";
import {
  createBookingWalletFixture,
  postWalletBooking,
} from "../phase8a/fixtures/bookingWalletFixtures";
import {
  createActiveWalletBooking,
  postCreatorDecision,
  postUserCancellation,
  startReleaseHttpServer,
} from "./fixtures/bookingWalletReleaseFixtures";

const assertSingleRelease = async (bookingId: string, amount: number) => {
  const reservation = await BookingFundReservation.findOne({ bookingId })
    .select("+walletId")
    .orFail();
  assert.equal(reservation.status, BookingFundReservationStatus.RELEASED);
  assert.equal(await LedgerEntry.countDocuments({
    bookingId,
    source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
  }), 2);
  assert.equal(await WalletProjectionOperation.countDocuments({
    walletId: reservation.walletId,
    "deltas.reservedBalance": -amount,
  }), 1);
};

const cancelAsUser = (bookingId: string, userId: string) =>
  bookingFinancialTerminationService.terminateBookingFinancially({
    bookingId,
    actorType: BookingTerminationActorType.CUSTOMER,
    actorId: userId,
    terminationType: BookingTerminationType.CUSTOMER_CANCELLED,
  });

export const registerBookingWalletReleaseConcurrencyTests = () => {
  test("phase8b ten-way identical Creator rejection converges on one release", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { booking, creatorToken } = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      const contenders = await Promise.allSettled(Array.from({ length: 10 }, () =>
        postCreatorDecision(server.baseUrl, booking._id.toString(), creatorToken, "REJECT")));
      assert.ok(contenders.some((result) =>
        result.status === "fulfilled" && result.value.status === 200));
      assert.ok(contenders.every((result) =>
        result.status === "rejected" || [200, 409].includes(result.value.status)));
      await assertSingleRelease(booking._id.toString(), 420);
    } finally {
      await server.close();
    }
  });

  test("phase8b ten-way expiry execution converges on one release", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { booking } = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      await Booking.updateOne(
        { _id: booking._id },
        { $set: { expiresAt: new Date(Date.now() - 1_000) } },
      );
      const contenders = await Promise.allSettled(
        Array.from({ length: 10 }, () => expireBookingsJob()),
      );
      assert.ok(contenders.some((result) => result.status === "fulfilled"));
      await assertSingleRelease(booking._id.toString(), 420);
      assert.equal((await Booking.findById(booking._id).orFail()).status, "EXPIRED");
    } finally {
      await server.close();
    }
  });

  test("phase8b ACCEPT versus REJECT leaves one coherent booking and financial state", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { booking, creatorToken } = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      await Promise.allSettled([
        postCreatorDecision(server.baseUrl, booking._id.toString(), creatorToken, "ACCEPT"),
        postCreatorDecision(server.baseUrl, booking._id.toString(), creatorToken, "REJECT"),
      ]);
      const [winner, reservation, payment, slots] = await Promise.all([
        Booking.findById(booking._id).orFail(),
        BookingFundReservation.findOne({ bookingId: booking._id }).orFail(),
        Payment.findById(booking.paymentId).orFail(),
        Slot.find({ _id: { $in: booking.slotIds } }),
      ]);
      if (winner.status === "CONFIRMED") {
        assert.equal(reservation.status, BookingFundReservationStatus.ACTIVE);
        assert.equal(payment.status, PaymentStatus.AUTHORIZED);
        assert.ok(slots.every((slot) => slot.status === "BOOKED"));
      } else {
        assert.equal(winner.status, "REJECTED");
        assert.equal(reservation.status, BookingFundReservationStatus.RELEASED);
        assert.equal(payment.status, PaymentStatus.CANCELLED);
        assert.ok(slots.every((slot) => slot.status === "AVAILABLE"));
      }
    } finally {
      await server.close();
    }
  });

  test("phase8b ACCEPT versus EXPIRE gives financial state matching the winner", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { booking, creatorToken } = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [300] },
      );
      await Booking.updateOne(
        { _id: booking._id },
        { $set: { expiresAt: new Date(Date.now() - 1) } },
      );
      await Promise.allSettled([
        postCreatorDecision(server.baseUrl, booking._id.toString(), creatorToken, "ACCEPT"),
        expireBookingsJob(),
      ]);
      const winner = await Booking.findById(booking._id).orFail();
      const reservation = await BookingFundReservation.findOne({ bookingId: booking._id }).orFail();
      assert.equal(winner.status, "EXPIRED");
      assert.equal(reservation.status, BookingFundReservationStatus.RELEASED);
    } finally {
      await server.close();
    }
  });

  test("phase8b REJECT versus EXPIRE produces exactly one compatible release cause", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { booking, creatorToken } = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [300] },
      );
      await Booking.updateOne(
        { _id: booking._id },
        { $set: { expiresAt: new Date(Date.now() - 1) } },
      );
      await Promise.allSettled([
        postCreatorDecision(server.baseUrl, booking._id.toString(), creatorToken, "REJECT"),
        expireBookingsJob(),
      ]);
      const winner = await Booking.findById(booking._id).orFail();
      const reservation = await BookingFundReservation.findOne({ bookingId: booking._id }).orFail();
      assert.ok(["REJECTED", "EXPIRED"].includes(winner.status));
      assert.equal(
        reservation.releaseCause,
        winner.status === "REJECTED" ? "CREATOR_REJECTED" : "REQUEST_EXPIRED",
      );
      await assertSingleRelease(booking._id.toString(), 315);
    } finally {
      await server.close();
    }
  });

  test("phase8b User cancellation versus Creator decision remains coherent", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { fixture, booking, creatorToken } = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [350] },
      );
      await Promise.allSettled([
        postUserCancellation(server.baseUrl, booking._id.toString(), fixture),
        postCreatorDecision(server.baseUrl, booking._id.toString(), creatorToken, "ACCEPT"),
      ]);
      const winner = await Booking.findById(booking._id).orFail();
      const reservation = await BookingFundReservation.findOne({ bookingId: booking._id }).orFail();
      assert.ok(["CANCELLED", "CONFIRMED"].includes(winner.status));
      assert.equal(
        reservation.status,
        winner.status === "CONFIRMED"
          ? BookingFundReservationStatus.ACTIVE
          : BookingFundReservationStatus.RELEASED,
      );
    } finally {
      await server.close();
    }
  });

  test("phase8b distinct same-Wallet releases use atomic additive projections", async () => {
    const server = await startReleaseHttpServer();
    try {
      const fixture = await createBookingWalletFixture({
        walletAmount: 1_000,
        slotAmounts: [200, 300],
      });
      const first = await postWalletBooking(server.baseUrl, fixture, "phase8b-same-wallet-a", {
        slotIds: [fixture.slotIds[0].toString()],
      });
      const second = await postWalletBooking(server.baseUrl, fixture, "phase8b-same-wallet-b", {
        slotIds: [fixture.slotIds[1].toString()],
      });
      assert.equal(first.status, 201, JSON.stringify(first.body));
      assert.equal(second.status, 201, JSON.stringify(second.body));
      const bookings = await Booking.find({
        bookingReference: {
          $in: [first.body.booking.bookingReference, second.body.booking.bookingReference],
        },
      });
      const results = await Promise.allSettled(bookings.map((entry) =>
        cancelAsUser(entry._id.toString(), fixture.actors.userId.toString())));
      assert.ok(
        results.every((result) => result.status === "fulfilled"),
        results.map((result) => result.status === "fulfilled"
          ? "fulfilled"
          : String(result.reason)).join(" | "),
      );
      const wallet = await Wallet.findById(fixture.actors.wallet._id).orFail();
      assert.equal(wallet.availableBalance, 1_000);
      assert.equal(wallet.reservedBalance, 0);
      assert.equal(wallet.currentBalance, 1_000);
      assert.equal(await BookingFundReservation.countDocuments({
        bookingId: { $in: bookings.map((entry) => entry._id) },
        status: BookingFundReservationStatus.RELEASED,
      }), 2);
    } finally {
      await server.close();
    }
  });

  test("phase8b reservation creation versus release on one Wallet preserves exact balances", async () => {
    const server = await startReleaseHttpServer();
    try {
      const fixture = await createBookingWalletFixture({
        walletAmount: 1_000,
        slotAmounts: [400, 300],
      });
      const first = await postWalletBooking(server.baseUrl, fixture, "phase8b-create-release-a", {
        slotIds: [fixture.slotIds[0].toString()],
      });
      assert.equal(first.status, 201, JSON.stringify(first.body));
      const firstBooking = await Booking.findOne({
        bookingReference: first.body.booking.bookingReference,
      }).orFail();
      const raced = await Promise.allSettled([
        cancelAsUser(firstBooking._id.toString(), fixture.actors.userId.toString()),
        postWalletBooking(server.baseUrl, fixture, "phase8b-create-release-b", {
          slotIds: [fixture.slotIds[1].toString()],
        }),
      ]);
      assert.ok(raced.every((result) => result.status === "fulfilled"));
      const creation = raced[1].status === "fulfilled" ? raced[1].value : null;
      assert.equal(creation?.status, 201, JSON.stringify(creation));
      const wallet = await Wallet.findById(fixture.actors.wallet._id).orFail();
      assert.equal(wallet.availableBalance, 685);
      assert.equal(wallet.reservedBalance, 315);
      assert.equal(wallet.currentBalance, 1_000);
    } finally {
      await server.close();
    }
  });
};
