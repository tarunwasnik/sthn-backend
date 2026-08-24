import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";

import { Booking } from "../../../models/booking.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import { Payment } from "../../../models/payment.model";
import { Slot } from "../../../models/slot.model";
import { Wallet } from "../../../models/wallet.model";
import { BookingWalletReleaseCause } from "../../../enums/financial/bookingWalletReleaseCause.enum";
import { PaymentStatus } from "../../../enums/financial/paymentStatus.enum";
import {
  createActiveWalletBooking,
  postAdminCancellation,
  postCreatorCancellation,
  postCreatorDecision,
  postUserCancellation,
  startReleaseHttpServer,
} from "./fixtures/bookingWalletReleaseFixtures";

const assertCancelledRelease = async (
  bookingId: string,
  walletId: unknown,
  cause: BookingWalletReleaseCause,
) => {
  const booking = await Booking.findById(bookingId).orFail();
  const payment = await Payment.findById(booking.paymentId).orFail();
  const reservation = await BookingFundReservation.findOne({ bookingId }).orFail();
  const wallet = await Wallet.findById(walletId).orFail();
  const slots = await Slot.find({ _id: { $in: booking.slotIds } });
  assert.equal(booking.status, "CANCELLED");
  assert.equal(payment.status, PaymentStatus.CANCELLED);
  assert.equal(reservation.releaseCause, cause);
  assert.ok(reservation.releasedAt);
  assert.ok(slots.every((slot) => slot.status === "AVAILABLE"));
  assert.equal(wallet.availableBalance, 1_000);
  assert.equal(wallet.reservedBalance, 0);
};

export const registerBookingWalletReleaseCancellationTests = () => {
  test("phase8b User cancellation preserves interaction history while releasing an eligible Wallet booking", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { fixture, booking } = await createActiveWalletBooking(server.baseUrl, { walletAmount: 1_000, slotAmounts: [400] });
      await Booking.updateOne({ _id: booking._id }, { $set: { hasInteracted: true } });
      const response = await postUserCancellation(server.baseUrl, booking._id.toString(), fixture);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      await assertCancelledRelease(booking._id.toString(), fixture.actors.wallet._id, BookingWalletReleaseCause.USER_CANCELLED);
      assert.equal((await Booking.findById(booking._id).orFail()).hasInteracted, true);
    } finally { await server.close(); }
  });

  test("phase8b Creator-as-Customer can cancel an eligible booking without an optional request body", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { fixture, booking } = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      const creatorAsCustomerToken = jwt.sign(
        { id: fixture.actors.userId.toString(), role: "creator" },
        process.env.JWT_SECRET!,
      );
      const response = await fetch(
        `${server.baseUrl}/api/v1/bookings/${booking._id.toString()}/cancel`,
        { method: "POST", headers: { authorization: `Bearer ${creatorAsCustomerToken}` } },
      );
      assert.equal(response.status, 200, await response.text());
      await assertCancelledRelease(
        booking._id.toString(),
        fixture.actors.wallet._id,
        BookingWalletReleaseCause.USER_CANCELLED,
      );
    } finally {
      await server.close();
    }
  });

  test("phase8b Creator-as-Customer cancellation preserves interaction history", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { fixture, booking } = await createActiveWalletBooking(server.baseUrl, { walletAmount: 1_000, slotAmounts: [400] });
      await Booking.updateOne({ _id: booking._id }, { $set: { hasInteracted: true } });
      const creatorAsCustomerToken = jwt.sign({ id: fixture.actors.userId.toString(), role: "creator" }, process.env.JWT_SECRET!);
      const response = await fetch(`${server.baseUrl}/api/v1/bookings/${booking._id.toString()}/cancel`, { method: "POST", headers: { authorization: `Bearer ${creatorAsCustomerToken}` } });
      assert.equal(response.status, 200, await response.text());
      await assertCancelledRelease(booking._id.toString(), fixture.actors.wallet._id, BookingWalletReleaseCause.USER_CANCELLED);
      assert.equal((await Booking.findById(booking._id).orFail()).hasInteracted, true);
    } finally { await server.close(); }
  });

  test("phase8b User cancellation releases a REQUESTED Wallet booking using authenticated identity", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { fixture, booking } = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      const response = await postUserCancellation(
        server.baseUrl,
        booking._id.toString(),
        fixture,
      );
      assert.equal(response.status, 200, JSON.stringify(response.body));
      await assertCancelledRelease(
        booking._id.toString(),
        fixture.actors.wallet._id,
        BookingWalletReleaseCause.USER_CANCELLED,
      );
      const cancelled = await Booking.findById(booking._id).orFail();
      assert.ok(cancelled.terminatedById?.equals(fixture.actors.userId));
    } finally {
      await server.close();
    }
  });

  test("phase8b Creator cancellation releases an uncaptured CONFIRMED Wallet booking", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { fixture, booking, creatorToken } = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      const accepted = await postCreatorDecision(
        server.baseUrl,
        booking._id.toString(),
        creatorToken,
        "ACCEPT",
      );
      assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
      const response = await postCreatorCancellation(
        server.baseUrl,
        booking._id.toString(),
        creatorToken,
      );
      assert.equal(response.status, 200, JSON.stringify(response.body));
      await assertCancelledRelease(
        booking._id.toString(),
        fixture.actors.wallet._id,
        BookingWalletReleaseCause.CREATOR_CANCELLED,
      );
      const cancelled = await Booking.findById(booking._id).orFail();
      assert.ok(cancelled.terminatedById?.equals(fixture.actors.creatorId));
    } finally {
      await server.close();
    }
  });

  test("phase8b existing Admin cancellation releases an authorized Wallet booking", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { fixture, booking, adminToken } = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      const result = await postAdminCancellation(
        server.baseUrl,
        booking._id.toString(),
        adminToken,
      );
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.financialAction, "RELEASE");
      await assertCancelledRelease(
        booking._id.toString(),
        fixture.actors.wallet._id,
        BookingWalletReleaseCause.ADMIN_CANCELLED,
      );
      const cancelled = await Booking.findById(booking._id).orFail();
      assert.ok(cancelled.terminatedById?.equals(fixture.actors.adminId));
    } finally {
      await server.close();
    }
  });
};
