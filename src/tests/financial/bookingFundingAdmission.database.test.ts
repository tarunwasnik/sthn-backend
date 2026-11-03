import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose, { Types } from "mongoose";
import { BookingFundingIntent } from "../../models/bookingFundingIntent.model";
import { Booking } from "../../models/booking.model";
import { Payment } from "../../models/payment.model";
import { PaymentOperation } from "../../models/paymentOperation.model";
import { BookingFundReservation } from "../../models/bookingFundReservation.model";
import { Wallet } from "../../models/wallet.model";
import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { bookingFundingAdmissionService as admission } from "../../services/booking/bookingFundingAdmission.service";
import { createBookingCheckoutQuote } from "../../services/booking/bookingCheckoutQuote.service";
import { paymentService } from "../../services/financial/payment.service";
import { paymentOperationService } from "../../services/financial/paymentOperation.service";
import { createBookingWalletFixture } from "./phase8a/fixtures/bookingWalletFixtures";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "standalone-admission-test-secret";
before(async () => { await connectPhase7HDatabase(); await BookingFundingIntent.init(); }, { timeout: 120_000 });
beforeEach(clearPhase7HDatabase);
after(disconnectPhase7HDatabase);

async function fixture(now = new Date()) {
  const f = await createBookingWalletFixture({ walletAmount: 0, slotAmounts: [200, 300] });
  const user = await User.create({ email: `${new Types.ObjectId()}@test.local`, role: "user", status: "active" });
  await UserProfile.create({ userId: user._id, username: `f${String(user._id)}`, dateOfBirth: new Date("1990-01-01"), interests: ["test"], bio: "test", avatar: "https://test.local/a", cover: "https://test.local/c", profilePhotos: ["https://test.local/1", "https://test.local/2"], profileStatus: "verified" });
  const quote = createBookingCheckoutQuote({ customerId: String(user._id), creatorId: String(f.actors.creatorId), serviceId: String(f.serviceId), slotIds: f.slotIds.map(String), currency: "INR", serviceAmount: f.serviceAmount, customerFeeAmount: f.platformFeeAmount, totalAmount: f.totalAmount }, now);
  return { f, quote, input: { authenticatedCustomerId: String(user._id), creatorId: String(f.actors.creatorId), serviceId: String(f.serviceId), slotIds: f.slotIds.map(String), checkoutQuote: quote.token, requestKey: "same-intent", method: PaymentMethod.INTERNAL, provider: PaymentProvider.INTERNAL } };
}

test("new and concurrent admissions converge, normalize slots, preserve price, and need no wallet or booking", async () => {
  const { f, input } = await fixture();
  assert.equal(await Wallet.countDocuments({ userId: input.authenticatedCustomerId }), 0);
  const outcomes = await Promise.all(Array.from({ length: 6 }, (_, n) => admission.admit({ ...input, slotIds: n % 2 ? [...input.slotIds].reverse() : input.slotIds })));
  assert.equal(new Set(outcomes.map(x => x.intentId)).size, 1);
  assert.equal(outcomes.filter(x => !x.replayed).length, 1);
  assert.equal(outcomes[0].state, "NOT_FUNDED");
  assert.deepEqual(outcomes[0].pricing, { serviceAmount: f.serviceAmount, customerFeeAmount: f.platformFeeAmount, totalAmount: f.totalAmount, currency: "INR" });
  assert.equal(await BookingFundingIntent.countDocuments(), 1);
  assert.equal(await Booking.countDocuments(), 0);
  assert.equal(await Payment.countDocuments(), 0);
  assert.equal(await PaymentOperation.countDocuments(), 0);
  assert.equal(await BookingFundReservation.countDocuments(), 0);
  const replay = await admission.admit(input);
  assert.equal(replay.replayed, true);
  assert.equal(replay.intentId, outcomes[0].intentId);
});

test("same key rejects changed service, slots, quote, provider and unauthorized callers", async () => {
  const { input } = await fixture();
  await admission.admit(input);
  for (const change of [{ serviceId: String(new Types.ObjectId()) }, { slotIds: [input.slotIds[0]] }, { checkoutQuote: `${input.checkoutQuote}x` }, { provider: PaymentProvider.STRIPE }]) {
    await assert.rejects(() => admission.admit({ ...input, ...change }), /conflicts/);
  }
  await assert.rejects(() => admission.admit({ ...input, authenticatedCustomerId: String(new Types.ObjectId()) }), /authenticated customer/);
  await assert.rejects(() => admission.admit({ ...input, requestKey: "unsupported", provider: PaymentProvider.STRIPE }), /unavailable/);
  const original = await BookingFundingIntent.findOne().select("+requestKey +fingerprint +quoteTokenHash").orFail();
  const duplicate = original.toObject();
  delete (duplicate as { _id?: unknown })._id;
  await assert.rejects(() => BookingFundingIntent.create(duplicate), /duplicate key/);
});

