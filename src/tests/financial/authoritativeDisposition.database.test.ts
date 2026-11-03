import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose, { Types } from "mongoose";
import { Booking } from "../../models/booking.model";
import { Slot } from "../../models/slot.model";
import { Payment } from "../../models/payment.model";
import { TerminationProviderOperation } from "../../models/terminationProviderOperation.model";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { paymentProviderRegistry } from "../../services/financial/paymentProviderRegistry.service";
import { internalPaymentProvider } from "../../services/financial/providers/internal.provider";
import { PaymentProviderInterface } from "../../contracts/financial/paymentProvider.interface";
import { BookingTerminationActorType as Actor, BookingTerminationType as Intent } from "../../enums/booking/bookingTerminationType.enum";
import { bookingRepository } from "../../repositories/booking.repository";
import { terminationProviderOperationRepository } from "../../repositories/terminationProviderOperation.repository";
import { createBookingCheckoutQuote } from "../../services/booking/bookingCheckoutQuote.service";
import { admitAuthoritativeCancellationDisposition } from "../../services/financial/authoritativeCancellationDisposition.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "authority-test-secret";
before(connectPhase7HDatabase, { timeout: 120_000 });
beforeEach(clearPhase7HDatabase);
after(disconnectPhase7HDatabase, { timeout: 30_000 });

async function fixture() {
  const userId = new Types.ObjectId(), creatorId = new Types.ObjectId(), serviceId = new Types.ObjectId();
  const receipt = new Date();
  const start = new Date(receipt.getTime() + 3600000);
  const slot = await Slot.create({ availabilityId: new Types.ObjectId(), creatorId, serviceId, startTime: start, endTime: new Date(start.getTime() + 3600000), timezone: "UTC", status: "LOCKED", price: 1000 });
  const { quote } = createBookingCheckoutQuote({ customerId: String(userId), creatorId: String(creatorId), serviceId: String(serviceId), slotIds: [String(slot._id)], currency: "INR", serviceAmount: 100000, customerFeeAmount: 5000, totalAmount: 105000 });
  const booking = await Booking.create({ slotIds: [slot._id], purchasedScheduledStart: start, userId, creatorId, serviceId, serviceTitle: "Test", durationMinutes: 60, price: 100000, serviceAmount: 100000, platformFeeAmount: 5000, commissionAmount: 20000, creatorAmount: 80000, totalAmount: 105000, currency: "INR", financialPolicyVersion: quote.financialPolicyVersion, checkoutQuoteId: quote.quoteId, checkoutQuoteFingerprint: quote.fingerprint, checkoutQuoteIssuedAt: new Date(quote.issuedAt), checkoutQuoteExpiresAt: new Date(quote.expiresAt), status: "CONFIRMED", paymentStatus: "PENDING", expiresAt: new Date(), creatorAcceptedAt: new Date(receipt.getTime() - 60000) });
  const bookingId = booking._id as Types.ObjectId;
  const input = { bookingId, actorId: userId, actorType: Actor.CUSTOMER, intent: Intent.CUSTOMER_CANCELLED };
  const operationKey = `booking-termination:${bookingId}`;
  const claim = await bookingRepository.acquireTerminationClaim({ bookingId, claim: { operationKey, status: "ACTIVE", intent: input.intent, actorType: input.actorType, actorId: userId, evidenceReceiptAt: receipt, createdAt: receipt, updatedAt: receipt, version: 1 } });
  assert.ok(claim);
  const evidence = await bookingRepository.admitTerminationEvidence(bookingId, { version: "TERMINATION_EVIDENCE_V1", status: "PENDING", operationKey, actorType: input.actorType, actorId: userId, intent: input.intent, receiptAt: receipt, receiptOrder: "UNVERIFIED", outcome: "NOT_QUALIFIED", reason: "NO_TWO_WAY_MESSAGES", candidateMessageIds: [], recordedAt: receipt });
  assert.ok(evidence);
  return { input, bookingId, slot, start };
}

