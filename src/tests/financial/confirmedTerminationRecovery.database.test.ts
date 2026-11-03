import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose, { Types } from "mongoose";
import { Booking } from "../../models/booking.model";
import { Chat } from "../../models/chat.model";
import { Refund } from "../../models/refund.model";
import { Slot } from "../../models/slot.model";
import { FINANCIAL_POLICY_VERSION } from "../../services/booking/bookingCheckoutQuote.service";
import { TerminationProviderOperation } from "../../models/terminationProviderOperation.model";
import { bookingRepository } from "../../repositories/booking.repository";
import { BookingFinancialTerminationService, bookingFinancialTerminationService } from "../../services/financial/bookingFinancialTermination.service";
import { paymentService } from "../../services/financial/payment.service";
import { paymentLifecycleService } from "../../services/financial/paymentLifecycle.service";
import { internalPaymentProvider } from "../../services/financial/providers/internal.provider";
import { marketplacePricingService } from "../../services/financial/marketplacePricing.service";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { BookingTerminationActorType as Actor, BookingTerminationType as Intent } from "../../enums/booking/bookingTerminationType.enum";
import { BookingCompletionActorType as CompletionActor, BookingWalletCaptureCause as Cause } from "../../enums/financial/bookingWalletCaptureCause.enum";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";
import { createActors } from "./phase7h/fixtures/topUpFixtures";
import { paymentProviderRegistry } from "../../services/financial/paymentProviderRegistry.service";
import { TerminationEvidenceRequest } from "../../contracts/financial/paymentProvider.types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expireBookingsJob } from "../../jobs/expireBookings.job";
import { bookingFinancialSettlementService } from "../../services/financial/bookingFinancialSettlement.service";
import { Settlement } from "../../models/settlement.model";

process.env.NODE_ENV = "test";
before(async () => { await connectPhase7HDatabase(); await TerminationProviderOperation.init(); }, { timeout: 120_000 });
beforeEach(clearPhase7HDatabase);
after(disconnectPhase7HDatabase, { timeout: 30_000 });

async function fixture(captured: boolean) {
  const actors = await createActors();
  const pricing = marketplacePricingService.calculate({ serviceAmount: 1200, currency: "INR" });
  const booking = await Booking.create({ slotIds: [new Types.ObjectId()], userId: actors.userId, creatorId: actors.creatorId, serviceId: new Types.ObjectId(), serviceTitle: "Recovery", durationMinutes: 30, price: 1200, ...pricing, currency: "INR", status: "CONFIRMED", paymentStatus: "PENDING", paymentMethod: PaymentMethod.INTERNAL, expiresAt: new Date(Date.now() + 60000) });
  const payment = await paymentService.createPayment({ bookingId: String(booking._id), userId: String(actors.userId), creatorId: String(actors.creatorId), serviceAmount: { amount: 1200, currency: "INR" }, provider: PaymentProvider.INTERNAL, method: PaymentMethod.INTERNAL, idempotencyKey: `recovery:${booking._id}` });
  booking.paymentId = payment._id as Types.ObjectId;
  await booking.save();
  if (captured) await paymentLifecycleService.completePaymentLifecycle(String(payment._id));
  else await paymentLifecycleService.initializeExistingPayment(String(payment._id));
  return { booking, actors, payment };
}

