import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";
import type { Request, Response } from "express";

import User from "../../models/User";
import { Booking } from "../../models/booking.model";
import { Dispute } from "../../models/dispute.model";
import { getBookingDisputeState, getMyDisputes, openDispute } from "../../controllers/dispute.controller";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

interface MockResponse { body?: unknown; statusCode?: number; response: Response; }
function response(): MockResponse {
  const result = {} as MockResponse;
  result.response = { status: (code: number) => { result.statusCode = code; return result.response; }, json: (body: unknown) => { result.body = body; return result.response; } } as unknown as Response;
  return result;
}
async function fixture(status: "CANCELLED" | "EXPIRED" | "COMPLETED" | "CONFIRMED" = "CANCELLED", completedAt?: Date) {
  const suffix = new Types.ObjectId().toString();
  const customer = await User.create({ email: `dispute-customer-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  const creator = await User.create({ email: `dispute-creator-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  const booking = await Booking.create({ slotIds: [new Types.ObjectId()], userId: customer._id, creatorId: creator._id, serviceId: new Types.ObjectId(), serviceTitle: "Dispute service", durationMinutes: 30, price: 100, currency: "INR", status, paymentStatus: "PAID", isPayable: true, isPayoutEligible: false, isFinancialLocked: false, expiresAt: new Date(Date.now() + 86_400_000), hasInteracted: true, completedAt: status === "COMPLETED" ? completedAt ?? new Date() : undefined, serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80, totalAmount: 100 });
  return { customer, creator, booking };
}
const open = async (actorId: string, bookingId: string, reason = "Service outcome needs review") => {
  const res = response();
  await openDispute({ user: { id: actorId }, body: { bookingId, reason } } as unknown as Request, res.response);
  return res;
};

test("eligible customer creation is visible through booking state and participant lists", async () => {
  const { customer, creator, booking } = await fixture();
  const created = await open(String(customer._id), String(booking._id));
  assert.equal(created.statusCode, 201);
  assert.equal(await Dispute.countDocuments({ bookingId: booking._id }), 1);
  for (const actor of [customer, creator]) {
    const state = response();
    await getBookingDisputeState({ user: { id: String(actor._id) }, params: { bookingId: String(booking._id) } } as unknown as Request, state.response);
    const body = state.body as { hasDispute: boolean; dispute: Record<string, unknown> };
    assert.equal(body.hasDispute, true);
    assert.deepEqual(Object.keys(body.dispute).sort(), ["bookingId", "createdAt", "disputeId", "escalationLevel", "input", "raisedByMe", "raisedByRole", "reason", "resolution", "status", "updatedAt"]);
    assert.deepEqual((body.dispute.input as { state: string }), { state: "OPEN" });
    const list = response();
    await getMyDisputes({ user: { id: String(actor._id) } } as unknown as Request, list.response);
    assert.equal((list.body as { disputes: unknown[] }).disputes.length, 1);
  }
});

test("eligible Creator creation and backend eligibility matrix are enforced", async () => {
  const { creator, booking } = await fixture("EXPIRED");
  assert.equal((await open(String(creator._id), String(booking._id))).statusCode, 201);
  const { customer: confirmedCustomer, booking: confirmed } = await fixture("CONFIRMED");
  assert.equal((await open(String(confirmedCustomer._id), String(confirmed._id))).statusCode, 400);
  const { customer: oldCustomer, booking: oldCompleted } = await fixture("COMPLETED", new Date(Date.now() - 25 * 60 * 60 * 1000));
  assert.equal((await open(String(oldCustomer._id), String(oldCompleted._id))).statusCode, 400);
});

test("unrelated actors and every existing dispute status are safely blocked", async () => {
  for (const status of ["OPEN", "RESOLVED", "REJECTED"] as const) {
    const { customer, booking } = await fixture();
    await Dispute.create({ bookingId: booking._id, raisedBy: customer._id, raisedByRole: "USER", reason: "Existing dispute", status, escalationLevel: "NONE", signals: [] });
    const duplicate = await open(String(customer._id), String(booking._id));
    assert.equal(duplicate.statusCode, 409);
    assert.equal((duplicate.body as { message: string }).message, "A dispute already exists for this booking");
  }
  const { booking } = await fixture();
  const stranger = await User.create({ email: `dispute-stranger-${new Types.ObjectId()}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  assert.equal((await open(String(stranger._id), String(booking._id))).statusCode, 403);
});

test("a duplicate-key creation race returns the same bounded conflict", async () => {
  const { customer, booking } = await fixture();
  const model = Dispute as unknown as {
    exists: typeof Dispute.exists;
    create: typeof Dispute.create;
  };
  const originalExists = model.exists;
  const originalCreate = model.create;
  model.exists = (async () => null) as unknown as typeof Dispute.exists;
  model.create = (async () => {
    const error = Object.assign(new Error("duplicate key"), { code: 11000 });
    throw error;
  }) as unknown as typeof Dispute.create;
  try {
    const raced = await open(String(customer._id), String(booking._id));
    assert.equal(raced.statusCode, 409);
    assert.deepEqual(raced.body, { message: "A dispute already exists for this booking" });
  } finally {
    model.exists = originalExists;
    model.create = originalCreate;
  }
});

test("no-dispute state is safe and unrelated booking disputes are excluded", async () => {
  const first = await fixture();
  const second = await fixture();
  await open(String(first.customer._id), String(first.booking._id));
  const empty = response();
  await getBookingDisputeState({ user: { id: String(second.customer._id) }, params: { bookingId: String(second.booking._id) } } as unknown as Request, empty.response);
  assert.deepEqual(empty.body, { hasDispute: false, canOpenDispute: true, ineligibilityReason: null, dispute: null });
  const list = response();
  await getMyDisputes({ user: { id: String(second.customer._id) } } as unknown as Request, list.response);
  assert.equal((list.body as { disputes: unknown[] }).disputes.length, 0);
});

test("participant dispute lists preserve the viewer-specific finalized outcome", async () => {
  const { customer, creator, booking } = await fixture();
  await open(String(customer._id), String(booking._id));
  await Dispute.updateOne(
    { bookingId: booking._id },
    { $set: { status: "RESOLVED", finalDecision: { customerOutcome: "ADVERSE_FINDING", customerSummary: "Customer-only", creatorOutcome: "NO_ADVERSE_FINDING", creatorSummary: "Creator-only", summary: "Participant-safe", financialReviewRequired: false, governanceReviewRequired: false, finalizedAt: new Date() } } },
  );
  for (const [actor, outcome] of [[customer, "ADVERSE_FINDING"], [creator, "NO_ADVERSE_FINDING"]] as const) {
    const list = response();
    await getMyDisputes({ user: { id: String(actor._id) } } as unknown as Request, list.response);
    const dispute = (list.body as { disputes: Array<{ finalDecision?: { outcome: string } }> }).disputes[0];
    assert.equal(dispute.finalDecision?.outcome, outcome);
    assert.equal(JSON.stringify(dispute).includes("Customer-only"), false);
    assert.equal(JSON.stringify(dispute).includes("Creator-only"), false);
  }
});
