import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";
import type { Request, Response } from "express";

import User from "../../models/User";
import { Booking } from "../../models/booking.model";
import { Dispute } from "../../models/dispute.model";
import { getAdminDispute, listAdminDisputes } from "../../controllers/adminDispute.controller";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

function response() { const result: { body?: unknown; statusCode?: number; response: Response } = {} as never; result.response = { status: (code: number) => { result.statusCode = code; return result.response; }, json: (body: unknown) => { result.body = body; return result.response; } } as unknown as Response; return result; }
async function fixture(status: "OPEN" | "RESOLVED" = "OPEN", escalationLevel: "NONE" | "SOFT" = "NONE") { const suffix = new Types.ObjectId().toString(); const customer = await User.create({ email: `admin-dispute-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" }); const booking = await Booking.create({ slotIds: [new Types.ObjectId()], userId: customer._id, creatorId: new Types.ObjectId(), serviceId: new Types.ObjectId(), serviceTitle: "Bounded dispute service", durationMinutes: 30, price: 100, currency: "INR", status: "CANCELLED", paymentStatus: "PAID", isPayable: true, isPayoutEligible: false, isFinancialLocked: false, expiresAt: new Date(Date.now() + 86_400_000), hasInteracted: true, serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80, totalAmount: 100 }); const dispute = await Dispute.create({ bookingId: booking._id, raisedBy: customer._id, raisedByRole: "USER", reason: "Bounded admin dispute", status, escalationLevel, signals: [] }); return { booking, dispute }; }

test("admin queue applies status/escalation pagination and returns bounded records", async () => { const open = await fixture("OPEN", "SOFT"); await fixture("RESOLVED", "NONE"); const res = response(); await listAdminDisputes({ query: { status: "OPEN", escalationLevel: "SOFT", page: "1", limit: "1" } } as unknown as Request, res.response); const body = res.body as { disputes: Array<Record<string, unknown>>; pagination: { total: number } }; assert.equal(body.pagination.total, 1); assert.equal(body.disputes[0].disputeId, String(open.dispute._id)); assert.deepEqual(Object.keys(body.disputes[0]).sort(), ["booking", "bookingId", "createdAt", "disputeId", "escalatedAt", "escalationLevel", "raisedByRole", "reasonSummary", "resolvedAt", "status"]); });
test("admin detail safely returns independently persisted financial context as null when absent", async () => { const { dispute } = await fixture(); const res = response(); await getAdminDispute({ params: { disputeId: String(dispute._id) } } as unknown as Request, res.response); const body = res.body as { dispute: Record<string, unknown>; payment: unknown; reservation: unknown; escrow: unknown; settlement: unknown; refund: unknown }; assert.deepEqual(body.dispute.allowedActions, ["NO_ACTION"]); assert.equal(body.payment, null); assert.equal(body.reservation, null); assert.equal(body.escrow, null); assert.equal(body.settlement, null); assert.equal(body.refund, null); assert.equal("raisedBy" in body.dispute, false); });
