import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";
import type { Request, Response } from "express";

import User from "../../models/User";
import { Appeal } from "../../models/appeal.model";
import { Booking } from "../../models/booking.model";
import { Dispute } from "../../models/dispute.model";
import { getMyAppealForDispute } from "../../controllers/appeal.controller";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

function response() {
  const result = {} as { statusCode?: number; body?: unknown; response: Response };
  result.response = { status: (code: number) => { result.statusCode = code; return result.response; }, json: (body: unknown) => { result.body = body; return result.response; } } as unknown as Response;
  return result;
}

async function fixture(status: "OPEN" | "UPHELD" | "REJECTED" = "OPEN") {
  const customer = await User.create({ email: `appeal-customer-${new Types.ObjectId()}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  const creator = await User.create({ email: `appeal-creator-${new Types.ObjectId()}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  const booking = await Booking.create({ slotIds: [new Types.ObjectId()], userId: customer._id, creatorId: creator._id, serviceId: new Types.ObjectId(), serviceTitle: "Appeal service", durationMinutes: 30, price: 100, currency: "INR", status: "COMPLETED", paymentStatus: "PAID", isPayable: true, isPayoutEligible: false, isFinancialLocked: false, expiresAt: new Date(), completedAt: new Date(), serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80, totalAmount: 100 });
  const dispute = await Dispute.create({ bookingId: booking._id, raisedBy: customer._id, raisedByRole: "USER", reason: "Review", status: "RESOLVED", customerInput: { state: "CLOSED" }, creatorInput: { state: "CLOSED" } });
  await Appeal.create({ disputeId: dispute._id, raisedBy: customer._id, raisedByRole: "USER", reason: "Appeal", evidence: ["reference"], status, ...(status === "OPEN" ? {} : { decision: { action: status === "UPHELD" ? "REVERSE_DECISION" : "CONFIRM_DECISION", decidedBy: creator._id, decidedAt: new Date() } }) });
  return { customer, creator, dispute };
}

test("appeal reads require authentication and the appeal requester", async () => {
  const { customer, creator, dispute } = await fixture();
  const unauthenticated = response();
  await getMyAppealForDispute({ params: { disputeId: String(dispute._id) } } as unknown as Request, unauthenticated.response);
  assert.equal(unauthenticated.statusCode, 401);
  const denied = response();
  await getMyAppealForDispute({ user: { id: String(creator._id) }, params: { disputeId: String(dispute._id) } } as unknown as Request, denied.response);
  assert.equal(denied.statusCode, 403);
  const allowed = response();
  await getMyAppealForDispute({ user: { id: String(customer._id) }, params: { disputeId: String(dispute._id) } } as unknown as Request, allowed.response);
  assert.equal(allowed.statusCode, 200);
  const repeated = response();
  await getMyAppealForDispute({ user: { id: String(customer._id) }, params: { disputeId: String(dispute._id) } } as unknown as Request, repeated.response);
  assert.equal(repeated.statusCode, 200);
  assert.equal(await Appeal.countDocuments({ disputeId: dispute._id }), 1);
});

test("appeal read preserves pending/finalized status but excludes Admin decision notes", async () => {
  const pending = await fixture("OPEN");
  const pendingResponse = response();
  await getMyAppealForDispute({ user: { id: String(pending.customer._id) }, params: { disputeId: String(pending.dispute._id) } } as unknown as Request, pendingResponse.response);
  assert.equal((pendingResponse.body as { appeal: { status: string; decision: unknown } }).appeal.status, "OPEN");
  assert.equal((pendingResponse.body as { appeal: { decision: unknown } }).appeal.decision, null);
  const finalized = await fixture("UPHELD");
  const finalizedResponse = response();
  await getMyAppealForDispute({ user: { id: String(finalized.customer._id) }, params: { disputeId: String(finalized.dispute._id) } } as unknown as Request, finalizedResponse.response);
  assert.equal((finalizedResponse.body as { appeal: { status: string; decision: { action: string } } }).appeal.status, "UPHELD");
  assert.equal(JSON.stringify(finalizedResponse.body).includes("note"), false);
});

test("missing appeal returns a bounded not-found response", async () => {
  const user = await User.create({ email: `appeal-missing-${new Types.ObjectId()}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  const result = response();
  await getMyAppealForDispute({ user: { id: String(user._id) }, params: { disputeId: String(new Types.ObjectId()) } } as unknown as Request, result.response);
  assert.equal(result.statusCode, 404);
  const invalid = response();
  await getMyAppealForDispute({ user: { id: String(user._id) }, params: { disputeId: "not-an-object-id" } } as unknown as Request, invalid.response);
  assert.equal(invalid.statusCode, 400);
});
