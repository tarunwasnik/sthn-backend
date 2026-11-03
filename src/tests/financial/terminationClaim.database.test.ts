import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose, { Types } from "mongoose";
import { Booking } from "../../models/booking.model";
import { bookingRepository } from "../../repositories/booking.repository";
import { bookingFinancialTerminationService } from "../../services/financial/bookingFinancialTermination.service";
import { BookingTerminationActorType as Actor, BookingTerminationType as Intent } from "../../enums/booking/bookingTerminationType.enum";
import { BookingCompletionActorType as CompletionActor, BookingWalletCaptureCause as Cause } from "../../enums/financial/bookingWalletCaptureCause.enum";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";

process.env.NODE_ENV = "test";
before(connectPhase7HDatabase, { timeout: 120_000 });
beforeEach(clearPhase7HDatabase);
after(disconnectPhase7HDatabase, { timeout: 30_000 });

async function fixture() {
  const userId = new Types.ObjectId();
  const creatorId = new Types.ObjectId();
  const booking = await Booking.create({ slotIds: [new Types.ObjectId()], userId, creatorId,
    serviceId: new Types.ObjectId(), serviceTitle: "Test", durationMinutes: 30, price: 100, currency: "INR",
    status: "CONFIRMED", paymentStatus: "PENDING", expiresAt: new Date(Date.now() + 60000),
    serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80, totalAmount: 100 });
  return { id: booking._id as Types.ObjectId, userId, creatorId, slotIds: booking.slotIds };
}
const input = (f: Awaited<ReturnType<typeof fixture>>) => ({ bookingId: String(f.id), actorId: String(f.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED });
async function complete(id: Types.ObjectId, automatic = false) {
  const session = await mongoose.startSession();
  try {
    let result: unknown;
    await session.withTransaction(async () => { result = await bookingRepository.guardConfirmedToCompleted({ bookingId: id,
      cause: automatic ? Cause.AUTO_COMPLETED : Cause.CREATOR_COMPLETED,
      actorType: automatic ? CompletionActor.SYSTEM : CompletionActor.CREATOR,
      operationKey: `booking-completion:${id}`, completedAt: new Date(), settlementEligibleAt: new Date() }, session); });
    return result;
  } finally { await session.endSession(); }
}

test("authorized claim replays without modification and rejects conflicting actors", async () => {
  const f = await fixture();
  const first = await bookingFinancialTerminationService.prepareTerminationClaim(input(f));
  const replay = await bookingFinancialTerminationService.prepareTerminationClaim(input(f));
  assert.equal(first.operationKey, replay.operationKey);
  assert.equal(first.createdAt.getTime(), replay.createdAt.getTime());
  await assert.rejects(() => bookingFinancialTerminationService.prepareTerminationClaim({ ...input(f), actorId: String(f.creatorId), actorType: Actor.CREATOR, terminationType: Intent.CREATOR_CANCELLED }));
  await assert.rejects(() => bookingFinancialTerminationService.prepareTerminationClaim({ ...input(f), actorId: String(new Types.ObjectId()) }));
  assert.equal((await bookingRepository.findTerminationClaim(f.id))?.terminationClaim?.actorId?.toString(), String(f.userId));
  assert.equal((await Booking.findById(f.id))?.terminationClaim, undefined);
});

test("active claim blocks both completion causes and release restores completion", async () => {
  const f = await fixture();
  const claim = await bookingFinancialTerminationService.prepareTerminationClaim(input(f));
  assert.equal(await complete(f.id), null);
  assert.equal(await complete(f.id, true), null);
  const session = await mongoose.startSession();
  try { await session.withTransaction(async () => {
    assert.ok(await bookingRepository.transitionTerminationClaim({ bookingId: f.id, operationKey: claim.operationKey, intent: claim.intent, actorType: claim.actorType, actorId: claim.actorId, version: claim.version, target: "RELEASED", session }));
    assert.equal(await bookingRepository.transitionTerminationClaim({ bookingId: f.id, operationKey: claim.operationKey, intent: claim.intent, actorType: claim.actorType, actorId: claim.actorId, version: claim.version, target: "RELEASED", session }), null);
  }); } finally { await session.endSession(); }
  assert.ok(await complete(f.id));
  const b = await bookingRepository.findTerminationClaim(f.id);
  assert.equal(b?.terminationClaim?.status, "RELEASED");
  assert.deepEqual(b?.slotIds.map(String), f.slotIds.map(String));
  assert.equal(b?.totalAmount, 100);
});

test("completion before claim wins; a claim before completion wins", async () => {
  const first = await fixture();
  assert.ok(await complete(first.id));
  await assert.rejects(() => bookingFinancialTerminationService.prepareTerminationClaim(input(first)));
  const second = await fixture();
  await bookingFinancialTerminationService.prepareTerminationClaim(input(second));
  assert.equal(await complete(second.id), null);
});

test("concurrent completion and claim have exactly one winner", async () => {
  for (let i = 0; i < 5; i++) {
    const f = await fixture();
    const [claimed, completed] = await Promise.allSettled([bookingFinancialTerminationService.prepareTerminationClaim(input(f)), complete(f.id)]);
    const claimWon = claimed.status === "fulfilled";
    const completeWon = completed.status === "fulfilled" && !!completed.value;
    assert.notEqual(claimWon, completeWon);
    const stored = await bookingRepository.findTerminationClaim(f.id);
    assert.equal(stored?.status, completeWon ? "COMPLETED" : "CONFIRMED");
  }
});

test("claim insertion rolls back with its transaction", async () => {
  const f = await fixture();
  const now = new Date();
  const session = await mongoose.startSession();
  try {
    await assert.rejects(() => session.withTransaction(async () => {
      assert.ok(await bookingRepository.acquireTerminationClaim({ bookingId: f.id, session, claim: { operationKey: `booking-termination:${f.id}`, status: "ACTIVE", intent: Intent.CUSTOMER_CANCELLED, actorType: Actor.CUSTOMER, actorId: f.userId, createdAt: now, updatedAt: now, version: 1 } }));
      throw new Error("rollback");
    }), /rollback/);
  } finally { await session.endSession(); }
  assert.equal((await bookingRepository.findTerminationClaim(f.id))?.terminationClaim, undefined);
  assert.ok(await complete(f.id));
});

test("finalization requires matching committed termination and preserves claim", async () => {
  const f = await fixture();
  const claim = await bookingFinancialTerminationService.prepareTerminationClaim(input(f));
  const session = await mongoose.startSession();
  try { await session.withTransaction(async () => {
    assert.equal(await bookingRepository.transitionTerminationClaim({ bookingId: f.id, operationKey: claim.operationKey, intent: claim.intent, actorType: claim.actorType, actorId: claim.actorId, version: 1, target: "FINALIZED", session }), null);
    assert.ok(await bookingRepository.transitionToTerminated({ bookingId: f.id, expectedStatuses: ["CONFIRMED"], targetStatus: "CANCELLED", terminationType: claim.intent, terminationActorType: claim.actorType, terminationActorId: claim.actorId, terminationOperationKey: claim.operationKey, terminationClaimVersion: claim.version }, session));
    assert.ok(await bookingRepository.transitionTerminationClaim({ bookingId: f.id, operationKey: claim.operationKey, intent: claim.intent, actorType: claim.actorType, actorId: claim.actorId, version: 1, target: "FINALIZED", session }));
  }); } finally { await session.endSession(); }
  assert.equal((await bookingRepository.findTerminationClaim(f.id))?.terminationClaim?.status, "FINALIZED");
  await assert.rejects(() => bookingFinancialTerminationService.prepareTerminationClaim(input(f)));
});
