import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose, { Types } from "mongoose";
import { TerminationProviderOperation } from "../../models/terminationProviderOperation.model";
import { Booking } from "../../models/booking.model";
import { terminationProviderOperationRepository as operations } from "../../repositories/terminationProviderOperation.repository";
import { BookingTerminationActorType, BookingTerminationType } from "../../enums/booking/bookingTerminationType.enum";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";

process.env.NODE_ENV = "test";
before(async () => { await connectPhase7HDatabase(); await TerminationProviderOperation.init(); }, { timeout: 120_000 });
beforeEach(clearPhase7HDatabase);
after(disconnectPhase7HDatabase, { timeout: 30_000 });

function identity() {
  const bookingId = new Types.ObjectId();
  return { bookingId, paymentId: new Types.ObjectId(), claimKey: `booking-termination:${bookingId}`,
    intent: BookingTerminationType.CUSTOMER_CANCELLED, actorType: BookingTerminationActorType.CUSTOMER,
    actorId: new Types.ObjectId(), provider: PaymentProvider.INTERNAL, providerPaymentId: `p-${bookingId}`,
    kind: "REFUND" as const, amount: 100, currency: "INR" as const, idempotencyKey: `refund-${bookingId}` };
}

test("operation identity is unique per booking, claim and idempotency key", async () => {
  const first = identity();
  await operations.create(first);
  await assert.rejects(() => operations.create({ ...identity(), claimKey: first.claimKey }));
  await assert.rejects(() => operations.create({ ...identity(), bookingId: first.bookingId }));
  await assert.rejects(() => operations.create({ ...identity(), idempotencyKey: first.idempotencyKey }));
});

test("one durable dispatch marker wins and unknown cannot be dispatched again", async () => {
  const op = await operations.create(identity());
  const id = op._id as Types.ObjectId;
  const contenders = await Promise.all(Array.from({ length: 8 }, () => operations.markDispatched(id)));
  assert.equal(contenders.filter(Boolean).length, 1);
  assert.equal((await operations.findByClaimKey(op.claimKey))?.status, "IN_FLIGHT");
  assert.equal((await operations.markUnknown(id))?.status, "UNKNOWN");
  assert.equal(await operations.markDispatched(id), null);
  assert.equal(await operations.markUnknown(id), null);
});

test("terminal outcomes cannot be overwritten by a conflicting result", async () => {
  const op = await operations.create(identity());
  const id = op._id as Types.ObjectId;
  await operations.markDispatched(id);
  const confirmed = await operations.recordVerifiedOutcome({ id, expected: "IN_FLIGHT", result: "CONFIRMED", providerStatus: "REFUNDED", providerOperationReference: "ref-1" });
  assert.equal(confirmed?.status, "CONFIRMED");
  assert.equal(await operations.recordVerifiedOutcome({ id, expected: "IN_FLIGHT", result: "FAILED", providerStatus: "FAILED" }), null);
  assert.equal(await operations.markDispatched(id), null);
});

test("finalization requires a transaction and abort rolls back the state", async () => {
  const op = await operations.create(identity());
  const id = op._id as Types.ObjectId;
  await operations.markDispatched(id);
  await operations.recordVerifiedOutcome({ id, expected: "IN_FLIGHT", result: "CONFIRMED", providerStatus: "REFUNDED" });
  const session = await mongoose.startSession();
  try {
    await assert.rejects(() => operations.finalize(id, session), /transaction/);
    await session.withTransaction(async () => { assert.equal(await operations.finalize(id, session), null); });
    await Booking.collection.insertOne({ _id: op.bookingId, paymentId: new Types.ObjectId(), status: "CANCELLED", terminationOperationKey: op.claimKey, terminationType: op.intent, terminatedByType: op.actorType, terminatedById: op.actorId, terminationClaim: { status: "FINALIZED", operationKey: op.claimKey, intent: op.intent, actorType: op.actorType, actorId: op.actorId, paymentId: op.paymentId } });
    await session.withTransaction(async () => { assert.equal(await operations.finalize(id, session), null); });
    await Booking.collection.updateOne({ _id: op.bookingId }, { $set: { paymentId: op.paymentId, status: "CONFIRMED" } });
    await session.withTransaction(async () => { assert.equal(await operations.finalize(id, session), null); });
    await Booking.collection.updateOne({ _id: op.bookingId }, { $set: { status: "CANCELLED" } });
    await assert.rejects(() => session.withTransaction(async () => {
      assert.equal((await operations.finalize(id, session))?.status, "FINALIZED");
      throw new Error("rollback");
    }), /rollback/);
    assert.equal((await operations.findByClaimKey(op.claimKey))?.status, "CONFIRMED");
  } finally { await session.endSession(); }
});
