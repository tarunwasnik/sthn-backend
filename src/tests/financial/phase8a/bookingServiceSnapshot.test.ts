import assert from "node:assert/strict";
import { test } from "node:test";

import { Booking } from "../../../models/booking.model";
import { CreatorService } from "../../../models/creatorService.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { Wallet } from "../../../models/wallet.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import {
  createBookingWalletFixture,
  postWalletBooking,
  startBookingHttpServer,
} from "./fixtures/bookingWalletFixtures";

export const registerBookingServiceSnapshotTests = () => {
  test("DI-2A persists authoritative immutable CreatorService evidence without changing booking funding", async () => {
    const fixture = await createBookingWalletFixture({ walletAmount: 2_000 });
    const service = await CreatorService.findById(fixture.serviceId).orFail();
    service.title = "Original service title";
    service.description = "Original public service scope";
    service.durationMinutes = 30;
    service.price = 12.34;
    service.currency = "INR";
    service.media = ["https://media.example/original.jpg"];
    await service.save();

    const before = await Promise.all([
      Payment.countDocuments(),
      BookingFundReservation.countDocuments(),
      LedgerEntry.countDocuments(),
    ]);
    const server = await startBookingHttpServer();
    try {
      const created = await postWalletBooking(server.baseUrl, fixture, "di-2a-authoritative", {
        serviceSnapshot: {
          title: "Client supplied title must be ignored",
          description: "Client supplied evidence must be ignored",
          price: 999_999,
          media: ["https://media.example/untrusted.jpg"],
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));

      const booking = await Booking.findOne({
        bookingReference: (created.body.booking as { bookingReference: string }).bookingReference,
      }).orFail();
      const snapshot = booking.serviceSnapshot;
      assert.ok(snapshot);
      assert.equal(String(snapshot.serviceId), String(service._id));
      assert.equal(snapshot.title, "Original service title");
      assert.equal(snapshot.description, "Original public service scope");
      assert.equal(snapshot.durationMinutes, 30);
      assert.equal(snapshot.price, 12.34);
      assert.equal(snapshot.currency, "INR");
      assert.deepEqual(snapshot.media, ["https://media.example/original.jpg"]);
      assert.equal(booking.serviceTitle, "Original service title");
      assert.equal(booking.currency, "INR");

      service.title = "Edited after booking";
      service.description = "Edited after booking";
      service.durationMinutes = 60;
      service.price = 99.99;
      service.media = ["https://media.example/edited.jpg"];
      await service.save();

      const reread = await Booking.findById(booking._id).orFail();
      assert.equal(reread.serviceSnapshot?.title, snapshot.title);
      assert.equal(reread.serviceSnapshot?.description, snapshot.description);
      assert.equal(reread.serviceSnapshot?.durationMinutes, snapshot.durationMinutes);
      assert.equal(reread.serviceSnapshot?.price, snapshot.price);
      assert.equal(reread.serviceSnapshot?.currency, snapshot.currency);
      assert.deepEqual(reread.serviceSnapshot?.media, snapshot.media);
      assert.equal(await Payment.countDocuments(), before[0] + 1);
      assert.equal(await BookingFundReservation.countDocuments(), before[1] + 1);
      assert.ok(await LedgerEntry.countDocuments() > before[2]);
      const wallet = await Wallet.findOne({ userId: fixture.actors.userId, currency: "INR" }).orFail();
      assert.equal(wallet.reservedBalance, fixture.totalAmount);
    } finally {
      await server.close();
    }
  });

  test("DI-2A leaves legacy bookings without a fabricated service snapshot", async () => {
    const fixture = await createBookingWalletFixture({ walletAmount: 2_000 });
    const created = await Booking.create({
      slotIds: fixture.slotIds,
      userId: fixture.actors.userId,
      creatorId: fixture.actors.creatorId,
      serviceId: fixture.serviceId,
      serviceTitle: "Legacy copied title",
      durationMinutes: 30,
      price: fixture.amount,
      serviceAmount: fixture.serviceAmount,
      platformFeeAmount: fixture.platformFeeAmount,
      commissionAmount: fixture.commissionAmount,
      creatorAmount: fixture.creatorAmount,
      totalAmount: fixture.totalAmount,
      currency: "INR",
      status: "REQUESTED",
      paymentStatus: "PENDING",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const legacy = await Booking.findById(created._id).orFail();
    assert.equal(legacy.serviceSnapshot, undefined);
    assert.equal(legacy.serviceTitle, "Legacy copied title");
  });
};
