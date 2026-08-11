import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";

import { Booking } from "../../../models/booking.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import { InternalTopUpFunding } from "../../../models/internalTopUpFunding.model";
import InternalPaymentModel from "../../../models/internalProvider/internalPayment.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
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
  startReleaseHttpServer,
} from "./fixtures/bookingWalletReleaseFixtures";

export const registerBookingWalletReleaseRegressionTests = () => {
  test("phase8b Creator ACCEPT keeps Wallet authorization ACTIVE without release effects", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { booking, creatorToken } = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      const response = await postCreatorDecision(
        server.baseUrl,
        booking._id.toString(),
        creatorToken,
        "ACCEPT",
      );
      assert.equal(response.status, 200, JSON.stringify(response.body));
      const [confirmed, payment, reservation] = await Promise.all([
        Booking.findById(booking._id).orFail(),
        Payment.findById(booking.paymentId).orFail(),
        BookingFundReservation.findOne({ bookingId: booking._id }).orFail(),
      ]);
      assert.equal(confirmed.status, "CONFIRMED");
      assert.equal(payment.status, PaymentStatus.AUTHORIZED);
      assert.equal(reservation.status, BookingFundReservationStatus.ACTIVE);
      assert.equal(reservation.releaseReference, undefined);
      assert.equal(await LedgerEntry.countDocuments({
        bookingId: booking._id,
        source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
      }), 0);
      assert.equal(await WalletProjectionOperation.countDocuments({
        "deltas.reservedBalance": -420,
      }), 0);
    } finally {
      await server.close();
    }
  });

  test("phase8b INTERNAL-provider rejection remains outside Wallet reservation release", async () => {
    const server = await startReleaseHttpServer();
    try {
      const fixture = await createBookingWalletFixture({
        walletAmount: 0,
        slotAmounts: [200],
      });
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
      const booking = await Booking.findOne({ bookingReference: body.booking.bookingReference })
        .orFail();
      const payment = await Payment.findById(booking.paymentId).orFail();
      assert.equal(payment.method, PaymentMethod.INTERNAL);
      assert.equal(await InternalPaymentModel.countDocuments({ paymentId: payment._id }), 1);

      const creatorToken = jwt.sign(
        { id: fixture.actors.creatorId.toString(), role: "creator" },
        process.env.JWT_SECRET!,
      );
      const rejected = await postCreatorDecision(
        server.baseUrl,
        booking._id.toString(),
        creatorToken,
        "REJECT",
      );
      assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
      assert.equal((await Booking.findById(booking._id).orFail()).status, "REJECTED");
      assert.equal(await BookingFundReservation.countDocuments({ bookingId: booking._id }), 0);
      assert.equal(await LedgerEntry.countDocuments({
        bookingId: booking._id,
        source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
      }), 0);
    } finally {
      await server.close();
    }
  });

  test("phase8b booking release records cannot operate on top-up funding records", async () => {
    const actors = await createActors();
    const { request } = await createFundedTopUp(actors, 300);
    assert.equal(await InternalTopUpFunding.countDocuments({
      topUpRequestId: request._id,
    }), 1);
    assert.equal(await BookingFundReservation.countDocuments(), 0);
    assert.equal(await LedgerEntry.countDocuments({
      source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
    }), 0);
  });

  test("phase8b release authority indexes exist as partial unique MongoDB indexes", async () => {
    const indexes = await BookingFundReservation.collection.indexes();
    for (const field of [
      "releaseReference",
      "releaseKey",
      "releaseTransactionId",
      "releaseProjectionOperationReference",
    ]) {
      const index = indexes.find((candidate) => candidate.key[field] === 1);
      assert.ok(index, `${field} index is missing`);
      assert.equal(index.unique, true);
      assert.ok(index.partialFilterExpression);
    }
  });
};