test("unreferenced provider payment blocks termination until its outcome is reconciled", async () => {
  const actors = await createActors();
  const pricing = marketplacePricingService.calculate({ serviceAmount: 1200, currency: "INR" });
  const booking = await Booking.create({ slotIds: [new Types.ObjectId()], userId: actors.userId, creatorId: actors.creatorId, serviceId: new Types.ObjectId(), serviceTitle: "Pending", durationMinutes: 30, price: 1200, ...pricing, currency: "INR", status: "CONFIRMED", paymentStatus: "PENDING", paymentMethod: PaymentMethod.INTERNAL, expiresAt: new Date(Date.now() + 60000) });
  const payment = await paymentService.createPayment({ bookingId: String(booking._id), userId: String(actors.userId), creatorId: String(actors.creatorId), serviceAmount: { amount: 1200, currency: "INR" }, provider: PaymentProvider.INTERNAL, method: PaymentMethod.INTERNAL });
  booking.paymentId = payment._id as Types.ObjectId;
  await booking.save();
  await assert.rejects(bookingFinancialTerminationService.terminateBookingFinancially({ bookingId: String(booking._id), actorId: String(actors.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED, receiptAt: new Date() }), /requires reconciliation/);
  assert.equal((await Booking.findById(booking._id).orFail()).status, "CONFIRMED");
  assert.equal((await paymentService.getPayment(String(payment._id))).status, "CREATED");
});

test("completed provider booking cannot enter legacy financial settlement", async () => {
  const f = await fixture(true);
  await Booking.updateOne({ _id: f.booking._id }, { $set: { status: "COMPLETED", completedAt: new Date(Date.now() - 60000), settlementEligibleAt: new Date(Date.now() - 1000) } });
  await assert.rejects(bookingFinancialSettlementService.settleBooking(String(f.booking._id)), /settlement is not enabled/);
  assert.equal(await Settlement.countDocuments({ bookingId: f.booking._id }), 0);
});

test("confirmed refund survives transaction abort and retry does not call provider twice", async (context) => {
  const f = await fixture(true);
  const originalRefund = internalPaymentProvider.createRefund.bind(internalPaymentProvider);
  let refundCalls = 0;
  context.mock.method(internalPaymentProvider, "createRefund", async (...args: Parameters<typeof internalPaymentProvider.createRefund>) => { refundCalls++; return originalRefund(...args); });
  const originalTransition = bookingRepository.transitionToTerminated.bind(bookingRepository);
  let inject = true;
  context.mock.method(bookingRepository, "transitionToTerminated", async (...args: Parameters<typeof bookingRepository.transitionToTerminated>) => {
    if (inject) { inject = false; throw new Error("injected termination abort"); }
    return originalTransition(...args);
  });
  const cutoff = new Date();
  const input = { bookingId: String(f.booking._id), actorId: String(f.actors.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED, receiptAt: cutoff };
  await assert.rejects(() => bookingFinancialTerminationService.terminateBookingFinancially(input), /injected termination abort/);
  assert.equal(refundCalls, 1);
  assert.equal((await TerminationProviderOperation.findOne({ bookingId: f.booking._id }))?.status, "CONFIRMED");
  const frozenDisposition = (await bookingRepository.findCancellationDisposition(f.booking._id as Types.ObjectId))?.cancellationDisposition;
  assert.equal(frozenDisposition?.executionStatus, "NOT_EXECUTED");
  const afterAbort = await bookingRepository.findTerminationClaim(f.booking._id as Types.ObjectId);
  assert.equal(afterAbort?.status, "CONFIRMED");
  assert.equal(afterAbort?.terminationClaim?.status, "ACTIVE");
  const pending = (await bookingRepository.findTerminationEvidence(f.booking._id as Types.ObjectId))?.terminationEvidence;
  assert.equal(pending?.status, "PENDING");
  assert.equal(pending?.receiptAt?.getTime(), cutoff.getTime());
  const session = await mongoose.startSession();
  try {
    let completion: unknown;
    await session.withTransaction(async () => { completion = await bookingRepository.guardConfirmedToCompleted({ bookingId: f.booking._id as Types.ObjectId, cause: Cause.CREATOR_COMPLETED, actorType: CompletionActor.CREATOR, operationKey: `booking-completion:${f.booking._id}`, completedAt: new Date(), settlementEligibleAt: new Date() }, session); });
    assert.equal(completion, null);
    const claim = afterAbort!.terminationClaim!;
    await session.withTransaction(async () => { assert.equal(await bookingRepository.transitionTerminationClaim({ bookingId: f.booking._id as Types.ObjectId, operationKey: claim.operationKey, intent: claim.intent, actorType: claim.actorType, actorId: claim.actorId, version: claim.version, target: "RELEASED", session }), null); });
    await session.withTransaction(async () => { assert.equal(await bookingRepository.transitionToTerminated({ bookingId: f.booking._id as Types.ObjectId, expectedStatuses: ["CONFIRMED"], targetStatus: "CANCELLED", terminationType: claim.intent, terminationActorType: claim.actorType, terminationActorId: claim.actorId, terminationOperationKey: claim.operationKey }, session), null); });
  } finally { await session.endSession(); }
  await assert.rejects(() => bookingFinancialTerminationService.terminateBookingFinancially({ ...input, actorType: Actor.CREATOR, actorId: String(f.actors.creatorId), terminationType: Intent.CREATOR_CANCELLED }));
  await bookingFinancialTerminationService.terminateBookingFinancially(input);
  assert.equal(refundCalls, 1);
  assert.equal((await bookingRepository.findCancellationDisposition(f.booking._id as Types.ObjectId))?.cancellationDisposition?.recordedAt.getTime(), frozenDisposition?.recordedAt.getTime());
  assert.equal((await TerminationProviderOperation.findOne({ bookingId: f.booking._id }))?.status, "FINALIZED");
  const final = await bookingRepository.findTerminationClaim(f.booking._id as Types.ObjectId);
  assert.equal(final?.status, "CANCELLED");
  assert.equal(final?.terminationClaim?.status, "FINALIZED");
  const finalized = (await bookingRepository.findTerminationEvidence(f.booking._id as Types.ObjectId))?.terminationEvidence;
  assert.equal(finalized?.status, "FINALIZED");
  assert.equal(finalized?.receiptAt?.getTime(), cutoff.getTime());
  await bookingFinancialTerminationService.terminateBookingFinancially(input);
  assert.equal(refundCalls, 1);
});

test("calculated provider shadow survives local abort without changing the full refund", async (context) => {
  const f = await fixture(true);
  const cutoff = new Date();
  const slot = await Slot.create({ availabilityId: new Types.ObjectId(), creatorId: f.actors.creatorId, serviceId: f.booking.serviceId,
    startTime: new Date(cutoff.getTime() + 3600000), endTime: new Date(cutoff.getTime() + 7200000), timezone: "UTC", status: "BOOKED", price: 1200 });
  await Booking.collection.updateOne({ _id: f.booking._id }, { $set: { slotIds: [slot._id], financialPolicyVersion: FINANCIAL_POLICY_VERSION, creatorAcceptedAt: new Date(cutoff.getTime() - 60000) } });
  const refund = internalPaymentProvider.createRefund.bind(internalPaymentProvider);
  let calls = 0;
  context.mock.method(internalPaymentProvider, "createRefund", async (...args: Parameters<typeof refund>) => { calls++; return refund(...args); });
  const transition = bookingRepository.transitionToTerminated.bind(bookingRepository);
  let fail = true;
  context.mock.method(bookingRepository, "transitionToTerminated", async (...args: Parameters<typeof transition>) => { if (fail) { fail = false; throw new Error("local abort"); } return transition(...args); });
  const input = { bookingId: String(f.booking._id), actorId: String(f.actors.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED, receiptAt: cutoff };
  await assert.rejects(() => bookingFinancialTerminationService.terminateBookingFinancially(input), /local abort/);
  const shadow = (await bookingRepository.findCancellationDisposition(f.booking._id as Types.ObjectId))?.cancellationDisposition;
  assert.equal(shadow?.status, "CALCULATED");
  assert.equal(shadow?.executionStatus, "NOT_EXECUTED");
  assert.equal(shadow?.breakdown?.totalCustomerRefund, 720);
  await Slot.updateOne({ _id: slot._id }, { $set: { startTime: new Date(cutoff.getTime() + 100 * 3600000) } });
  await bookingFinancialTerminationService.terminateBookingFinancially(input);
  const replay = (await bookingRepository.findCancellationDisposition(f.booking._id as Types.ObjectId))?.cancellationDisposition;
  assert.equal(replay?.breakdown?.totalCustomerRefund, 720);
  assert.equal((await Refund.findOne({ paymentId: f.payment._id }).orFail()).amount, f.payment.amount);
  assert.equal(calls, 1);
});

test("a simultaneous identical canonical request cannot dispatch twice", async (context) => {
  const f = await fixture(false);
  const original = internalPaymentProvider.cancelPayment.bind(internalPaymentProvider);
  let entered!: () => void;
  let release!: () => void;
  const dispatchEntered = new Promise<void>((resolve) => { entered = resolve; });
  const continueDispatch = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  context.mock.method(internalPaymentProvider, "cancelPayment", async (...args: Parameters<typeof internalPaymentProvider.cancelPayment>) => {
    calls++;
    assert.equal((await bookingRepository.findTerminationClaim(f.booking._id as Types.ObjectId))?.terminationClaim?.status, "ACTIVE");
    assert.equal((await TerminationProviderOperation.findOne({ bookingId: f.booking._id }))?.status, "IN_FLIGHT");
    entered();
    await continueDispatch;
    return original(...args);
  });
  const cutoff = new Date();
  const input = { bookingId: String(f.booking._id), actorId: String(f.actors.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED, receiptAt: cutoff };
  const first = bookingFinancialTerminationService.terminateBookingFinancially(input);
  try {
    await dispatchEntered;
    await assert.rejects(() => bookingFinancialTerminationService.terminateBookingFinancially({ ...input, receiptAt: new Date(cutoff.getTime() + 5000) }), /reconciliation|progress/);
  } finally { release(); }
  await first;
  assert.equal(calls, 1);
  assert.equal((await bookingRepository.findTerminationEvidence(f.booking._id as Types.ObjectId))?.terminationEvidence?.receiptAt?.getTime(), cutoff.getTime());
  assert.equal(await TerminationProviderOperation.countDocuments({ bookingId: f.booking._id }), 1);
});

test("ambiguous provider cancellation blocks redispatch", async (context) => {
  const f = await fixture(false);
  let calls = 0;
  context.mock.method(internalPaymentProvider, "cancelPayment", async () => { calls++; throw new Error("provider timeout"); });
  const input = { bookingId: String(f.booking._id), actorId: String(f.actors.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED };
  await assert.rejects(() => bookingFinancialTerminationService.terminateBookingFinancially(input), /requires reconciliation/);
  assert.equal((await TerminationProviderOperation.findOne({ bookingId: f.booking._id }))?.status, "UNKNOWN");
  await assert.rejects(() => bookingFinancialTerminationService.terminateBookingFinancially(input), /requires reconciliation/);
  await assert.rejects(() => bookingFinancialTerminationService.terminateBookingFinancially(input), /requires reconciliation/);
  assert.equal(calls, 1);
  assert.equal((await bookingRepository.findTerminationClaim(f.booking._id as Types.ObjectId))?.terminationClaim?.status, "ACTIVE");
  assert.equal((await bookingRepository.findTerminationEvidence(f.booking._id as Types.ObjectId))?.terminationEvidence?.status, "PENDING");
  assert.equal((await bookingRepository.findCancellationDisposition(f.booking._id as Types.ObjectId))?.cancellationDisposition?.executionStatus, "NOT_EXECUTED");
});

test("provider evidence promotion and claim finalization roll back together", async (context) => {
  const f = await fixture(false);
  const cancel = internalPaymentProvider.cancelPayment.bind(internalPaymentProvider);
  let calls = 0;
  context.mock.method(internalPaymentProvider, "cancelPayment", async (...args: Parameters<typeof cancel>) => { calls++; return cancel(...args); });
  const promote = bookingRepository.finalizeTerminationEvidence.bind(bookingRepository);
  let fail = true;
  context.mock.method(bookingRepository, "finalizeTerminationEvidence", async (...args: Parameters<typeof promote>) => {
    const result = await promote(...args);
    if (fail) { fail = false; throw new Error("injected promotion failure"); }
    return result;
  });
  const input = { bookingId: String(f.booking._id), actorId: String(f.actors.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED, receiptAt: new Date() };
  await assert.rejects(() => bookingFinancialTerminationService.terminateBookingFinancially(input), /injected promotion failure/);
  assert.equal((await bookingRepository.findTerminationClaim(f.booking._id as Types.ObjectId))?.terminationClaim?.status, "ACTIVE");
  assert.equal((await bookingRepository.findTerminationEvidence(f.booking._id as Types.ObjectId))?.terminationEvidence?.status, "PENDING");
  assert.equal((await TerminationProviderOperation.findOne({ bookingId: f.booking._id }))?.status, "CONFIRMED");
  await bookingFinancialTerminationService.terminateBookingFinancially(input);
  assert.equal((await bookingRepository.findTerminationEvidence(f.booking._id as Types.ObjectId))?.terminationEvidence?.status, "FINALIZED");
  assert.equal(calls, 1);
});

for (const scenario of ["qualified", "one-sided", "historical"] as const) {
  test(`finalized customer termination records ${scenario} interaction without changing refund amounts`, async () => {
    const f = await fixture(true);
    if (scenario !== "historical") {
      await Booking.updateOne({ _id: f.booking._id }, { $set: { creatorAcceptedAt: new Date(Date.now() - 60000) } });
      await Chat.create({ bookingId: f.booking._id, senderId: f.actors.userId, senderRole: "USER", message: "Hi" });
      if (scenario === "qualified") await Chat.create({ bookingId: f.booking._id, senderId: f.actors.creatorId, senderRole: "CREATOR", message: "Hello" });
    }
    const cutoff = new Date();
    const input = { bookingId: String(f.booking._id), actorId: String(f.actors.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED, receiptAt: cutoff };
    await bookingFinancialTerminationService.terminateBookingFinancially(input);
    let evidence = (await bookingRepository.findTerminationEvidence(f.booking._id as Types.ObjectId))?.terminationEvidence;
    assert.equal(evidence?.status, "FINALIZED");
    assert.equal(evidence?.outcome, scenario === "qualified" ? "QUALIFIED" : scenario === "one-sided" ? "NOT_QUALIFIED" : "INSUFFICIENT_EVIDENCE");
    assert.equal(evidence?.receiptAt?.getTime(), cutoff.getTime());
    const payment = await (await import("../../repositories/payment.repository")).paymentRepository.findById(f.payment._id as Types.ObjectId);
    assert.equal(payment?.amount, f.payment.amount);
    const refund = await Refund.findOne({ paymentId: f.payment._id }).orFail();
    assert.equal(refund.amount, f.payment.amount);
    await Chat.create({ bookingId: f.booking._id, senderId: f.actors.creatorId, senderRole: "CREATOR", message: "later", createdAt: new Date(cutoff.getTime() + 1000) });
    await bookingFinancialTerminationService.terminateBookingFinancially({ ...input, receiptAt: new Date(cutoff.getTime() + 2000) });
    evidence = (await bookingRepository.findTerminationEvidence(f.booking._id as Types.ObjectId))?.terminationEvidence;
    assert.equal(evidence?.receiptAt?.getTime(), cutoff.getTime());
    assert.equal(evidence?.outcome, scenario === "qualified" ? "QUALIFIED" : scenario === "one-sided" ? "NOT_QUALIFIED" : "INSUFFICIENT_EVIDENCE");
  });
}

test("legacy participant-only evidence is preserved but never promoted", async () => {
  const f = await fixture(false);
  const legacy = { operationKey: `booking-termination:${f.booking._id}`, actorId: f.actors.userId, actorType: "CUSTOMER", intent: "CUSTOMER_CANCELLED", receiptAt: new Date(Date.now() - 5000), receiptOrder: "UNVERIFIED", eligibility: "PARTICIPANT_STATE_ONLY", version: "CANCELLATION_EVIDENCE_V2", outcome: "NOT_QUALIFIED", reason: "NO_TWO_WAY_MESSAGES", candidateMessageIds: [], recordedAt: new Date() };
  await Booking.updateOne({ _id: f.booking._id }, { $set: { cancellationEvidence: legacy } });
  await bookingFinancialTerminationService.terminateBookingFinancially({ bookingId: String(f.booking._id), actorId: String(f.actors.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED, receiptAt: new Date() });
  const stored = await Booking.findById(f.booking._id).select("+cancellationEvidence +terminationEvidence").orFail();
  assert.equal(stored.cancellationEvidence?.version, "CANCELLATION_EVIDENCE_V2");
  assert.equal(stored.cancellationEvidence?.receiptAt.getTime(), legacy.receiptAt.getTime());
  assert.equal(stored.cancellationEvidence?.eligibility, "PARTICIPANT_STATE_ONLY");
  assert.equal(stored.terminationEvidence?.status, "FINALIZED");
});

test("unauthorized and ineligible terminations create no operation-bound evidence", async () => {
  const f = await fixture(false);
  const input = { bookingId: String(f.booking._id), actorId: String(new Types.ObjectId()), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED, receiptAt: new Date() };
  await assert.rejects(() => bookingFinancialTerminationService.terminateBookingFinancially(input));
  await Booking.updateOne({ _id: f.booking._id }, { $set: { status: "COMPLETED" } });
  await assert.rejects(() => bookingFinancialTerminationService.terminateBookingFinancially({ ...input, actorId: String(f.actors.userId) }));
  assert.equal((await bookingRepository.findTerminationEvidence(f.booking._id as Types.ObjectId))?.terminationEvidence, undefined);
});

test("recovery of an older claim without an admitted receipt preserves uncertainty", async () => {
  const f = await fixture(false);
  const now = new Date();
  assert.ok(await bookingRepository.acquireTerminationClaim({ bookingId: f.booking._id as Types.ObjectId, claim: {
    operationKey: `booking-termination:${f.booking._id}`, status: "ACTIVE", intent: Intent.CUSTOMER_CANCELLED,
    actorType: Actor.CUSTOMER, actorId: f.actors.userId, paymentId: f.payment._id as Types.ObjectId,
    createdAt: now, updatedAt: now, version: 1,
  } }));
  await bookingFinancialTerminationService.terminateBookingFinancially({ bookingId: String(f.booking._id), actorId: String(f.actors.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED, receiptAt: new Date() });
  const evidence = (await bookingRepository.findTerminationEvidence(f.booking._id as Types.ObjectId))?.terminationEvidence;
  assert.equal(evidence?.outcome, "INSUFFICIENT_EVIDENCE");
  assert.equal(evidence?.reason, "ORIGINAL_RECEIPT_UNAVAILABLE");
  assert.equal(evidence?.receiptAt, undefined);
});

test("lost cancellation response reconciles persisted provider evidence after service reload", async (context) => {
  const f = await fixture(false);
  const original = internalPaymentProvider.cancelPayment.bind(internalPaymentProvider);
  let calls = 0;
  context.mock.method(internalPaymentProvider, "cancelPayment", async (...args: Parameters<typeof internalPaymentProvider.cancelPayment>) => { calls++; await original(...args); throw new Error("lost response"); });
  const input = { bookingId: String(f.booking._id), actorId: String(f.actors.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED };
  await assert.rejects(() => bookingFinancialTerminationService.terminateBookingFinancially(input), /requires reconciliation/);
  assert.equal((await TerminationProviderOperation.findOne({ bookingId: f.booking._id }))?.status, "UNKNOWN");
  await new BookingFinancialTerminationService().terminateBookingFinancially(input);
  assert.equal(calls, 1);
  assert.equal((await TerminationProviderOperation.findOne({ bookingId: f.booking._id }))?.status, "FINALIZED");
});

test("unknown refund stays blocked across service reload without another provider call", async (context) => {
  const f = await fixture(true);
  const original = internalPaymentProvider.createRefund.bind(internalPaymentProvider);
  let calls = 0;
  context.mock.method(internalPaymentProvider, "createRefund", async (...args: Parameters<typeof internalPaymentProvider.createRefund>) => { calls++; await original(...args); throw new Error("lost refund response"); });
  const input = { bookingId: String(f.booking._id), actorId: String(f.actors.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED };
  await assert.rejects(() => bookingFinancialTerminationService.terminateBookingFinancially(input), /requires reconciliation/);
  const session = await mongoose.startSession();
  try {
    const claim = (await bookingRepository.findTerminationClaim(f.booking._id as Types.ObjectId))!.terminationClaim!;
    await session.withTransaction(async () => { assert.equal(await bookingRepository.transitionTerminationClaim({ bookingId: f.booking._id as Types.ObjectId, operationKey: claim.operationKey, intent: claim.intent, actorType: claim.actorType, actorId: claim.actorId, version: claim.version, target: "RELEASED", session }), null); });
  } finally { await session.endSession(); }
  await assert.rejects(() => new BookingFinancialTerminationService().terminateBookingFinancially(input), /requires reconciliation/);
  assert.equal(calls, 1);
  assert.equal((await TerminationProviderOperation.findOne({ bookingId: f.booking._id }))?.status, "UNKNOWN");
});

test("provider cancellation succeeds through claim-backed path once", async (context) => {
  const f = await fixture(false);
  const original = internalPaymentProvider.cancelPayment.bind(internalPaymentProvider);
  let calls = 0;
  context.mock.method(internalPaymentProvider, "cancelPayment", async (...args: Parameters<typeof internalPaymentProvider.cancelPayment>) => { calls++; return original(...args); });
  const input = { bookingId: String(f.booking._id), actorId: String(f.actors.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED };
  await bookingFinancialTerminationService.terminateBookingFinancially(input);
  await bookingFinancialTerminationService.terminateBookingFinancially(input);
  assert.equal(calls, 1);
  assert.equal((await TerminationProviderOperation.findOne({ bookingId: f.booking._id }))?.status, "FINALIZED");
});

test("expiry job uses the claim-backed provider boundary with a system actor", async (context) => {
  const f = await fixture(false);
  await Booking.updateOne({ _id: f.booking._id }, { $set: { status: "REQUESTED", expiresAt: new Date(Date.now() - 1000) } });
  const original = internalPaymentProvider.cancelPayment.bind(internalPaymentProvider);
  let calls = 0;
  context.mock.method(internalPaymentProvider, "cancelPayment", async (...args: Parameters<typeof internalPaymentProvider.cancelPayment>) => { calls++; return original(...args); });
  await expireBookingsJob();
  await expireBookingsJob();
  const claim = (await bookingRepository.findTerminationClaim(f.booking._id as Types.ObjectId))?.terminationClaim;
  assert.equal(claim?.actorType, Actor.SYSTEM);
  assert.equal(claim?.actorId, undefined);
  assert.equal(claim?.status, "FINALIZED");
  assert.equal(calls, 1);
});

for (const scenario of ["creator", "rejection", "expiry", "admin", "governance"] as const) {
  test(`canonical provider claim preserves ${scenario} actor and intent`, async (context) => {
    const f = await fixture(false);
    if (scenario === "rejection" || scenario === "expiry") await Booking.updateOne({ _id: f.booking._id }, { $set: { status: "REQUESTED", expiresAt: new Date(Date.now() - 1000) } });
    const operatorId = new Types.ObjectId();
    const actorType = scenario === "creator" || scenario === "rejection" ? Actor.CREATOR : scenario === "expiry" ? Actor.SYSTEM : scenario === "admin" ? Actor.ADMIN : Actor.GOVERNANCE;
    const terminationType = scenario === "creator" ? Intent.CREATOR_CANCELLED : scenario === "rejection" ? Intent.CREATOR_REJECTED : scenario === "expiry" ? Intent.BOOKING_EXPIRED : scenario === "admin" ? Intent.ADMIN_CANCELLED : Intent.GOVERNANCE_TERMINATED;
    const actorId = actorType === Actor.SYSTEM ? undefined : actorType === Actor.CREATOR ? String(f.actors.creatorId) : String(operatorId);
    const original = internalPaymentProvider.cancelPayment.bind(internalPaymentProvider);
    let calls = 0;
    context.mock.method(internalPaymentProvider, "cancelPayment", async (...args: Parameters<typeof internalPaymentProvider.cancelPayment>) => { calls++; return original(...args); });
    await bookingFinancialTerminationService.terminateBookingFinancially({ bookingId: String(f.booking._id), actorType, actorId, terminationType });
    const result = await bookingRepository.findTerminationClaim(f.booking._id as Types.ObjectId);
    assert.equal(result?.status, scenario === "expiry" ? "EXPIRED" : scenario === "rejection" ? "REJECTED" : "CANCELLED");
    assert.equal(result?.terminationClaim?.actorType, actorType);
    assert.equal(String(result?.terminationClaim?.actorId ?? ""), actorId ?? "");
    const evidence = (await bookingRepository.findTerminationEvidence(f.booking._id as Types.ObjectId))?.terminationEvidence;
    assert.equal(evidence?.status, "FINALIZED");
    assert.equal(evidence?.actorType, actorType);
    assert.equal(String(evidence?.actorId ?? ""), actorId ?? "");
    assert.equal(calls, 1);
  });
}

for (const competitor of ["creator", "governance"] as const) {
  test(`competing customer and ${competitor} canonical claims produce at most one provider mutation`, async (context) => {
    const f = await fixture(false);
    const original = internalPaymentProvider.cancelPayment.bind(internalPaymentProvider);
    let calls = 0;
    context.mock.method(internalPaymentProvider, "cancelPayment", async (...args: Parameters<typeof internalPaymentProvider.cancelPayment>) => { calls++; return original(...args); });
    const customer = { bookingId: String(f.booking._id), actorType: Actor.CUSTOMER, actorId: String(f.actors.userId), terminationType: Intent.CUSTOMER_CANCELLED };
    const other = competitor === "creator" ? { bookingId: customer.bookingId, actorType: Actor.CREATOR, actorId: String(f.actors.creatorId), terminationType: Intent.CREATOR_CANCELLED } : { bookingId: customer.bookingId, actorType: Actor.GOVERNANCE, actorId: String(new Types.ObjectId()), terminationType: Intent.GOVERNANCE_TERMINATED };
    const results = await Promise.allSettled([customer, other].map((input) => bookingFinancialTerminationService.terminateBookingFinancially(input)));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(calls, 1);
    assert.equal(await TerminationProviderOperation.countDocuments({ bookingId: f.booking._id }), 1);
  });
}

test("provider-neutral orchestration accepts an alternative evidence adapter", async () => {
  const f = await fixture(false);
  let mutations = 0;
  const fake = new Proxy(internalPaymentProvider, { get(target, key, receiver) {
    if (key === "cancelPayment") return async (request: { providerPaymentId: string }) => { mutations++; return { providerPaymentId: request.providerPaymentId, providerStatus: "CANCELLED" }; };
    if (key === "getTerminationEvidence") return async (request: TerminationEvidenceRequest) => ({ outcome: "VERIFIED" as const, kind: request.kind, paymentId: request.paymentId, providerPaymentId: request.providerPaymentId, amount: request.amount, providerStatus: request.kind === "PAYMENT" ? "CREATED" : "CANCELLED", result: request.kind === "PAYMENT" ? "PENDING" as const : "SUCCESS" as const });
    return Reflect.get(target, key, receiver);
  } });
  paymentProviderRegistry.register(fake);
  try {
    const input = { bookingId: String(f.booking._id), actorId: String(f.actors.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED };
    await bookingFinancialTerminationService.terminateBookingFinancially(input);
    await bookingFinancialTerminationService.terminateBookingFinancially(input);
    assert.equal(mutations, 1);
  } finally { paymentProviderRegistry.register(internalPaymentProvider); }
});

for (const field of ["providerPaymentId", "amount", "currency"] as const) {
  test(`mismatched ${field} evidence cannot confirm provider cancellation`, async (context) => {
    const f = await fixture(false);
    const original = internalPaymentProvider.getTerminationEvidence.bind(internalPaymentProvider);
    context.mock.method(internalPaymentProvider, "getTerminationEvidence", async (request: TerminationEvidenceRequest) => {
      const evidence = await original(request);
      if (request.kind !== "CANCEL" || evidence.outcome !== "VERIFIED") return evidence;
      return field === "providerPaymentId" ? { ...evidence, providerPaymentId: "wrong" } : { ...evidence, amount: { ...evidence.amount, ...(field === "amount" ? { amount: evidence.amount.amount + 1 } : { currency: "USD" as const }) } };
    });
    let calls = 0;
    const cancel = internalPaymentProvider.cancelPayment.bind(internalPaymentProvider);
    context.mock.method(internalPaymentProvider, "cancelPayment", async (...args: Parameters<typeof internalPaymentProvider.cancelPayment>) => { calls++; return cancel(...args); });
    const input = { bookingId: String(f.booking._id), actorId: String(f.actors.userId), actorType: Actor.CUSTOMER, terminationType: Intent.CUSTOMER_CANCELLED };
    await assert.rejects(() => bookingFinancialTerminationService.terminateBookingFinancially(input));
    assert.equal(calls, 1);
    assert.equal((await TerminationProviderOperation.findOne({ bookingId: f.booking._id }))?.status, "UNKNOWN");
  });
}

test("refund lookup without a provider reference is explicitly unsupported", async () => {
  const f = await fixture(true);
  const payment = await (await import("../../repositories/payment.repository")).paymentRepository.findById(f.payment._id as Types.ObjectId);
  assert.ok(payment?.providerPaymentId);
  assert.deepEqual(await internalPaymentProvider.getTerminationEvidence({ kind: "REFUND", paymentId: String(payment._id), providerPaymentId: payment.providerPaymentId, amount: { amount: payment.amount, currency: payment.currency } }), { outcome: "UNSUPPORTED" });
});

test("generic termination orchestration has no simulator imports", () => {
  const source = readFileSync(resolve(__dirname, "../../services/financial/bookingFinancialTermination.service.ts"), "utf8");
  assert.doesNotMatch(source, /internalProvider|constants\/internalProvider/);
});
