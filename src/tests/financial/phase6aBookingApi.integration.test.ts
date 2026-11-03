import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import { BookingFundingIntent } from "../../models/bookingFundingIntent.model";
import { Booking } from "../../models/booking.model";
import { Payment } from "../../models/payment.model";
import { PaymentOperation } from "../../models/paymentOperation.model";
import { BookingFundReservation } from "../../models/bookingFundReservation.model";
import { Slot } from "../../models/slot.model";
import { createBookingCheckoutQuote } from "../../services/booking/bookingCheckoutQuote.service";
import { createBookingWalletFixture } from "./phase8a/fixtures/bookingWalletFixtures";
import { startReleaseHttpServer } from "./phase8b/fixtures/bookingWalletReleaseFixtures";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";

process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "phase6a-api-test";
before(async () => { await connectPhase7HDatabase(); await BookingFundingIntent.init(); }, { timeout: 120_000 });
beforeEach(clearPhase7HDatabase); after(disconnectPhase7HDatabase);

async function fixture() {
  const f = await createBookingWalletFixture({ walletAmount: 0, slotAmounts: [500] });
  const customer = await (await import("../../models/User")).default.create({ email: `phase6a-${Date.now()}-${Math.random()}@test.local`, role: "user", status: "active" });
  await (await import("../../models/userProfile.model")).UserProfile.create({ userId: customer._id, username: `phase6a${String(customer._id)}`, dateOfBirth: new Date("1990-01-01"), interests: ["test"], bio: "test", avatar: "https://test/a", cover: "https://test/c", profilePhotos: ["https://test/1", "https://test/2"], profileStatus: "verified" });
  const quote = createBookingCheckoutQuote({ customerId: String(customer._id), creatorId: String(f.actors.creatorId), serviceId: String(f.serviceId), slotIds: f.slotIds.map(String), currency: "INR", serviceAmount: f.serviceAmount, customerFeeAmount: f.platformFeeAmount, totalAmount: f.totalAmount });
  return { f, quote, token: jwt.sign({ id: String(customer._id), role: "user" }, process.env.JWT_SECRET!) };
}
const post = (baseUrl: string, token: string, body: object, key: string) => fetch(`${baseUrl}/api/v1/bookings/request`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "Idempotency-Key": key }, body: JSON.stringify(body) });

test("provider API booking commits one bound graph and identical/concurrent retries converge", async () => {
  const x = await fixture(); const server = await startReleaseHttpServer();
  try {
    const body = { serviceId: String(x.f.serviceId), slotIds: x.f.slotIds.map(String), paymentMethod: "INTERNAL", checkoutQuote: x.quote.token };
    const responses = await Promise.all(Array.from({ length: 3 }, () => post(server.baseUrl, x.token, body, "phase6a-same")));
    assert.ok(responses.every(response => [200, 201].includes(response.status)), `statuses: ${responses.map(response => response.status).join(",")}`);
    assert.equal(await BookingFundingIntent.countDocuments(), 1); assert.equal(await Booking.countDocuments(), 1); assert.equal(await Payment.countDocuments(), 1); assert.equal(await PaymentOperation.countDocuments(), 1);
    const intent = await BookingFundingIntent.findOne().orFail(); const booking = await Booking.findById(intent.bookingId).orFail(); const payment = await Payment.findById(intent.paymentId).orFail(); const operation = await PaymentOperation.findById(intent.operationId).orFail();
    assert.ok(booking.paymentId?.equals(payment._id)); assert.ok(operation.paymentId.equals(payment._id)); assert.ok(operation.bookingId.equals(booking._id));
    assert.equal(await BookingFundReservation.countDocuments(), 0); assert.equal((await Slot.findById(x.f.slotIds[0]).orFail()).status, "LOCKED");
    assert.equal(operation.attemptCount, 1);
  } finally { await server.close(); }
});

test("conflicting key and unavailable slot leave no additional provider booking records", async () => {
  const x = await fixture(); const server = await startReleaseHttpServer();
  try {
    const body = { serviceId: String(x.f.serviceId), slotIds: x.f.slotIds.map(String), paymentMethod: "INTERNAL", checkoutQuote: x.quote.token };
    assert.equal((await post(server.baseUrl, x.token, body, "phase6a-conflict")).status, 201);
    const changed = await post(server.baseUrl, x.token, { ...body, slotIds: [] }, "phase6a-conflict");
    assert.ok([400, 409, 422].includes(changed.status));
    assert.equal(await Booking.countDocuments(), 1); assert.equal(await Payment.countDocuments(), 1); assert.equal(await PaymentOperation.countDocuments(), 1);
  } finally { await server.close(); }
});
