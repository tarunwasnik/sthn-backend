import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { BookingFundingIntent } from "../../models/bookingFundingIntent.model";
import { Booking } from "../../models/booking.model";
import { Payment } from "../../models/payment.model";
import { PaymentOperation } from "../../models/paymentOperation.model";
import { BookingFundReservation } from "../../models/bookingFundReservation.model";
import { Slot } from "../../models/slot.model";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { createBookingCheckoutQuote } from "../../services/booking/bookingCheckoutQuote.service";
import { paymentProviderRegistry } from "../../services/financial/paymentProviderRegistry.service";
import { RazorpaySandboxPaymentProvider } from "../../services/financial/providers/razorpaySandbox.provider";
import { createBookingWalletFixture, issueSessionToken } from "./phase8a/fixtures/bookingWalletFixtures";
import { startReleaseHttpServer } from "./phase8b/fixtures/bookingWalletReleaseFixtures";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "razorpay-sandbox-checkout-test";

let orderCalls = 0;

const installSandboxProvider = () => {
  paymentProviderRegistry.register(new RazorpaySandboxPaymentProvider(
    { keyId: "rzp_test_checkout", keySecret: "checkout-secret", webhookSecret: "checkout-webhook" },
    async (request) => {
      assert.equal(request.method, "POST");
      assert.equal(request.path, "/v1/orders");
      orderCalls += 1;
      return {
        status: 200,
        body: { id: "order_checkout_1", amount: request.body?.amount, currency: "INR", status: "created" },
      };
    },
  ));
};

before(async () => { await connectPhase7HDatabase(); await BookingFundingIntent.init(); }, { timeout: 120_000 });
beforeEach(async () => { await clearPhase7HDatabase(); orderCalls = 0; installSandboxProvider(); });
after(async () => { paymentProviderRegistry.unregister(PaymentProvider.RAZORPAY); await disconnectPhase7HDatabase(); });

async function fixture() {
  const bookingFixture = await createBookingWalletFixture({ walletAmount: 0, slotAmounts: [500] });
  const User = (await import("../../models/User")).default;
  const { UserProfile } = await import("../../models/userProfile.model");
  const customer = await User.create({ email: `rz-checkout-${Date.now()}-${Math.random()}@test.local`, role: "user", status: "active" });
  await UserProfile.create({ userId: customer._id, username: `rzcheckout${String(customer._id)}`, dateOfBirth: new Date("1990-01-01"), interests: ["test"], bio: "test", avatar: "https://test/a", cover: "https://test/c", profilePhotos: ["https://test/a", "https://test/b"], profileStatus: "verified" });
  const quote = createBookingCheckoutQuote({ customerId: String(customer._id), creatorId: String(bookingFixture.actors.creatorId), serviceId: String(bookingFixture.serviceId), slotIds: bookingFixture.slotIds.map(String), currency: "INR", serviceAmount: bookingFixture.serviceAmount, customerFeeAmount: bookingFixture.platformFeeAmount, totalAmount: bookingFixture.totalAmount });
  return {
    bookingFixture,
    quote,
    token: await issueSessionToken(customer._id, "user"),
  };
}

const post = (baseUrl: string, token: string, body: object, key: string) => fetch(`${baseUrl}/api/v1/bookings/request`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "Idempotency-Key": key },
  body: JSON.stringify(body),
});

test("USD Razorpay booking is rejected before creating funding or dispatching an order", async () => {
  const x = await fixture();
  await CreatorProfile.updateOne({ userId: x.bookingFixture.actors.creatorId }, { $set: { currency: "USD" } });
  const server = await startReleaseHttpServer();
  try {
    const response = await post(server.baseUrl, x.token, { serviceId: String(x.bookingFixture.serviceId), slotIds: x.bookingFixture.slotIds.map(String), paymentMethod: "CARD", paymentProvider: "RAZORPAY", sandbox: true, checkoutQuote: x.quote.token }, "razorpay-usd-denied");
    const body = await response.json() as { message: string; code: string };
    assert.equal(response.status, 422);
    assert.equal(body.code, "PAYMENT_PROVIDER_UNAVAILABLE");
    assert.match(body.message, /only for INR/);
    assert.equal(orderCalls, 0);
    assert.equal(await Booking.countDocuments(), 0);
    assert.equal(await Payment.countDocuments(), 0);
    assert.equal(await BookingFundingIntent.countDocuments(), 0);
  } finally { await server.close(); }
});