test("admission is durable, replay-stable and concurrent requests converge", async () => {
  const f = await fixture();
  const results = await Promise.all(Array.from({ length: 5 }, () => admitAuthoritativeCancellationDisposition(f.input)));
  assert.ok(results.every((r) => r.status === "READY"));
  const ids = results.map((r) => r.status === "READY" ? r.disposition.authorityId : "");
  assert.equal(new Set(ids).size, 1);
  await Slot.updateOne({ _id: f.slot._id }, { $set: { startTime: new Date(f.start.getTime() + 7200000) } });
  const replay = await admitAuthoritativeCancellationDisposition(f.input);
  assert.equal(replay.status, "READY");
  if (replay.status === "READY") {
    assert.equal(replay.disposition.authorityId, ids[0]);
    assert.equal(replay.disposition.executionStatus, "NOT_EXECUTED");
    assert.equal(replay.disposition.breakdown?.totalCustomerRefund, 60000);
  }
});

test("missing schedule and conflicting actor fail closed", async () => {
  const f = await fixture();
  await Booking.collection.updateOne({ _id: f.bookingId }, { $unset: { purchasedScheduledStart: "" } });
  assert.equal((await admitAuthoritativeCancellationDisposition(f.input)).status, "NOT_READY");
  assert.equal((await admitAuthoritativeCancellationDisposition({ ...f.input, actorId: new Types.ObjectId() })).status, "CONFLICT");
});

test("incomplete evidence and missing claims cannot be admitted", async () => {
  const f = await fixture();
  await Booking.collection.updateOne({ _id: f.bookingId }, { $unset: { terminationEvidence: "" } });
  assert.equal((await admitAuthoritativeCancellationDisposition(f.input)).status, "NOT_READY");
  await Booking.collection.updateOne({ _id: f.bookingId }, { $unset: { terminationClaim: "" } });
  assert.equal((await admitAuthoritativeCancellationDisposition(f.input)).status, "NOT_READY");
});

test("pricing corruption and conflicting stored authority fail closed", async () => {
  const f = await fixture();
  const admitted = await admitAuthoritativeCancellationDisposition(f.input);
  assert.equal(admitted.status, "READY");
  await Booking.collection.updateOne({ _id: f.bookingId }, { $set: { "authoritativeDisposition.breakdown.totalCustomerRefund": 123 } });
  assert.equal((await admitAuthoritativeCancellationDisposition(f.input)).status, "CONFLICT");
  await Booking.collection.updateOne({ _id: f.bookingId }, { $set: { totalAmount: 105001 } });
  assert.equal((await admitAuthoritativeCancellationDisposition(f.input)).status, "CONFLICT");
});

test("persistence failure does not produce readiness", async (context) => {
  const f = await fixture();
  context.mock.method(bookingRepository, "admitAuthoritativeDisposition", async () => { throw new Error("storage unavailable"); });
  assert.equal((await admitAuthoritativeCancellationDisposition(f.input)).status, "NOT_READY");
});

test("guard rejects absent operation without invoking a provider", async () => {
  const result = await terminationProviderOperationRepository.markDispositionDispatched(new Types.ObjectId(), "missing");
  assert.notEqual(result.status, "MARKED");
});

