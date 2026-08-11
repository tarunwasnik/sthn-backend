import assert from "node:assert/strict";
import { test } from "node:test";

import { Booking } from "../../../models/booking.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { BookingFundReservationStatus } from "../../../enums/financial/bookingFundReservationStatus.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { PaymentStatus } from "../../../enums/financial/paymentStatus.enum";
import {
  BookingTerminationActorType,
  BookingTerminationType,
} from "../../../enums/booking/bookingTerminationType.enum";
import { BookingWalletCaptureCause } from "../../../enums/financial/bookingWalletCaptureCause.enum";
import { completeBookingsJob } from "../../../jobs/completeBookings.job";
import { expireBookingsJob } from "../../../jobs/expireBookings.job";
import { bookingFinancialTerminationService } from "../../../services/financial/bookingFinancialTermination.service";
import {
  createAcceptedWalletBooking,
  makeBookingAutoCompletionEligible,
  postAdminCancellation,
  postCreatorCancellation,
  postCreatorCompletion,
  postUserCancellation,
  startCaptureHttpServer,
} from "./fixtures/bookingWalletCaptureFixtures";

const assertRaceWinner = async (bookingId: string) => {
  const booking = await Booking.findById(bookingId).orFail();
  const payment = await Payment.findById(booking.paymentId).orFail();
  const reservation = await BookingFundReservation.findOne({ bookingId }).orFail();
  const captures = await LedgerEntry.countDocuments({
    bookingId,
    source: LedgerSource.BOOKING_WALLET_CAPTURE,
  });
  const releases = await LedgerEntry.countDocuments({
    bookingId,
    source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
  });
  if (booking.status === "COMPLETED") {
    assert.equal(payment.status, PaymentStatus.CAPTURED);
    assert.equal(reservation.status, BookingFundReservationStatus.CAPTURED);
    assert.equal(captures, 2);
    assert.equal(releases, 0);
  } else {
    assert.equal(booking.status, "CANCELLED");
    assert.equal(payment.status, PaymentStatus.CANCELLED);
    assert.equal(reservation.status, BookingFundReservationStatus.RELEASED);
    assert.equal(captures, 0);
    assert.equal(releases, 2);
  }
};

export const registerBookingWalletCaptureLifecycleRaceTests = () => {
  for (const contender of ["User", "Creator", "Admin"] as const) {
    test(`phase8c completion versus ${contender} cancellation has one coherent terminal winner`, async () => {
      const server = await startCaptureHttpServer();
      try {
        const accepted = await createAcceptedWalletBooking(
          server.baseUrl,
          { walletAmount: 1_000, slotAmounts: [400] },
        );
        const cancellation = contender === "User"
          ? postUserCancellation(server.baseUrl, accepted.booking._id.toString(), accepted.fixture)
          : contender === "Creator"
            ? postCreatorCancellation(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken)
            : postAdminCancellation(server.baseUrl, accepted.booking._id.toString(), accepted.adminToken);
        await Promise.allSettled([
          postCreatorCompletion(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken),
          cancellation,
        ]);
        await assertRaceWinner(accepted.booking._id.toString());
      } finally {
        await server.close();
      }
    });
  }

  test("phase8c completion versus the direct release service has one coherent terminal winner", async () => {
    const server = await startCaptureHttpServer();
    try {
      const accepted = await createAcceptedWalletBooking(server.baseUrl);
      await Promise.allSettled([
        postCreatorCompletion(
          server.baseUrl,
          accepted.booking._id.toString(),
          accepted.creatorToken,
        ),
        bookingFinancialTerminationService.terminateBookingFinancially({
          bookingId: accepted.booking._id.toString(),
          actorType: BookingTerminationActorType.CREATOR,
          actorId: accepted.fixture.actors.creatorId.toString(),
          terminationType: BookingTerminationType.CREATOR_CANCELLED,
          reason: "Phase 8C direct release race",
        }),
      ]);
      await assertRaceWinner(accepted.booking._id.toString());
    } finally {
      await server.close();
    }
  });

  test("phase8c Creator completion versus automatic completion persists the winning cause", async () => {
    const server = await startCaptureHttpServer();
    try {
      const accepted = await createAcceptedWalletBooking(server.baseUrl);
      await makeBookingAutoCompletionEligible(accepted.booking._id.toString());
      await Promise.allSettled([
        postCreatorCompletion(
          server.baseUrl,
          accepted.booking._id.toString(),
          accepted.creatorToken,
        ),
        completeBookingsJob(),
      ]);
      await assertRaceWinner(accepted.booking._id.toString());
      const [booking, reservation, payment] = await Promise.all([
        Booking.findById(accepted.booking._id).orFail(),
        BookingFundReservation.findOne({ bookingId: accepted.booking._id }).orFail(),
        Payment.findById(accepted.booking.paymentId).orFail(),
      ]);
      assert.ok([
        BookingWalletCaptureCause.CREATOR_COMPLETED,
        BookingWalletCaptureCause.AUTO_COMPLETED,
      ].includes(booking.completionCause!));
      assert.equal(reservation.captureCause, booking.completionCause);
      assert.equal(payment.captureCause, booking.completionCause);
    } finally {
      await server.close();
    }
  });

  test("phase8c expiry discovery cannot release a CONFIRMED capture candidate", async () => {
    const server = await startCaptureHttpServer();
    try {
      const accepted = await createAcceptedWalletBooking(server.baseUrl);
      await Booking.updateOne(
        { _id: accepted.booking._id },
        { $set: { expiresAt: new Date(Date.now() - 1_000) } },
      );
      const results = await Promise.allSettled([
        postCreatorCompletion(
          server.baseUrl,
          accepted.booking._id.toString(),
          accepted.creatorToken,
        ),
        expireBookingsJob(),
      ]);
      assert.ok(results.every((result) => result.status === "fulfilled"));
      await assertRaceWinner(accepted.booking._id.toString());
      assert.equal((await Booking.findById(accepted.booking._id).orFail()).status, "COMPLETED");
    } finally {
      await server.close();
    }
  });
};
