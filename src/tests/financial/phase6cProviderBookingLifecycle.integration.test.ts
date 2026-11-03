import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";

import { Booking } from "../../models/booking.model";
import { BookingFundReservation } from "../../models/bookingFundReservation.model";
import { FeatureFlag } from "../../models/featureFlag.model";
import { Payment } from "../../models/payment.model";
import { PaymentOperation } from "../../models/paymentOperation.model";
import { CreatorEntitlement } from "../../models/creatorEntitlement.model";
import { Refund } from "../../models/refund.model";
import { Slot } from "../../models/slot.model";
import { PaymentOperationStatus } from "../../enums/financial/paymentOperationStatus.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { creatorEntitlementRepository } from "../../repositories/creatorEntitlement.repository";
import { expireBookingsJob } from "../../jobs/expireBookings.job";
import { completeBookingsJob } from "../../jobs/completeBookings.job";
import { createBookingCheckoutQuote } from "../../services/booking/bookingCheckoutQuote.service";
import { featureFlagCache } from "../../services/controlPlane/featureFlagCache.service";
import { createBookingWalletFixture } from "./phase8a/fixtures/bookingWalletFixtures";
import { startReleaseHttpServer } from "./phase8b/fixtures/bookingWalletReleaseFixtures";
import { postCreatorCompletion } from "./phase8c/fixtures/bookingWalletCaptureFixtures";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase6c-provider-booking-lifecycle";

before(async () => {
  await connectPhase7HDatabase();
  await Promise.all([PaymentOperation.init(), CreatorEntitlement.init()]);
}, { timeout: 120_000 });

beforeEach(async () => {
  await clearPhase7HDatabase();
  featureFlagCache.invalidate();
});

after(disconnectPhase7HDatabase);

