import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";
import { Booking } from "../../models/booking.model";
import { Slot } from "../../models/slot.model";
import { Chat } from "../../models/chat.model";
import { BookingTerminationActorType as Actor, BookingTerminationType as Intent } from "../../enums/booking/bookingTerminationType.enum";
import { bookingRepository } from "../../repositories/booking.repository";
import { bookingFinancialTerminationService } from "../../services/financial/bookingFinancialTermination.service";
import { FINANCIAL_POLICY_VERSION } from "../../services/booking/bookingCheckoutQuote.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";

process.env.NODE_ENV = "test";
before(connectPhase7HDatabase, { timeout: 120_000 });
beforeEach(clearPhase7HDatabase);
after(disconnectPhase7HDatabase, { timeout: 30_000 });

async function fixture(hours: number, accepted = true, currency = "INR", snapshot = false) {
  const userId = new Types.ObjectId(), creatorId = new Types.ObjectId(), serviceId = new Types.ObjectId();
  const receiptAt = new Date();
  const slot = await Slot.create({ availabilityId: new Types.ObjectId(), creatorId, serviceId, startTime: new Date(receiptAt.getTime() + hours * 3600000), endTime: new Date(receiptAt.getTime() + (hours + 1) * 3600000), timezone: "UTC", status: "LOCKED", price: 100000 });
  const booking = await Booking.create({ slotIds: [slot._id], userId, creatorId, serviceId, serviceTitle: "Disposition", durationMinutes: 60, price: 100000,
    serviceAmount: 100000, platformFeeAmount: 5000, commissionAmount: 20000, creatorAmount: 80000, totalAmount: 105000, currency,
    financialPolicyVersion: FINANCIAL_POLICY_VERSION, status: accepted ? "CONFIRMED" : "REQUESTED", paymentStatus: "PENDING", expiresAt: new Date(Date.now() - 1),
    ...(snapshot ? { purchasedScheduledStart: slot.startTime } : {}),
    ...(accepted ? { creatorAcceptedAt: new Date(receiptAt.getTime() - 60000) } : {}) });
  return { booking, userId, creatorId, receiptAt };
}

test("purchased schedule snapshot remains private and immutable", async () => {
  const f = await fixture(1, true, "INR", true);
  const original = (await Booking.findById(f.booking._id).select("+purchasedScheduledStart").orFail()).purchasedScheduledStart;
  assert.ok(original);
  assert.equal((await Booking.findById(f.booking._id).orFail()).purchasedScheduledStart, undefined);
  await Booking.updateOne({ _id: f.booking._id }, { $set: { purchasedScheduledStart: new Date(original.getTime() + 3600000) } });
  await Slot.updateOne({ _id: f.booking.slotIds[0] }, { $set: { startTime: new Date(original.getTime() + 7200000) } });
  assert.equal((await Booking.findById(f.booking._id).select("+purchasedScheduledStart").orFail()).purchasedScheduledStart?.getTime(), original.getTime());
});

async function disposition(id: unknown) {
  return (await bookingRepository.findCancellationDisposition(id as Types.ObjectId))?.cancellationDisposition;
}

