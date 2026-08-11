import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";

import { Booking } from "../../../models/booking.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import {
  createBookingWalletFixture,
  postWalletBooking,
  startBookingHttpServer,
} from "./fixtures/bookingWalletFixtures";
import { createActors } from "../phase7h/fixtures/topUpFixtures";

export const registerBookingFundingReadTests = () => {
  test("phase7a pricing preview is read-only and reports authoritative Wallet readiness", async () => {
    const fixture = await createBookingWalletFixture({ walletAmount: 1_000 });
    const server = await startBookingHttpServer();
    try {
      const before = await Promise.all([
        Booking.countDocuments(), Payment.countDocuments(), BookingFundReservation.countDocuments(),
        LedgerEntry.countDocuments(), WalletProjectionOperation.countDocuments(),
      ]);
      const response = await fetch(`${server.baseUrl}/api/v1/bookings/pricing-preview`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${fixture.token}` },
        body: JSON.stringify({ serviceId: fixture.serviceId.toString(), slotIds: fixture.slotIds.map(String) }),
      });
      const body = await response.json() as { preview: Record<string, unknown> };
      assert.equal(response.status, 200);
      assert.equal(body.preview.serviceAmount, fixture.serviceAmount);
      assert.equal(body.preview.customerFeeAmount, fixture.platformFeeAmount);
      assert.equal(body.preview.grossFundingAmount, fixture.totalAmount);
      assert.equal((body.preview.walletFunding as { sufficient: boolean }).sufficient, true);
      assert.deepEqual(await Promise.all([
        Booking.countDocuments(), Payment.countDocuments(), BookingFundReservation.countDocuments(),
        LedgerEntry.countDocuments(), WalletProjectionOperation.countDocuments(),
      ]), before);
    } finally { await server.close(); }
  });

  test("phase7a funding read is participant-only and exposes no financial identifiers", async () => {
    const fixture = await createBookingWalletFixture();
    const server = await startBookingHttpServer();
    try {
      const created = await postWalletBooking(server.baseUrl, fixture, "phase7a-funding-read");
      assert.equal(created.status, 201);
      const booking = await Booking.findOne({ bookingReference: created.body.booking.bookingReference }).orFail();
      const response = await fetch(`${server.baseUrl}/api/v1/bookings/${booking._id}/funding`, {
        headers: { authorization: `Bearer ${fixture.token}` },
      });
      const body = await response.json() as { funding: Record<string, unknown> };
      assert.equal(response.status, 200);
      assert.equal((body.funding.walletFunding as { state: string }).state, "ACTIVE");
      assert.equal(JSON.stringify(body).includes("walletId"), false);
      assert.equal(JSON.stringify(body).includes("reservationId"), false);
      const creatorToken = jwt.sign({ id: fixture.actors.creatorId.toString(), role: "user" }, process.env.JWT_SECRET!);
      const creatorRead = await fetch(`${server.baseUrl}/api/v1/bookings/${booking._id}/funding`, {
        headers: { authorization: `Bearer ${creatorToken}` },
      });
      assert.equal(creatorRead.status, 200);
      const unrelated = await createActors();
      const deniedToken = jwt.sign({ id: unrelated.userId.toString(), role: "user" }, process.env.JWT_SECRET!);
      const denied = await fetch(`${server.baseUrl}/api/v1/bookings/${booking._id}/funding`, {
        headers: { authorization: `Bearer ${deniedToken}` },
      });
      assert.equal(denied.status, 403);
    } finally { await server.close(); }
  });

  test("creator major-unit USD prices preserve their exact money in preview and Wallet reservation", async () => {
    const cases = [
      { price: 1000, serviceAmount: 100_000, feeAmount: 5_000, grossAmount: 105_000 },
      { price: 1100.99, serviceAmount: 110_099, feeAmount: 5_505, grossAmount: 115_604 },
      { price: 12.34, serviceAmount: 1_234, feeAmount: 62, grossAmount: 1_296 },
      { price: 14331, serviceAmount: 1_433_100, feeAmount: 71_655, grossAmount: 1_504_755 },
    ];
    const server = await startBookingHttpServer();
    try {
      for (const [index, expected] of cases.entries()) {
        const fixture = await createBookingWalletFixture({
          walletAmount: 0,
          currency: "USD",
          slotPricesMajor: [expected.price],
        });
        await Wallet.create({
          userId: fixture.actors.userId,
          currency: "USD",
          availableBalance: expected.grossAmount + 1,
          currentBalance: expected.grossAmount + 1,
        });
        const preview = await fetch(`${server.baseUrl}/api/v1/bookings/pricing-preview`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${fixture.token}` },
          body: JSON.stringify({ serviceId: fixture.serviceId.toString(), slotIds: fixture.slotIds.map(String) }),
        });
        const previewBody = await preview.json() as { preview: Record<string, unknown> };
        assert.equal(preview.status, 200, JSON.stringify(previewBody));
        assert.equal(previewBody.preview.serviceAmount, expected.serviceAmount);
        assert.equal(previewBody.preview.customerFeeAmount, expected.feeAmount);
        assert.equal(previewBody.preview.grossFundingAmount, expected.grossAmount);
        assert.equal((previewBody.preview.walletFunding as { sufficient: boolean }).sufficient, true);

        if (index !== 0) continue;
        const created = await postWalletBooking(server.baseUrl, fixture, "creator-price-usd-1000");
        assert.equal(created.status, 201, JSON.stringify(created.body));
        const payment = await Payment.findOne({ paymentReference: created.body.payment.paymentReference }).orFail();
        const reservation = await BookingFundReservation.findOne({
          reservationReference: created.body.reservation.reservationReference,
        }).orFail();
        assert.equal(payment.serviceAmount, expected.serviceAmount);
        assert.equal(payment.amount, expected.grossAmount);
        assert.equal(reservation.amount, expected.grossAmount);
      }
    } finally { await server.close(); }
  });

  test("creator major-unit USD price requires the true Wallet funding amount", async () => {
    const fixture = await createBookingWalletFixture({
      walletAmount: 0,
      currency: "USD",
      slotPricesMajor: [1000],
    });
    await Wallet.create({ userId: fixture.actors.userId, currency: "USD", availableBalance: 50_000, currentBalance: 50_000 });
    const server = await startBookingHttpServer();
    try {
      const preview = await fetch(`${server.baseUrl}/api/v1/bookings/pricing-preview`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${fixture.token}` },
        body: JSON.stringify({ serviceId: fixture.serviceId.toString(), slotIds: fixture.slotIds.map(String) }),
      });
      const previewBody = await preview.json() as { preview: { serviceAmount: number; walletFunding: { sufficient: boolean } } };
      assert.equal(preview.status, 200, JSON.stringify(previewBody));
      assert.equal(previewBody.preview.serviceAmount, 100_000);
      assert.equal(previewBody.preview.walletFunding.sufficient, false);
      const created = await postWalletBooking(server.baseUrl, fixture, "creator-price-usd-insufficient");
      assert.equal(created.status, 409, JSON.stringify(created.body));
      assert.equal(await Payment.countDocuments(), 0);
      assert.equal(await BookingFundReservation.countDocuments(), 0);
    } finally { await server.close(); }
  });
};
