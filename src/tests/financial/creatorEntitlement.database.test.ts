import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { CreatorEntitlement } from "../../models/creatorEntitlement.model";
import { Booking } from "../../models/booking.model";
import { Payment } from "../../models/payment.model";
import { PaymentOperation } from "../../models/paymentOperation.model";
import { BookingFundReservation } from "../../models/bookingFundReservation.model";
import { LedgerEntry } from "../../models/ledgerEntry.model";
import { Wallet } from "../../models/wallet.model";
import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { CreatorEntitlementService, AuthorizedAllocationDecision } from "../../services/financial/creatorEntitlement.service";
import { CreatorEntitlementEligibilityService } from "../../services/financial/creatorEntitlementEligibility.service";
import { creatorEntitlementRepository } from "../../repositories/creatorEntitlement.repository";
import { createBookingCheckoutQuote } from "../../services/booking/bookingCheckoutQuote.service";
import { createBookingWalletFixture } from "./phase8a/fixtures/bookingWalletFixtures";
import { startReleaseHttpServer } from "./phase8b/fixtures/bookingWalletReleaseFixtures";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";
import { Dispute } from "../../models/dispute.model";
import { Appeal } from "../../models/appeal.model";
import mongoose from "mongoose";
import { CreatorEntitlementFinancialAllocation } from "../../models/creatorEntitlementFinancialAllocation.model";
import { creatorEntitlementFinancialAllocationService } from "../../services/financial/creatorEntitlementFinancialAllocation.service";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "standalone-entitlement-test";
before(async () => { await connectPhase7HDatabase(); await CreatorEntitlement.init(); }, { timeout: 120_000 });
beforeEach(clearPhase7HDatabase);
after(disconnectPhase7HDatabase);

