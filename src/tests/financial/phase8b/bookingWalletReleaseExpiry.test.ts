import assert from "node:assert/strict";
import { test } from "node:test";

import { Booking } from "../../../models/booking.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { Slot } from "../../../models/slot.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { BookingFundReservationStatus } from "../../../enums/financial/bookingFundReservationStatus.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { PaymentStatus } from "../../../enums/financial/paymentStatus.enum";
import { expireBookingsJob } from "../../../jobs/expireBookings.job";
import {
  createActiveWalletBooking,
  startReleaseHttpServer,
} from "./fixtures/bookingWalletReleaseFixtures";

export const registerBookingWalletReleaseExpiryTests = () => {
  test("phase8b expiry job releases once and repeated execution is effect-free", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { fixture, booking } = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      await Booking.updateOne(
        { _id: booking._id },
        { $set: { expiresAt: new Date(Date.now() - 1_000) } },
      );
      await expireBookingsJob();
      const firstReservation = await BookingFundReservation.findOne({
        bookingId: booking._id,
      }).orFail();
      const firstReleasedAt = firstReservation.releasedAt?.getTime();
      await expireBookingsJob();

      const [expired, payment, reservation, wallet, slots] = await Promise.all([
        Booking.findById(booking._id).orFail(),
        Payment.findById(booking.paymentId).orFail(),
        BookingFundReservation.findOne({ bookingId: booking._id }).orFail(),
        Wallet.findById(fixture.actors.wallet._id).orFail(),
        Slot.find({ _id: { $in: booking.slotIds } }),
      ]);
      assert.equal(expired.status, "EXPIRED");
      assert.equal(payment.status, PaymentStatus.EXPIRED);
      assert.equal(reservation.status, BookingFundReservationStatus.RELEASED);
      assert.equal(reservation.releasedAt?.getTime(), firstReleasedAt);
      assert.ok(slots.every((slot) => slot.status === "AVAILABLE"));
      assert.equal(wallet.availableBalance, 1_000);
      assert.equal(wallet.reservedBalance, 0);
      assert.equal(await LedgerEntry.countDocuments({
        bookingId: booking._id,
        source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
      }), 2);
      assert.equal(await WalletProjectionOperation.countDocuments({
        walletId: fixture.actors.wallet._id,
        "deltas.reservedBalance": -420,
      }), 1);
    } finally {
      await server.close();
    }
  });
};