test("guard verifies operation identity and capability and marks at most once without provider calls", async (context) => {
  const f = await fixture();
  const paymentId = new Types.ObjectId();
  await Payment.collection.insertOne({ _id: paymentId, bookingId: f.bookingId, userId: f.input.actorId, creatorId: (await Booking.findById(f.bookingId).orFail()).creatorId, amount: 105000, currency: "INR", provider: PaymentProvider.INTERNAL, method: PaymentMethod.INTERNAL, providerPaymentId: "provider-payment", status: PaymentStatus.CAPTURED });
  await Booking.collection.updateOne({ _id: f.bookingId }, { $set: { paymentId, paymentMethod: PaymentMethod.INTERNAL, "terminationClaim.paymentId": paymentId } });
  const admitted = await admitAuthoritativeCancellationDisposition(f.input);
  assert.equal(admitted.status, "READY");
  if (admitted.status !== "READY") return;
  const authorityId = admitted.disposition.authorityId;
  const key = admitted.disposition.operationKey;
  const op = await TerminationProviderOperation.create({ bookingId: f.bookingId, paymentId, claimKey: key, intent: f.input.intent, actorType: f.input.actorType, actorId: f.input.actorId, provider: PaymentProvider.INTERNAL, providerPaymentId: "provider-payment", kind: "REFUND", dispatchMode: "DISPOSITION", amount: 60000, currency: "INR", idempotencyKey: `${key}:disposition:${authorityId}` });
  let providerCalls = 0;
  context.mock.method(internalPaymentProvider, "createRefund", async () => { providerCalls++; throw new Error("must not be called"); });
  assert.equal(await terminationProviderOperationRepository.markDispatched(op._id as Types.ObjectId), null);
  assert.equal((await terminationProviderOperationRepository.markDispositionDispatched(op._id as Types.ObjectId, "wrong" )).status, "NOT_READY");
  assert.equal((await terminationProviderOperationRepository.markDispositionDispatched(op._id as Types.ObjectId, authorityId)).status, "UNSUPPORTED");
  const fake = Object.create(internalPaymentProvider) as PaymentProviderInterface;
  Object.defineProperty(fake, "dispositionRefundCapabilities", { value: { fullRefund: true, partialRefund: true, idempotent: true, authenticatedLookup: true } });
  paymentProviderRegistry.register(fake);
  try {
    await TerminationProviderOperation.collection.updateOne({ _id: op._id }, { $set: { idempotencyKey: "wrong-operation" } });
    assert.equal((await terminationProviderOperationRepository.markDispositionDispatched(op._id as Types.ObjectId, authorityId)).status, "CONFLICT");
    await TerminationProviderOperation.collection.updateOne({ _id: op._id }, { $set: { idempotencyKey: `${key}:disposition:${authorityId}`, status: "UNKNOWN" } });
    assert.equal((await terminationProviderOperationRepository.markDispositionDispatched(op._id as Types.ObjectId, authorityId)).status, "CONFLICT");
    await TerminationProviderOperation.collection.updateOne({ _id: op._id }, { $set: { status: "PENDING" } });
    await TerminationProviderOperation.collection.updateOne({ _id: op._id }, { $set: { amount: 60001 } });
    assert.equal((await terminationProviderOperationRepository.markDispositionDispatched(op._id as Types.ObjectId, authorityId)).status, "CONFLICT");
    await TerminationProviderOperation.collection.updateOne({ _id: op._id }, { $set: { amount: 60000 } });
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      await Booking.updateOne({ _id: f.bookingId }, { $set: { "terminationClaim.status": "RELEASED" } }, { session });
      const guarded = terminationProviderOperationRepository.markDispositionDispatched(op._id as Types.ObjectId, authorityId);
      await session.commitTransaction();
      assert.notEqual((await guarded).status, "MARKED");
    } finally { await session.endSession(); }
    await Booking.collection.updateOne({ _id: f.bookingId }, { $set: { "terminationClaim.status": "ACTIVE" } });
    const results = await Promise.all([terminationProviderOperationRepository.markDispositionDispatched(op._id as Types.ObjectId, authorityId), terminationProviderOperationRepository.markDispositionDispatched(op._id as Types.ObjectId, authorityId)]);
    assert.equal(results.filter((r) => r.status === "MARKED").length, 1);
    assert.equal((await TerminationProviderOperation.findById(op._id).orFail()).status, "IN_FLIGHT");
    assert.equal(providerCalls, 0);
  } finally { paymentProviderRegistry.register(internalPaymentProvider); }
});