const createProviderBooking = async (options: { expires?: boolean } = {}) => {
  const fixture = await createBookingWalletFixture({ walletAmount: 0, slotAmounts: [500] });
  const quote = createBookingCheckoutQuote({
    customerId: String(fixture.actors.userId),
    creatorId: String(fixture.actors.creatorId),
    serviceId: String(fixture.serviceId),
    slotIds: fixture.slotIds.map(String),
    currency: "INR",
    serviceAmount: fixture.serviceAmount,
    customerFeeAmount: fixture.platformFeeAmount,
    totalAmount: fixture.totalAmount,
  });
  const server = await startReleaseHttpServer();
  const key = `phase6c-${Date.now()}-${Math.random()}`;
  const response = await fetch(`${server.baseUrl}/api/v1/bookings/request`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${fixture.token}`,
      "Idempotency-Key": key,
    },
    body: JSON.stringify({
      serviceId: String(fixture.serviceId),
      slotIds: fixture.slotIds.map(String),
      paymentMethod: "INTERNAL",
      checkoutQuote: quote.token,
      idempotencyKey: key,
    }),
  });
  const body = await response.json() as { booking?: { _id?: string } };
  assert.equal(response.status, 201, JSON.stringify(body));
  assert.ok(body.booking?._id);
  const booking = await Booking.findById(body.booking._id).orFail();
  const payment = await Payment.findById(booking.paymentId).orFail();
  const creatorToken = jwt.sign({ id: String(fixture.actors.creatorId), role: "creator" }, process.env.JWT_SECRET!);
  if (options.expires) await Booking.updateOne({ _id: booking._id }, { $set: { expiresAt: new Date(Date.now() - 1_000) } });
  return { fixture, server, booking, payment, creatorToken };
};

const decide = async (baseUrl: string, bookingId: string, creatorToken: string, decision: "ACCEPT" | "REJECT") => {
  const response = await fetch(`${baseUrl}/api/v1/creator/bookings/${bookingId}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${creatorToken}` },
    body: JSON.stringify({ decision }),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
};

test("Phase 6C provider booking accepts only verified funding and completes without Wallet capture or payout", async () => {
  const setup = await createProviderBooking();
  try {
    const operation = await PaymentOperation.findOne({ paymentId: setup.payment._id }).orFail();
    assert.equal(setup.payment.status, PaymentStatus.CAPTURED);
    assert.equal(operation.status, PaymentOperationStatus.CONFIRMED);
    assert.equal(await BookingFundReservation.countDocuments({ bookingId: setup.booking._id }), 0);

    const accepted = await decide(setup.server.baseUrl, String(setup.booking._id), setup.creatorToken, "ACCEPT");
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    await FeatureFlag.create({ key: "BOOKING_COMPLETION_ENABLED", enabled: true, scope: "GLOBAL", createdBy: setup.fixture.actors.adminId });
    featureFlagCache.invalidate();
    const completed = await postCreatorCompletion(setup.server.baseUrl, String(setup.booking._id), setup.creatorToken);
    assert.equal(completed.status, 200, JSON.stringify(completed.body));

    const [booking, payment] = await Promise.all([
      Booking.findById(setup.booking._id).orFail(),
      Payment.findById(setup.payment._id).orFail(),
    ]);
    assert.equal(booking.status, "COMPLETED");
    assert.equal(payment.status, PaymentStatus.CAPTURED);
    assert.equal(booking.isPayoutEligible, false);
    assert.equal(booking.settlementId, undefined);
    assert.equal(await BookingFundReservation.countDocuments({ bookingId: booking._id }), 0);
    const entitlement = await CreatorEntitlement.findOne({ bookingId: booking._id }).orFail();
    assert.equal(entitlement.state, "HELD");
    assert.equal(entitlement.creatorId.toString(), booking.creatorId.toString());
    assert.equal(entitlement.currency, booking.currency);
    assert.equal(entitlement.creatorAmount, booking.creatorAmount);
    assert.equal(entitlement.platformAmount, booking.platformFeeAmount + booking.commissionAmount);
    assert.equal(entitlement.customerRefundAmount, 0);
    assert.equal(entitlement.totalAmount, booking.totalAmount);
    assert.equal(await CreatorEntitlement.countDocuments({ bookingId: booking._id }), 1);
  } finally {
    await setup.server.close();
  }
});

test("Phase 7C automatic completion recognizes one held entitlement without legacy settlement effects", async () => {
  const setup = await createProviderBooking();
  try {
    const accepted = await decide(setup.server.baseUrl, String(setup.booking._id), setup.creatorToken, "ACCEPT");
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    await Slot.updateMany({ _id: { $in: setup.booking.slotIds } }, { $set: { endTime: new Date(Date.now() - 11 * 60 * 1_000) } });

    const first = await completeBookingsJob();
    const second = await completeBookingsJob();
    assert.equal(first.completed, 1);
    assert.equal(second.completed, 0);
    const [booking, entitlement] = await Promise.all([
      Booking.findById(setup.booking._id).orFail(),
      CreatorEntitlement.findOne({ bookingId: setup.booking._id }).orFail(),
    ]);
    assert.equal(booking.status, "COMPLETED");
    assert.equal(booking.completedByType, "SYSTEM");
    assert.equal(entitlement.state, "HELD");
    assert.equal(await CreatorEntitlement.countDocuments({ bookingId: booking._id }), 1);
    assert.equal(await BookingFundReservation.countDocuments({ bookingId: booking._id }), 0);
  } finally {
    await setup.server.close();
  }
});

test("Phase 7C refuses completion when confirmed payment-operation evidence is no longer authoritative", async () => {
  const setup = await createProviderBooking();
  try {
    const accepted = await decide(setup.server.baseUrl, String(setup.booking._id), setup.creatorToken, "ACCEPT");
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    await FeatureFlag.create({ key: "BOOKING_COMPLETION_ENABLED", enabled: true, scope: "GLOBAL", createdBy: setup.fixture.actors.adminId });
    featureFlagCache.invalidate();
    await PaymentOperation.updateOne({ paymentId: setup.payment._id }, { $set: { status: PaymentOperationStatus.UNKNOWN } });

    const completed = await postCreatorCompletion(setup.server.baseUrl, String(setup.booking._id), setup.creatorToken);
    assert.notEqual(completed.status, 200);
    assert.equal((await Booking.findById(setup.booking._id).orFail()).status, "CONFIRMED");
    assert.equal(await CreatorEntitlement.countDocuments({ bookingId: setup.booking._id }), 0);
  } finally {
    await setup.server.close();
  }
});

test("Phase 7C recognition failure rolls back completion and permits the same completion to recover", async () => {
  const setup = await createProviderBooking();
  try {
    const accepted = await decide(setup.server.baseUrl, String(setup.booking._id), setup.creatorToken, "ACCEPT");
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    await FeatureFlag.create({ key: "BOOKING_COMPLETION_ENABLED", enabled: true, scope: "GLOBAL", createdBy: setup.fixture.actors.adminId });
    featureFlagCache.invalidate();
    const originalCreate = creatorEntitlementRepository.create;
    creatorEntitlementRepository.create = async () => { throw new Error("injected entitlement persistence failure"); };
    try {
      const failed = await postCreatorCompletion(setup.server.baseUrl, String(setup.booking._id), setup.creatorToken);
      assert.notEqual(failed.status, 200);
      assert.equal((await Booking.findById(setup.booking._id).orFail()).status, "CONFIRMED");
      assert.equal(await CreatorEntitlement.countDocuments({ bookingId: setup.booking._id }), 0);
    } finally {
      creatorEntitlementRepository.create = originalCreate;
    }

    const recovered = await postCreatorCompletion(setup.server.baseUrl, String(setup.booking._id), setup.creatorToken);
    assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
    assert.equal((await Booking.findById(setup.booking._id).orFail()).status, "COMPLETED");
    assert.equal(await CreatorEntitlement.countDocuments({ bookingId: setup.booking._id }), 1);
  } finally {
    await setup.server.close();
  }
});

test("Phase 6C UNKNOWN provider funding cannot be accepted", async () => {
  const setup = await createProviderBooking();
  try {
    const operation = await PaymentOperation.findOne({ paymentId: setup.payment._id }).orFail();
    await PaymentOperation.updateOne({ _id: operation._id }, { $set: { status: PaymentOperationStatus.UNKNOWN } });
    const response = await decide(setup.server.baseUrl, String(setup.booking._id), setup.creatorToken, "ACCEPT");
    assert.equal(response.status, 400);
    assert.equal((await Booking.findById(setup.booking._id).orFail()).status, "REQUESTED");
    assert.equal((await Slot.findById(setup.booking.slotIds[0]).orFail()).status, "LOCKED");
  } finally {
    await setup.server.close();
  }
});

test("Phase 6C provider rejection and expiry use one confirmed refund path without Wallet release", async () => {
  const rejected = await createProviderBooking();
  try {
    const response = await decide(rejected.server.baseUrl, String(rejected.booking._id), rejected.creatorToken, "REJECT");
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal((await decide(rejected.server.baseUrl, String(rejected.booking._id), rejected.creatorToken, "REJECT")).status, 200);
    const [booking, payment, refund] = await Promise.all([
      Booking.findById(rejected.booking._id).orFail(),
      Payment.findById(rejected.payment._id).orFail(),
      Refund.findOne({ paymentId: rejected.payment._id }).orFail(),
    ]);
    assert.equal(booking.status, "REJECTED");
    assert.equal(payment.status, PaymentStatus.REFUNDED);
    assert.equal(refund.status, "COMPLETED");
    assert.equal(await BookingFundReservation.countDocuments({ bookingId: booking._id }), 0);
  } finally {
    await rejected.server.close();
  }

  const expired = await createProviderBooking({ expires: true });
  try {
    await expireBookingsJob();
    const [booking, payment] = await Promise.all([
      Booking.findById(expired.booking._id).orFail(),
      Payment.findById(expired.payment._id).orFail(),
    ]);
    assert.equal(booking.status, "EXPIRED");
    assert.equal(payment.status, PaymentStatus.REFUNDED);
    assert.equal((await Slot.findById(expired.booking.slotIds[0]).orFail()).status, "AVAILABLE");
    assert.equal(await BookingFundReservation.countDocuments({ bookingId: booking._id }), 0);
  } finally {
    await expired.server.close();
  }
});

test("Phase 6C customer and creator cancellation use authenticated, single-refund provider termination", async () => {
  const customerCancellation = await createProviderBooking();
  try {
    const accepted = await decide(customerCancellation.server.baseUrl, String(customerCancellation.booking._id), customerCancellation.creatorToken, "ACCEPT");
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    const response = await fetch(`${customerCancellation.server.baseUrl}/api/v1/bookings/${customerCancellation.booking._id}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${customerCancellation.fixture.token}` },
      body: JSON.stringify({ reason: "Customer requested cancellation" }),
    });
    assert.equal(response.status, 200, await response.text());
    const [booking, payment] = await Promise.all([
      Booking.findById(customerCancellation.booking._id).orFail(),
      Payment.findById(customerCancellation.payment._id).orFail(),
    ]);
    assert.equal(booking.status, "CANCELLED");
    assert.equal(payment.status, PaymentStatus.REFUNDED);
    assert.equal(await Refund.countDocuments({ paymentId: payment._id }), 1);
  } finally {
    await customerCancellation.server.close();
  }

  const creatorCancellation = await createProviderBooking();
  try {
    const accepted = await decide(creatorCancellation.server.baseUrl, String(creatorCancellation.booking._id), creatorCancellation.creatorToken, "ACCEPT");
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    const response = await fetch(`${creatorCancellation.server.baseUrl}/api/v1/bookings/creator/cancel-booking`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${creatorCancellation.creatorToken}` },
      body: JSON.stringify({ bookingId: String(creatorCancellation.booking._id), reason: "Creator requested cancellation" }),
    });
    assert.equal(response.status, 200, await response.text());
    const [booking, payment] = await Promise.all([
      Booking.findById(creatorCancellation.booking._id).orFail(),
      Payment.findById(creatorCancellation.payment._id).orFail(),
    ]);
    assert.equal(booking.status, "CANCELLED");
    assert.equal(payment.status, PaymentStatus.REFUNDED);
    assert.equal(await Refund.countDocuments({ paymentId: payment._id }), 1);
    assert.equal(await BookingFundReservation.countDocuments({ bookingId: booking._id }), 0);
  } finally {
    await creatorCancellation.server.close();
  }
});
