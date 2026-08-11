import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";

import { Booking } from "../../../models/booking.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { BookingFundReservationStatus } from "../../../enums/financial/bookingFundReservationStatus.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import {
  createBookingWalletFixture,
  postWalletBooking,
} from "../phase8a/fixtures/bookingWalletFixtures";
import { postCreatorDecision } from "../phase8b/fixtures/bookingWalletReleaseFixtures";
import {
  createAcceptedWalletBooking,
  enableBookingCompletion,
  postCreatorCompletion,
  startCaptureHttpServer,
} from "./fixtures/bookingWalletCaptureFixtures";

const accept = async (baseUrl: string, booking: InstanceType<typeof Booking>, token: string) => {
  const response = await postCreatorDecision(baseUrl, booking._id.toString(), token, "ACCEPT");
  assert.equal(response.status, 200, JSON.stringify(response.body));
  await Booking.updateOne(
    { _id: booking._id },
    { $set: { hasInteracted: true, interactionStartedAt: new Date(Date.now() - 60_000) } },
  );
};

export const registerBookingWalletCaptureConcurrencyTests = () => {
  test("phase8c ten-way Creator completion converges on one capture", async () => {
    const server = await startCaptureHttpServer();
    try {
      const { booking, creatorToken, fixture } = await createAcceptedWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      const results = await Promise.all(Array.from({ length: 10 }, () =>
        postCreatorCompletion(server.baseUrl, booking._id.toString(), creatorToken)));
      assert.ok(results.every((result) => result.status === 200), JSON.stringify(results));
      assert.equal(results.filter((result) => result.body.replay === false).length, 1);
      assert.equal(await LedgerEntry.countDocuments({
        bookingId: booking._id,
        source: LedgerSource.BOOKING_WALLET_CAPTURE,
      }), 2);
      assert.equal(await BookingFundReservation.countDocuments({
        bookingId: booking._id,
        status: BookingFundReservationStatus.CAPTURED,
      }), 1);
      const wallet = await Wallet.findById(fixture.actors.wallet._id).orFail();
      assert.deepEqual([wallet.availableBalance, wallet.reservedBalance, wallet.currentBalance], [580, 0, 580]);
    } finally {
      await server.close();
    }
  });

  test("phase8c distinct same-Wallet captures use additive atomic projections", async () => {
    const server = await startCaptureHttpServer();
    try {
      const fixture = await createBookingWalletFixture({
        walletAmount: 1_000,
        slotAmounts: [300, 500],
      });
      const firstResponse = await postWalletBooking(server.baseUrl, fixture, "phase8c-same-wallet-a", {
        slotIds: [fixture.slotIds[0].toString()],
      });
      const secondResponse = await postWalletBooking(server.baseUrl, fixture, "phase8c-same-wallet-b", {
        slotIds: [fixture.slotIds[1].toString()],
      });
      assert.equal(firstResponse.status, 201, JSON.stringify(firstResponse.body));
      assert.equal(secondResponse.status, 201, JSON.stringify(secondResponse.body));
      const bookings = await Booking.find({
        bookingReference: {
          $in: [firstResponse.body.booking.bookingReference, secondResponse.body.booking.bookingReference],
        },
      });
      const token = jwt.sign(
        { id: fixture.actors.creatorId.toString(), role: "creator" },
        process.env.JWT_SECRET!,
      );
      await enableBookingCompletion(fixture.actors.adminId.toString());
      for (const booking of bookings) await accept(server.baseUrl, booking, token);
      const results = await Promise.all(bookings.map((booking) =>
        postCreatorCompletion(server.baseUrl, booking._id.toString(), token)));
      assert.ok(results.every((result) => result.status === 200), JSON.stringify(results));
      const wallet = await Wallet.findById(fixture.actors.wallet._id).orFail();
      assert.deepEqual([wallet.availableBalance, wallet.reservedBalance, wallet.currentBalance], [160, 0, 160]);
      assert.equal(await LedgerEntry.countDocuments({
        bookingId: { $in: bookings.map((booking) => booking._id) },
        source: LedgerSource.BOOKING_WALLET_CAPTURE,
      }), 4);
    } finally {
      await server.close();
    }
  });

  test("phase8c reservation creation versus capture on one Wallet preserves exact balances", async () => {
    const server = await startCaptureHttpServer();
    try {
      const fixture = await createBookingWalletFixture({
        walletAmount: 1_000,
        slotAmounts: [400, 300],
      });
      const firstResponse = await postWalletBooking(server.baseUrl, fixture, "phase8c-create-capture-a", {
        slotIds: [fixture.slotIds[0].toString()],
      });
      assert.equal(firstResponse.status, 201, JSON.stringify(firstResponse.body));
      const booking = await Booking.findOne({
        bookingReference: firstResponse.body.booking.bookingReference,
      }).orFail();
      const token = jwt.sign(
        { id: fixture.actors.creatorId.toString(), role: "creator" },
        process.env.JWT_SECRET!,
      );
      await enableBookingCompletion(fixture.actors.adminId.toString());
      await accept(server.baseUrl, booking, token);
      const [completion, creation] = await Promise.all([
        postCreatorCompletion(server.baseUrl, booking._id.toString(), token),
        postWalletBooking(server.baseUrl, fixture, "phase8c-create-capture-b", {
          slotIds: [fixture.slotIds[1].toString()],
        }),
      ]);
      assert.equal(completion.status, 200, JSON.stringify(completion.body));
      assert.equal(creation.status, 201, JSON.stringify(creation.body));
      const wallet = await Wallet.findById(fixture.actors.wallet._id).orFail();
      assert.deepEqual([wallet.availableBalance, wallet.reservedBalance, wallet.currentBalance], [265, 315, 580]);
    } finally {
      await server.close();
    }
  });
};
