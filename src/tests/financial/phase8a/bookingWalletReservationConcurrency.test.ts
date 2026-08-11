import assert from "node:assert/strict";
import { test } from "node:test";

import { Booking } from "../../../models/booking.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import { Slot } from "../../../models/slot.model";
import { Wallet } from "../../../models/wallet.model";
import { BookingFundReservationStatus } from "../../../enums/financial/bookingFundReservationStatus.enum";
import {
  createBookingWalletFixture,
  postWalletBooking,
  startBookingHttpServer,
} from "./fixtures/bookingWalletFixtures";

const requestsForTwoSlots = (
  fixture: Awaited<ReturnType<typeof createBookingWalletFixture>>,
) => [
  { ...fixture, slotIds: [fixture.slotIds[0]], amount: 400 },
  { ...fixture, slotIds: [fixture.slotIds[1]], amount: 400 },
];

export const registerBookingWalletReservationConcurrencyTests = () => {
  test("phase8a concurrency: distinct reservations both commit when combined funds suffice", async () => {
    const fixture = await createBookingWalletFixture({ walletAmount: 1_000, slotAmounts: [400, 400] });
    const [one, two] = requestsForTwoSlots(fixture);
    const server = await startBookingHttpServer();
    try {
      const results = await Promise.all([
        postWalletBooking(server.baseUrl, one, "phase8a-sufficient-1"),
        postWalletBooking(server.baseUrl, two, "phase8a-sufficient-2"),
      ]);
      assert.ok(results.every((result) => result.status === 201), JSON.stringify(results));
      const wallet = await Wallet.findById(fixture.actors.wallet._id).orFail();
      assert.equal(wallet.availableBalance, 160);
      assert.equal(wallet.reservedBalance, 840);
      assert.equal(wallet.lockedBalance, 0);
      assert.equal(wallet.currentBalance, 1_000);
      assert.equal(await BookingFundReservation.countDocuments({
        status: BookingFundReservationStatus.ACTIVE,
      }), 2);
    } finally {
      await server.close();
    }
  });

  test("phase8a concurrency: atomic available guard prevents same-Wallet overspend", async () => {
    const fixture = await createBookingWalletFixture({ walletAmount: 600, slotAmounts: [400, 400] });
    const [one, two] = requestsForTwoSlots(fixture);
    const server = await startBookingHttpServer();
    try {
      const results = await Promise.all([
        postWalletBooking(server.baseUrl, one, "phase8a-overspend-1"),
        postWalletBooking(server.baseUrl, two, "phase8a-overspend-2"),
      ]);
      const successes = results.filter((result) => result.status === 201);
      const failures = results.filter((result) => result.status !== 201);
      assert.equal(successes.length, 1, JSON.stringify(results));
      assert.equal(failures.length, 1);
      assert.ok([409, 400].includes(failures[0].status));
      const [wallet, activeReservations, bookings, slots] = await Promise.all([
        Wallet.findById(fixture.actors.wallet._id).orFail(),
        BookingFundReservation.find({ status: BookingFundReservationStatus.ACTIVE }),
        Booking.find({ userId: fixture.actors.userId }),
        Slot.find({ _id: { $in: fixture.slotIds } }),
      ]);
      assert.equal(wallet.availableBalance, 180);
      assert.equal(wallet.reservedBalance, 420);
      assert.equal(wallet.currentBalance, 600);
      assert.ok(wallet.availableBalance >= 0);
      assert.equal(activeReservations.length, 1);
      assert.equal(bookings.length, 1);
      assert.equal(slots.filter((slot) => slot.status === "LOCKED").length, 1);
      assert.equal(slots.filter((slot) => slot.status === "AVAILABLE").length, 1);
    } finally {
      await server.close();
    }
  });
};
