/// <reference path="../../types/express.d.ts" />
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Booking } from "../../models/booking.model";
import { Slot } from "../../models/slot.model";
import { createBookingWalletFixture, postWalletBooking, startBookingHttpServer } from "./phase8a/fixtures/bookingWalletFixtures";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "purchased-schedule-test-secret";
before(connectPhase7HDatabase, { timeout: 120_000 });
beforeEach(clearPhase7HDatabase);
after(disconnectPhase7HDatabase, { timeout: 30_000 });

test("booking endpoint stores earliest purchased start independently of selection order and slot edits", async () => {
  const fixture = await createBookingWalletFixture({ walletAmount: 1000, slotAmounts: [200, 200] });
  const slots = await Slot.find({ _id: { $in: fixture.slotIds } }).sort({ startTime: 1 });
  const original = slots[0].startTime.getTime();
  const server = await startBookingHttpServer();
  try {
    const response = await postWalletBooking(server.baseUrl, fixture, "schedule-snapshot", { slotIds: fixture.slotIds.map(String).reverse() });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    const booking = await Booking.findOne({ userId: fixture.actors.userId }).select("+purchasedScheduledStart").orFail();
    assert.equal(booking.purchasedScheduledStart?.getTime(), original);
    await Slot.updateOne({ _id: slots[0]._id }, { $set: { startTime: new Date(original + 3600000) } });
    await Booking.updateOne({ _id: booking._id }, { $set: { purchasedScheduledStart: new Date(original + 7200000) } });
    assert.equal((await Booking.findById(booking._id).select("+purchasedScheduledStart").orFail()).purchasedScheduledStart?.getTime(), original);
  } finally { await server.close(); }
});

test("booking failure rolls back the schedule snapshot and slot locks", async () => {
  const fixture = await createBookingWalletFixture({ walletAmount: 0, slotAmounts: [400] });
  const server = await startBookingHttpServer();
  try {
    const response = await postWalletBooking(server.baseUrl, fixture, "schedule-rollback");
    assert.equal(response.status, 409, JSON.stringify(response.body));
    assert.equal(await Booking.countDocuments({ userId: fixture.actors.userId }), 0);
    assert.equal((await Slot.findById(fixture.slotIds[0]).orFail()).status, "AVAILABLE");
  } finally { await server.close(); }
});
