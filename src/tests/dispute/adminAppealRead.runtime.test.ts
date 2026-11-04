import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";
import type { Request, Response } from "express";

import User from "../../models/User";
import { Appeal } from "../../models/appeal.model";
import { Booking } from "../../models/booking.model";
import { Dispute } from "../../models/dispute.model";
import { getAdminAppeal, listAdminAppeals } from "../../controllers/adminAppeal.controller";
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

async function fixture(status: "OPEN" | "UPHELD" | "REJECTED", createdAt: Date) {
  const customer = await User.create({ email: `admin-appeal-customer-${new Types.ObjectId()}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  const creator = await User.create({ email: `admin-appeal-creator-${new Types.ObjectId()}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  const booking = await Booking.create({ slotIds: [new Types.ObjectId()], userId: customer._id, creatorId: creator._id, serviceId: new Types.ObjectId(), serviceTitle: `Service ${status}`, durationMinutes: 30, price: 100, currency: "INR", status: "COMPLETED", paymentStatus: "PAID", isPayable: true, isPayoutEligible: false, isFinancialLocked: false, expiresAt: createdAt, completedAt: createdAt, serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80, totalAmount: 100 });
  const dispute = await Dispute.create({ bookingId: booking._id, raisedBy: customer._id, raisedByRole: "USER", reason: `Dispute ${status}`, status: "RESOLVED", customerInput: { state: "CLOSED" }, creatorInput: { state: "CLOSED" } });
  const appeal = await Appeal.create({ disputeId: dispute._id, raisedBy: customer._id, raisedByRole: "USER", reason: `Appeal ${status}`, evidence: ["reference"], status, ...(status === "OPEN" ? {} : { decision: { action: status === "UPHELD" ? "REVERSE_DECISION" : "CONFIRM_DECISION", note: "Admin-only note", decidedBy: creator._id, decidedAt: createdAt } }) });
  await Appeal.updateOne({ _id: appeal._id }, { $set: { createdAt, updatedAt: createdAt } });
  return { appeal, dispute, booking };
}

test("Admin appeal queue filters, paginates, orders deterministically, and exposes only queue fields", async () => {
  const tied = new Date("2026-01-01T00:00:00.000Z");
  const old = await fixture("OPEN", new Date("2025-12-31T00:00:00.000Z"));
  const firstTie = await fixture("UPHELD", tied);
  const secondTie = await fixture("REJECTED", tied);
  const result = response();
  await listAdminAppeals({ query: { page: "1", limit: "2" } } as unknown as Request, result.response);
  const body = result.body as { appeals: Array<{ appealId: string; disputeId: string; bookingId: string; bookingReference: string; decision: { note: string } | null }>; pagination: { page: number; limit: number; total: number } };
  assert.deepEqual(body.pagination, { page: 1, limit: 2, total: 3 });
  assert.deepEqual(body.appeals.map((appeal) => appeal.appealId), [String(secondTie.appeal._id), String(firstTie.appeal._id)].sort().reverse());
  assert.equal(body.appeals[0].bookingReference, body.appeals[0].bookingReference);
  assert.equal("raisedBy" in body.appeals[0], false);
  assert.equal("decision" in body.appeals[0], true);
  const filtered = response();
  await listAdminAppeals({ query: { status: "OPEN", page: "1", limit: "10" } } as unknown as Request, filtered.response);
  assert.deepEqual((filtered.body as { appeals: Array<{ appealId: string }>; pagination: { total: number } }).appeals.map((appeal) => appeal.appealId), [String(old.appeal._id)]);
  assert.equal((filtered.body as { pagination: { total: number } }).pagination.total, 1);
  const secondPage = response();
  await listAdminAppeals({ query: { page: "2", limit: "2" } } as unknown as Request, secondPage.response);
  assert.deepEqual((secondPage.body as { appeals: Array<{ appealId: string }> }).appeals.map((appeal) => appeal.appealId), [String(old.appeal._id)]);
});

test("Admin appeal detail returns the linked dispute and booking without participant private identity", async () => {
  const item = await fixture("UPHELD", new Date("2026-01-01T00:00:00.000Z"));
  const result = response();
  await getAdminAppeal({ params: { appealId: String(item.appeal._id) } } as unknown as Request, result.response);
  const body = result.body as { appeal: { appealId: string; disputeId: string; bookingId: string; raisedByRole: string; decision: { note: string } | null }; booking: { bookingReference: string | null; serviceTitle: string; status: string } };
  assert.equal(body.appeal.appealId, String(item.appeal._id));
  assert.equal(body.appeal.disputeId, String(item.dispute._id));
  assert.equal(body.appeal.bookingId, String(item.booking._id));
  assert.equal(body.booking.serviceTitle, "Service UPHELD");
  assert.equal(body.appeal.decision?.note, "Admin-only note");
  assert.equal(JSON.stringify(body).includes("raisedBy\""), false);
  await assert.rejects(() => getAdminAppeal({ params: { appealId: "not-an-id" } } as unknown as Request, response().response), /Invalid appealId/);
  await assert.rejects(() => getAdminAppeal({ params: { appealId: String(new Types.ObjectId()) } } as unknown as Request, response().response), /Appeal not found/);
});

test("Admin appeal queue rejects invalid status filters", async () => {
  await assert.rejects(() => listAdminAppeals({ query: { status: "PENDING" } } as unknown as Request, response().response), /Invalid appeal status/);
});