test("internal simulator booking creates and replays a captured payment", async () => {
  const x = await fixture();
  const server = await startReleaseHttpServer();
  const body = { serviceId: String(x.bookingFixture.serviceId), slotIds: x.bookingFixture.slotIds.map(String), paymentMethod: "INTERNAL", checkoutQuote: x.quote.token };
  try {
    const first = await post(server.baseUrl, x.token, body, "internal-simulator-replay");
    const result = await first.json() as { payment?: { status: string }; message?: string };
    assert.equal(first.status, 201, result.message);
    assert.equal(result.payment?.status, "CAPTURED");
    const replay = await post(server.baseUrl, x.token, body, "internal-simulator-replay");
    assert.equal(replay.status, 200);
    assert.equal(await Booking.countDocuments(), 1);
    assert.equal(await Payment.countDocuments(), 1);
    assert.equal(orderCalls, 0);
  } finally { await server.close(); }
});

test("explicit Razorpay sandbox booking admission creates one pending checkout session and replays it without another order", async () => {
  const x = await fixture();
  const server = await startReleaseHttpServer();
  const key = "razorpay-sandbox-checkout-replay";
  const body = { serviceId: String(x.bookingFixture.serviceId), slotIds: x.bookingFixture.slotIds.map(String), paymentMethod: "CARD", paymentProvider: "RAZORPAY", sandbox: true, checkoutQuote: x.quote.token };
  try {
    const first = await post(server.baseUrl, x.token, body, key);
    assert.equal(first.status, 201);
    const firstBody = await first.json() as { booking: { _id: string; paymentId: string }; payment: { _id: string; provider: string; method: string; status: string; providerOrderId?: string; providerPaymentId?: string; amount: number; currency: string } };
    assert.equal(firstBody.payment.provider, "RAZORPAY");
    assert.equal(firstBody.payment.method, "CARD");
    assert.equal(firstBody.payment.status, "INITIALIZING");
    assert.equal(firstBody.payment.providerOrderId, "order_checkout_1");
    assert.equal(firstBody.payment.providerPaymentId, "order_checkout_1");
    assert.equal(firstBody.payment.currency, "INR");
    assert.equal(orderCalls, 1);

    const [intent, booking, payment, operation] = await Promise.all([
      BookingFundingIntent.findOne().orFail(),
      Booking.findById(firstBody.booking._id).orFail(),
      Payment.findById(firstBody.payment._id).orFail(),
      PaymentOperation.findOne({ paymentId: firstBody.payment._id }).orFail(),
    ]);
    assert.ok(intent.bookingId);
    assert.ok(intent.paymentId);
    assert.ok(intent.operationId);
    assert.ok(intent.bookingId.equals(booking._id));
    assert.ok(intent.paymentId.equals(payment._id));
    assert.ok(intent.operationId.equals(operation._id));
    assert.equal(operation.provider, "RAZORPAY");
    assert.equal(operation.providerOrderId, "order_checkout_1");
    assert.equal(await BookingFundReservation.countDocuments(), 0);
    assert.equal((await Slot.findById(x.bookingFixture.slotIds[0]).orFail()).status, "LOCKED");

    const replay = await post(server.baseUrl, x.token, body, key);
    assert.equal(replay.status, 200);
    const replayBody = await replay.json() as { booking: { _id: string }; payment: { _id: string } };
    assert.equal(replayBody.booking._id, firstBody.booking._id);
    assert.equal(replayBody.payment._id, firstBody.payment._id);
    assert.equal(orderCalls, 1);
    assert.equal(await Booking.countDocuments(), 1);
    assert.equal(await Payment.countDocuments(), 1);
    assert.equal(await PaymentOperation.countDocuments(), 1);
  } finally {
    await server.close();
  }
});

test("Razorpay sandbox admission is not available outside test or development", async () => {
  const x = await fixture();
  const server = await startReleaseHttpServer();
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const response = await post(server.baseUrl, x.token, { serviceId: String(x.bookingFixture.serviceId), slotIds: x.bookingFixture.slotIds.map(String), paymentMethod: "CARD", paymentProvider: "RAZORPAY", sandbox: true, checkoutQuote: x.quote.token }, "razorpay-production-denied");
    assert.equal(response.status, 404);
    assert.equal(await Booking.countDocuments(), 0);
  } finally {
    process.env.NODE_ENV = previous;
    await server.close();
  }
});