test("customers may independently use the same request key", async () => {
  const first = await fixture();
  const second = await fixture();
  const one = await admission.admit(first.input);
  const two = await admission.admit(second.input);
  assert.notEqual(one.intentId, two.intentId);
  assert.equal(await BookingFundingIntent.countDocuments(), 2);
});

test("original quote can expire after commit without breaking lost-response replay", async () => {
  const { input } = await fixture(new Date(Date.now() - 14 * 60_000 - 58_000));
  const first = await admission.admit(input);
  await new Promise(resolve => setTimeout(resolve, 2200));
  const replay = await admission.admit(input);
  assert.equal(replay.intentId, first.intentId);
  assert.equal(replay.replayed, true);
  await assert.rejects(() => admission.admit({ ...input, requestKey: "new-key" }), /expired/);
});

test("transaction-bound association rolls back, preserves operation identity, and never dispatches on replay", async () => {
  const { f, quote, input } = await fixture();
  await admission.admit(input);
  const booking = await Booking.create({ slotIds: f.slotIds, userId: input.authenticatedCustomerId, creatorId: f.actors.creatorId, serviceId: f.serviceId, serviceTitle: "test", durationMinutes: 60, price: f.serviceAmount, serviceAmount: f.serviceAmount, platformFeeAmount: f.platformFeeAmount, commissionAmount: f.commissionAmount, creatorAmount: f.creatorAmount, totalAmount: f.totalAmount, currency: "INR", status: "REQUESTED", paymentStatus: "PENDING", paymentMethod: PaymentMethod.INTERNAL, checkoutQuoteId: quote.quote.quoteId, checkoutQuoteFingerprint: quote.quote.fingerprint, expiresAt: new Date(Date.now() + 60000) });
  const payment = await paymentService.createPayment({ bookingId: String(booking._id), userId: input.authenticatedCustomerId, creatorId: input.creatorId, serviceAmount: { amount: f.serviceAmount, currency: "INR" }, method: input.method, provider: input.provider, idempotencyKey: "standalone-payment", checkoutContext: { quoteId: quote.quote.quoteId, quoteFingerprint: quote.quote.fingerprint, financialPolicyVersion: quote.quote.financialPolicyVersion, financialPolicyContentReference: null } });
  booking.paymentId = payment._id; await booking.save();
  const operation = await paymentOperationService.prepare(payment);
  const session = await mongoose.startSession();
  const binding = { authenticatedCustomerId: input.authenticatedCustomerId, requestKey: input.requestKey, bookingId: String(booking._id), paymentId: String(payment._id), operationId: String(operation._id), session };
  try {
    await assert.rejects(() => admission.bind(binding), /active booking transaction/);
    session.startTransaction();
    assert.equal((await admission.bind(binding)).state, "PENDING");
    await session.abortTransaction();
    assert.equal((await admission.admit(input)).state, "NOT_FUNDED");
    await session.withTransaction(async () => { await admission.bind(binding); });
  } finally { await session.endSession(); }
  await admission.admit({ ...input, requestKey: "another-intent" });
  const competingSession = await mongoose.startSession();
  try {
    await assert.rejects(() => competingSession.withTransaction(() => admission.bind({ ...binding, requestKey: "another-intent", session: competingSession })), /already associated/);
  } finally { await competingSession.endSession(); }
  let replay = await admission.admit(input);
  assert.equal(replay.operationId, String(operation._id));
  assert.equal(replay.state, "PENDING");
  assert.equal((await PaymentOperation.findById(operation._id).orFail()).attemptCount, 0);
  await paymentOperationService.markUnknown(operation, "test ambiguity");
  replay = await admission.admit(input);
  assert.equal(replay.state, "UNKNOWN");
  assert.equal((await PaymentOperation.findById(operation._id).orFail()).attemptCount, 0);
  await PaymentOperation.updateOne({ _id: operation._id }, { $set: { status: "CONFIRMED", providerStatus: "CAPTURED", confirmedAt: new Date(), verifiedAmount: f.totalAmount, verifiedCurrency: "INR", providerPaymentId: "provider-test" } });
  assert.equal((await admission.admit(input)).state, "UNKNOWN");
  await Payment.updateOne({ _id: payment._id }, { $set: { status: "CAPTURED", providerPaymentId: "provider-test" } });
  assert.equal((await admission.admit(input)).state, "CONFIRMED");
  await PaymentOperation.updateOne({ _id: operation._id }, { $set: { verifiedAmount: f.totalAmount + 1 } });
  assert.equal((await admission.admit(input)).state, "UNKNOWN");
  await PaymentOperation.updateOne({ _id: operation._id }, { $set: { status: "FAILED", providerStatus: "FAILED", failedAt: new Date() } });
  await Payment.updateOne({ _id: payment._id }, { $set: { status: "FAILED" } });
  assert.equal((await admission.admit(input)).state, "FAILED");
  assert.equal((await PaymentOperation.findById(operation._id).orFail()).attemptCount, 0);
});