for (const [hours, refund, creator, platform] of [[49, 105000, 0, 0], [48, 95000, 4000, 6000], [24, 90000, 8000, 7000], [6, 80000, 16000, 9000], [1, 60000, 32000, 13000]] as const) {
  test(`frozen customer cancellation shadow at ${hours} hours reconciles`, async () => {
    const f = await fixture(hours);
    const input = { bookingId: String(f.booking._id), actorId: String(f.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED, receiptAt: f.receiptAt };
    await bookingFinancialTerminationService.terminateBookingFinancially(input);
    let saved = await disposition(f.booking._id);
    assert.equal(saved?.status, "CALCULATED");
    assert.equal(saved?.executionStatus, "NOT_EXECUTED");
    assert.equal(saved?.interactionOutcome, "NOT_QUALIFIED");
    assert.deepEqual([saved?.breakdown?.totalCustomerRefund, saved?.breakdown?.creatorEntitlement, saved?.breakdown?.sthnEntitlement], [refund, creator, platform]);
    assert.equal(saved?.receiptAt?.getTime(), f.receiptAt.getTime());
    await bookingFinancialTerminationService.terminateBookingFinancially({ ...input, receiptAt: new Date(f.receiptAt.getTime() + 1000) });
    saved = await disposition(f.booking._id);
    assert.equal(saved?.receiptAt?.getTime(), f.receiptAt.getTime());
    assert.equal(saved?.breakdown?.totalCustomerRefund, refund);
  });
}

test("qualifying interaction is frozen with creator and platform allocations", async () => {
  const f = await fixture(1);
  await Chat.create({ bookingId: f.booking._id, senderId: f.userId, senderRole: "USER", message: "Hi", createdAt: new Date(f.receiptAt.getTime() - 1000) });
  await Chat.create({ bookingId: f.booking._id, senderId: f.creatorId, senderRole: "CREATOR", message: "Hello", createdAt: new Date(f.receiptAt.getTime() - 1000) });
  await bookingFinancialTerminationService.terminateBookingFinancially({ bookingId: String(f.booking._id), actorId: String(f.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED, receiptAt: f.receiptAt });
  const saved = await disposition(f.booking._id);
  assert.equal(saved?.interactionOutcome, "QUALIFIED");
  assert.deepEqual([saved?.breakdown?.totalCustomerRefund, saved?.breakdown?.creatorEntitlement, saved?.breakdown?.sthnEntitlement], [45000, 44000, 16000]);
});

test("pre-acceptance, rejection and expiry remain full refunds", async () => {
  for (const scenario of ["customer", "rejection", "expiry"] as const) {
    const f = await fixture(1, false);
    const input = scenario === "customer" ? { actorId: String(f.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED, receiptAt: f.receiptAt } : scenario === "rejection" ? { actorId: String(f.creatorId), actorType: Actor.CREATOR, terminationType: Intent.CREATOR_REJECTED } : { actorType: Actor.SYSTEM, terminationType: Intent.BOOKING_EXPIRED };
    await bookingFinancialTerminationService.terminateBookingFinancially({ bookingId: String(f.booking._id), ...input });
    assert.equal((await disposition(f.booking._id))?.breakdown?.totalCustomerRefund, 105000);
  }
});

test("governance is pending, without inventing a customer policy scenario", async () => {
  const f = await fixture(1);
  await bookingFinancialTerminationService.terminateBookingFinancially({ bookingId: String(f.booking._id), actorId: String(new Types.ObjectId()), actorType: Actor.GOVERNANCE, terminationType: Intent.GOVERNANCE_TERMINATED });
  const saved = await disposition(f.booking._id);
  assert.equal(saved?.status, "PENDING");
  assert.equal(saved?.reason, "SCENARIO_REQUIRES_AUTHORIZATION");
  assert.equal(saved?.breakdown, undefined);
});

test("insufficient interaction evidence remains distinct and does not add interaction deductions", async () => {
  const f = await fixture(1);
  await Chat.collection.insertOne({ bookingId: f.booking._id, senderId: f.userId, senderRole: "USER", type: "text", message: "timestamp unavailable" });
  await bookingFinancialTerminationService.terminateBookingFinancially({ bookingId: String(f.booking._id), actorId: String(f.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED, receiptAt: f.receiptAt });
  const saved = await disposition(f.booking._id);
  assert.equal(saved?.interactionOutcome, "INSUFFICIENT_EVIDENCE");
  assert.equal(saved?.breakdown?.interactionDeduction, 0);
  assert.equal(saved?.breakdown?.totalCustomerRefund, 60000);
});

test("creator cancellation with interaction retains the calculated policy amount", async () => {
  const f = await fixture(1);
  await Chat.create({ bookingId: f.booking._id, senderId: f.userId, senderRole: "USER", message: "Hi", createdAt: new Date(f.receiptAt.getTime() - 1000) });
  await Chat.create({ bookingId: f.booking._id, senderId: f.creatorId, senderRole: "CREATOR", message: "Hi", createdAt: new Date(f.receiptAt.getTime() - 1000) });
  await bookingFinancialTerminationService.terminateBookingFinancially({ bookingId: String(f.booking._id), actorId: String(f.creatorId), actorType: Actor.CREATOR, terminationType: Intent.CREATOR_CANCELLED, receiptAt: f.receiptAt });
  const saved = await disposition(f.booking._id);
  assert.deepEqual([saved?.breakdown?.totalCustomerRefund, saved?.breakdown?.creatorEntitlement, saved?.breakdown?.sthnEntitlement], [85000, 0, 20000]);
});

test("corrupt original pricing cannot produce a calculated shadow", async () => {
  const f = await fixture(1);
  await Booking.collection.updateOne({ _id: f.booking._id }, { $set: { totalAmount: 105001 } });
  await bookingFinancialTerminationService.terminateBookingFinancially({ bookingId: String(f.booking._id), actorId: String(f.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED, receiptAt: f.receiptAt });
  const saved = await disposition(f.booking._id);
  assert.equal(saved?.status, "PENDING");
  assert.equal(saved?.reason, "INVALID_PRICING_SNAPSHOT");
  assert.equal(saved?.breakdown, undefined);
});

test("zero-decimal currency retains minor-unit calculations", async () => {
  const f = await fixture(1, true, "JPY");
  await bookingFinancialTerminationService.terminateBookingFinancially({ bookingId: String(f.booking._id), actorId: String(f.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED, receiptAt: f.receiptAt });
  const saved = await disposition(f.booking._id);
  assert.equal(saved?.breakdown?.currency, "JPY");
  assert.equal(saved?.currencyMinorUnits, 0);
  assert.equal(saved?.breakdown?.totalCustomerRefund, 60000);
});

test("a conflicting disposition cannot overwrite the frozen operation identity", async () => {
  const f = await fixture(1);
  await bookingFinancialTerminationService.terminateBookingFinancially({ bookingId: String(f.booking._id), actorId: String(f.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED, receiptAt: f.receiptAt });
  const original = await disposition(f.booking._id);
  assert.ok(original);
  const conflicting = { ...original, actorType: Actor.CREATOR, actorId: f.creatorId, intent: Intent.CREATOR_CANCELLED };
  assert.equal(await bookingRepository.admitCancellationDisposition(f.booking._id as Types.ObjectId, conflicting), null);
  const saved = await disposition(f.booking._id);
  assert.equal(saved?.actorType, Actor.CUSTOMER);
  assert.equal(saved?.operationKey, original.operationKey);
  assert.equal(saved?.breakdown?.totalCustomerRefund, original.breakdown?.totalCustomerRefund);
});

test("a shadow-persistence error does not enforce new money movement rules", async (context) => {
  const f = await fixture(1);
  context.mock.method(bookingRepository, "admitCancellationDisposition", async () => { throw new Error("shadow store unavailable"); });
  await bookingFinancialTerminationService.terminateBookingFinancially({ bookingId: String(f.booking._id), actorId: String(f.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED, receiptAt: f.receiptAt });
  assert.equal((await Booking.findById(f.booking._id).orFail()).status, "CANCELLED");
  assert.equal(await disposition(f.booking._id), undefined);
});
