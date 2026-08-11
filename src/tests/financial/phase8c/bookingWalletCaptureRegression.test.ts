import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";

import { Booking } from "../../../models/booking.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import { InternalTopUpFunding } from "../../../models/internalTopUpFunding.model";
import InternalPaymentModel from "../../../models/internalProvider/internalPayment.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { Settlement } from "../../../models/settlement.model";
import { Wallet } from "../../../models/wallet.model";
import { BookingFundReservationStatus } from "../../../enums/financial/bookingFundReservationStatus.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { PaymentMethod } from "../../../enums/financial/paymentMethod.enum";
import { PaymentStatus } from "../../../enums/financial/paymentStatus.enum";
import {
  createBookingWalletFixture,
} from "../phase8a/fixtures/bookingWalletFixtures";
import {
  createActors,
  createFundedTopUp,
} from "../phase7h/fixtures/topUpFixtures";
import {
  createActiveWalletBooking,
  postCreatorDecision,
} from "../phase8b/fixtures/bookingWalletReleaseFixtures";
import {
  enableBookingCompletion,
  postCreatorCompletion,
  postUserCancellation,
  startCaptureHttpServer,
} from "./fixtures/bookingWalletCaptureFixtures";

export const registerBookingWalletCaptureRegressionTests = () => {
  test("phase8c INTERNAL-provider completion remains on Payment lifecycle without Wallet capture", async () => {
    const server = await startCaptureHttpServer();
    try {
      const fixture = await createBookingWalletFixture({ walletAmount: 0, slotAmounts: [200] });
      const response = await fetch(`${server.baseUrl}/api/v1/bookings/request`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${fixture.token}`,
        },
        body: JSON.stringify({
          serviceId: fixture.serviceId.toString(),
          slotIds: fixture.slotIds.map(String),
          paymentMethod: PaymentMethod.INTERNAL,
        }),
      });
      const body = await response.json() as Record<string, any>;
      assert.equal(response.status, 201, JSON.stringify(body));
      const booking = await Booking.findOne({
        bookingReference: body.booking.bookingReference,
      }).orFail();
      const payment = await Payment.findById(booking.paymentId).orFail();
      assert.equal(payment.method, PaymentMethod.INTERNAL);
      assert.equal(payment.status, PaymentStatus.CAPTURED);
      assert.equal(await InternalPaymentModel.countDocuments({ paymentId: payment._id }), 1);
      const creatorToken = jwt.sign(
        { id: fixture.actors.creatorId.toString(), role: "creator" },
        process.env.JWT_SECRET!,
      );
      const accepted = await postCreatorDecision(
        server.baseUrl,
        booking._id.toString(),
        creatorToken,
        "ACCEPT",
      );
      assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
      await enableBookingCompletion(fixture.actors.adminId.toString());
      const completed = await postCreatorCompletion(
        server.baseUrl,
        booking._id.toString(),
        creatorToken,
      );
      assert.equal(completed.status, 200, JSON.stringify(completed.body));
      assert.equal((await Booking.findById(booking._id).orFail()).status, "COMPLETED");
      assert.equal(await BookingFundReservation.countDocuments({ bookingId: booking._id }), 0);
      assert.equal(await LedgerEntry.countDocuments({
        bookingId: booking._id,
        source: LedgerSource.BOOKING_WALLET_CAPTURE,
      }), 0);
      assert.equal(await Wallet.countDocuments({ userId: fixture.actors.creatorId }), 0);
      assert.equal(await Settlement.countDocuments({ paymentId: payment._id }), 0);
    } finally {
      await server.close();
    }
  });

  test("phase8c cancellation still releases ACTIVE Wallet funds and never captures them", async () => {
    const server = await startCaptureHttpServer();
    try {
      const active = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      const response = await postUserCancellation(
        server.baseUrl,
        active.booking._id.toString(),
        active.fixture,
      );
      assert.equal(response.status, 200, JSON.stringify(response.body));
      const reservation = await BookingFundReservation.findOne({
        bookingId: active.booking._id,
      }).orFail();
      assert.equal(reservation.status, BookingFundReservationStatus.RELEASED);
      assert.equal(await LedgerEntry.countDocuments({
        bookingId: active.booking._id,
        source: LedgerSource.BOOKING_WALLET_CAPTURE,
      }), 0);
      assert.equal(await LedgerEntry.countDocuments({
        bookingId: active.booking._id,
        source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
      }), 2);
    } finally {
      await server.close();
    }
  });

  test("phase8c booking capture cannot operate on Wallet top-up funding records", async () => {
    const actors = await createActors();
    const { request } = await createFundedTopUp(actors, 300);
    assert.equal(await InternalTopUpFunding.countDocuments({ topUpRequestId: request._id }), 1);
    assert.equal(await BookingFundReservation.countDocuments(), 0);
    assert.equal(await LedgerEntry.countDocuments({ source: LedgerSource.BOOKING_WALLET_CAPTURE }), 0);
  });

  test("phase8c capture authority and completion indexes are present", async () => {
    const reservationIndexes = await BookingFundReservation.collection.indexes();
    for (const field of [
      "captureReference",
      "captureKey",
      "captureTransactionId",
      "captureProjectionOperationReference",
    ]) {
      const index = reservationIndexes.find((candidate) => candidate.key[field] === 1);
      assert.ok(index, `${field} index is missing`);
      assert.equal(index.unique, true);
      assert.ok(index.partialFilterExpression);
    }
    const bookingIndexes = await Booking.collection.indexes();
    const completion = bookingIndexes.find((candidate) =>
      candidate.key.completionOperationKey === 1);
    assert.ok(completion);
    assert.equal(completion.unique, true);
    assert.ok(completion.partialFilterExpression);
  });
};