async function fixture() {
  const f = await createBookingWalletFixture({ walletAmount: 0, slotAmounts: [500] });
  const user = await User.create({ email: `${new Types.ObjectId()}@test.local`, role: "user", status: "active" });
  await UserProfile.create({ userId: user._id, username: `e${String(user._id)}`, dateOfBirth: new Date("1990-01-01"), interests: ["test"], bio: "test", avatar: "https://test.local/a", cover: "https://test.local/c", profilePhotos: ["https://test.local/1", "https://test.local/2"], profileStatus: "verified" });
  const server = await startReleaseHttpServer();
  try {
    const key = `standalone-entitlement-${new Types.ObjectId()}`;
    const quote = createBookingCheckoutQuote({ customerId: String(user._id), creatorId: String(f.actors.creatorId), serviceId: String(f.serviceId), slotIds: f.slotIds.map(String), currency: "INR", serviceAmount: f.serviceAmount, customerFeeAmount: f.platformFeeAmount, totalAmount: f.totalAmount });
    const response = await fetch(`${server.baseUrl}/api/v1/bookings/request`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${jwt.sign({ id: String(user._id), role: "user" }, process.env.JWT_SECRET!)}`, "Idempotency-Key": key }, body: JSON.stringify({ serviceId: String(f.serviceId), slotIds: f.slotIds.map(String), paymentMethod: "INTERNAL", checkoutQuote: quote.token, idempotencyKey: key }) });
    const body = await response.json() as { booking: { _id: string }; message?: string };
    assert.equal(response.status, 201, body.message);
    const booking = await Booking.findById(body.booking._id).orFail();
    const payment = await Payment.findById(booking.paymentId).orFail();
    const operation = await PaymentOperation.findOne({ paymentId: payment._id }).orFail();
    await Booking.updateOne(
      { _id: booking._id },
      {
        $set: {
          status: "COMPLETED",
          paymentStatus: "PAID",
          isPayable: false,
          completedAt: new Date(),
        },
      },
    );
    const completedBooking = await Booking.findById(booking._id).orFail();
    const decision: AuthorizedAllocationDecision = { authority: "test-approved-decisions", decisionId: "decision-1", bookingId: booking._id, paymentId: payment._id, creatorId: booking.creatorId, currency: payment.currency, totalAmount: payment.amount, creatorAmount: 400, platformAmount: payment.amount - 400, customerRefundAmount: 0 };
    return { booking: completedBooking, payment, operation, decision, userId: user._id };
  } finally { await server.close(); }
}
const serviceFor = (read: () => AuthorizedAllocationDecision | null) => new CreatorEntitlementService({ async readAuthorized() { return read(); } });

test("authorized allocations converge concurrently into one held, wallet-independent record", async () => {
  const f = await fixture();
  assert.equal(await Wallet.countDocuments({ userId: f.userId }), 0);
  const ledgerBefore = await LedgerEntry.countDocuments();
  const walletBefore = await Wallet.countDocuments();
  const service = serviceFor(() => f.decision);
  const results = await Promise.all(Array.from({ length: 5 }, () => service.recognize({ authority: f.decision.authority, decisionId: f.decision.decisionId })));
  assert.equal(new Set(results.map(r => r.entitlementId)).size, 1);
  assert.equal(results.filter(r => !r.replayed).length, 1);
  assert.ok(results.every(r => r.state === "HELD"));
  const stored = await CreatorEntitlement.findOne().orFail();
  assert.equal(stored.creatorAmount + stored.platformAmount + stored.customerRefundAmount, f.payment.amount);
  assert.equal(await LedgerEntry.countDocuments(), ledgerBefore);
  assert.equal(await Wallet.countDocuments(), walletBefore);
  assert.equal(await BookingFundReservation.countDocuments(), 0);
  assert.equal((await service.recognize({ authority: f.decision.authority, decisionId: f.decision.decisionId })).replayed, true);
});

test("unapproved, inconsistent, wrong-currency and conflicting decisions fail closed", async () => {
  const f = await fixture();
  const key = { authority: f.decision.authority, decisionId: f.decision.decisionId };
  await assert.rejects(() => serviceFor(() => null).recognize(key), /not authorized/);
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, creatorAmount: 401 })).recognize(key), /amounts or identity/);
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, currency: "USD" })).recognize(key), /do not reconcile/);
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, paymentId: new Types.ObjectId() })).recognize(key), /do not reconcile/);
  const service = serviceFor(() => f.decision);
  await service.recognize(key);
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, creatorAmount: 399, platformAmount: f.decision.platformAmount + 1 })).recognize(key), /conflicts/);
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, decisionId: "another" })).recognize({ ...key, decisionId: "another" }), /conflicting allocation/);
  assert.equal(await CreatorEntitlement.countDocuments(), 1);
});

test("unknown provider funding cannot create an entitlement and transaction failures leave no record", async () => {
  const f = await fixture();
  const key = { authority: f.decision.authority, decisionId: f.decision.decisionId };
  await PaymentOperation.updateOne({ _id: f.operation._id }, { $set: { status: "UNKNOWN" } });
  await assert.rejects(() => serviceFor(() => f.decision).recognize(key), /do not reconcile/);
  assert.equal(await CreatorEntitlement.countDocuments(), 0);
  await PaymentOperation.updateOne({ _id: f.operation._id }, { $set: { status: "CONFIRMED" } });
  const throwing = new CreatorEntitlementService({ async readAuthorized() { throw new Error("decision read failed"); } });
  await assert.rejects(() => throwing.recognize(key), /decision read failed/);
  assert.equal(await CreatorEntitlement.countDocuments(), 0);
  const original = creatorEntitlementRepository.create;
  try {
    creatorEntitlementRepository.create = async (data, session) => {
      await original.call(creatorEntitlementRepository, data, session);
      throw new Error("failure after insert");
    };
    await assert.rejects(() => serviceFor(() => f.decision).recognize(key), /failure after insert/);
    assert.equal(await CreatorEntitlement.countDocuments(), 0);
  } finally { creatorEntitlementRepository.create = original; }
});

test("provider entitlement becomes eligible only after 48 hours and active dispute or appeal holds remain booking-specific", async () => {
  const first = await fixture();
  const second = await fixture();
  const entitlement = await serviceFor(() => first.decision).recognize({ authority: first.decision.authority, decisionId: first.decision.decisionId });
  const secondDecision = { ...second.decision, decisionId: "decision-2" };
  const secondEntitlement = await serviceFor(() => secondDecision).recognize({ authority: secondDecision.authority, decisionId: secondDecision.decisionId });
  const eligibility = new CreatorEntitlementEligibilityService();
  const completedAt = (await Booking.findById(first.booking._id).orFail()).completedAt!;
  assert.equal((await eligibility.evaluate({ entitlementId: entitlement.entitlementId, now: new Date(completedAt.getTime() + 48 * 60 * 60 * 1000 - 1) })).state, "HELD");
  await Dispute.create({ bookingId: first.booking._id, raisedBy: first.userId, raisedByRole: "USER", reason: "timely", status: "OPEN" });
  assert.equal((await eligibility.evaluate({ entitlementId: entitlement.entitlementId, now: new Date(completedAt.getTime() + 49 * 60 * 60 * 1000) })).reason, "DISPUTE_OPEN");
  assert.equal((await eligibility.evaluate({ entitlementId: secondEntitlement.entitlementId, now: new Date(completedAt.getTime() + 49 * 60 * 60 * 1000) })).state, "ELIGIBLE");
  const dispute = await Dispute.findOne({ bookingId: first.booking._id }).orFail();
  dispute.status = "RESOLVED";
  dispute.finalDecision = { customerOutcome: "NO_ADVERSE_FINDING", customerSummary: "x", creatorOutcome: "NO_ADVERSE_FINDING", creatorSummary: "x", summary: "x", financialReviewRequired: true, governanceReviewRequired: false, finalizedBy: first.userId, finalizedAt: new Date() };
  await dispute.save();
  await Appeal.create({ disputeId: dispute._id, raisedBy: first.userId, raisedByRole: "USER", reason: "appeal", status: "OPEN" });
  assert.equal((await eligibility.evaluate({ entitlementId: entitlement.entitlementId, now: new Date(completedAt.getTime() + 72 * 60 * 60 * 1000) })).reason, "APPEAL_OPEN");
  await Appeal.updateOne({ disputeId: dispute._id }, { $set: { status: "REJECTED", "decision.decidedAt": new Date(), "decision.action": "CONFIRM_DECISION", "decision.decidedBy": first.userId } });
  assert.equal((await eligibility.evaluate({ entitlementId: entitlement.entitlementId, now: new Date(completedAt.getTime() + 96 * 60 * 60 * 1000) })).reason, "FINANCIAL_ALLOCATION_UNRESOLVED");
});

test("final financial allocation is immutable, reduced, and releases only after the final-resolution hold", async () => {
  const f = await fixture();
  const recognized = await serviceFor(() => f.decision).recognize({ authority: f.decision.authority, decisionId: f.decision.decisionId });
  const entitlement = await CreatorEntitlement.findById(recognized.entitlementId).orFail();
  const finalizedAt = new Date(f.booking.completedAt!.getTime() + 30 * 60 * 60 * 1000);
  const dispute = await Dispute.create({ bookingId: f.booking._id, raisedBy: f.userId, raisedByRole: "USER", reason: "timely", status: "RESOLVED", finalDecision: { customerOutcome: "MIXED", customerSummary: "x", creatorOutcome: "MIXED", creatorSummary: "x", summary: "x", financialReviewRequired: true, governanceReviewRequired: false, finalizedBy: f.userId, finalizedAt } });
  const session = await mongoose.startSession();
  try { await session.withTransaction(async () => { await creatorEntitlementFinancialAllocationService.record({ authority: "DISPUTE_FINAL_DECISION_V1", decisionId: String(dispute._id), bookingId: f.booking._id, disputeId: dispute._id, decidedBy: f.userId, finalizedAt, allocation: { creatorAmount: 300, customerRefundAmount: 100, platformAmount: f.payment.amount - 400, reasonReference: "final finding" } }, session); }); } finally { await session.endSession(); }
  assert.equal((await CreatorEntitlement.findById(entitlement._id).orFail()).creatorAmount, f.decision.creatorAmount);
  const eligibility = new CreatorEntitlementEligibilityService();
  assert.equal((await eligibility.evaluate({ entitlementId: String(entitlement._id), now: new Date(finalizedAt.getTime() + 24 * 60 * 60 * 1000 - 1) })).state, "HELD");
  assert.equal((await eligibility.evaluate({ entitlementId: String(entitlement._id), now: new Date(finalizedAt.getTime() + 24 * 60 * 60 * 1000) })).state, "ELIGIBLE");
  assert.equal(await CreatorEntitlementFinancialAllocation.countDocuments({ disputeId: dispute._id }), 1);
  const replay = await mongoose.startSession();
  try { await replay.withTransaction(async () => { const r = await creatorEntitlementFinancialAllocationService.record({ authority: "DISPUTE_FINAL_DECISION_V1", decisionId: String(dispute._id), bookingId: f.booking._id, disputeId: dispute._id, decidedBy: f.userId, finalizedAt, allocation: { creatorAmount: 300, customerRefundAmount: 100, platformAmount: f.payment.amount - 400, reasonReference: "final finding" } }, replay); assert.equal(r.replayed, true); }); } finally { await replay.endSession(); }
});
