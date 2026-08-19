import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";
import type { Request, Response } from "express";

import User from "../../models/User";
import { AuditLog } from "../../models/auditLog.model";
import { Booking } from "../../models/booking.model";
import { BookingFundReservation } from "../../models/bookingFundReservation.model";
import { Dispute } from "../../models/dispute.model";
import { LedgerEntry } from "../../models/ledgerEntry.model";
import { Payment } from "../../models/payment.model";
import { Wallet } from "../../models/wallet.model";
import { getAdminDispute, setAdminDisputeInputAccess } from "../../controllers/adminDispute.controller";
import { getBookingDisputeState, openDispute } from "../../controllers/dispute.controller";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

type MockResponse = { body?: unknown; statusCode?: number; response: Response };
function response(): MockResponse {
  const result = {} as MockResponse;
  result.response = {
    status: (code: number) => { result.statusCode = code; return result.response; },
    json: (body: unknown) => { result.body = body; return result.response; },
  } as unknown as Response;
  return result;
}

async function fixture() {
  const suffix = new Types.ObjectId().toString();
  const [customer, creator, admin] = await Promise.all([
    User.create({ email: `di2b-customer-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" }),
    User.create({ email: `di2b-creator-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" }),
    User.create({ email: `di2b-admin-${suffix}@test.local`, password: "test", role: "admin", status: "active", governanceState: "ACTIVE" }),
  ]);
  const booking = await Booking.create({
    slotIds: [new Types.ObjectId()], userId: customer._id, creatorId: creator._id, serviceId: new Types.ObjectId(),
    serviceTitle: "DI-2B service", durationMinutes: 30, price: 100, currency: "INR", status: "CANCELLED",
    paymentStatus: "PAID", isPayable: true, isPayoutEligible: false, isFinancialLocked: false,
    expiresAt: new Date(Date.now() + 86_400_000), hasInteracted: true,
    serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80, totalAmount: 100,
  });
  return { customer, creator, admin, booking };
}

async function open(actorId: string, bookingId: string) {
  const res = response();
  await openDispute({ user: { id: actorId }, body: { bookingId, reason: "DI-2B investigation" } } as unknown as Request, res.response);
  assert.equal(res.statusCode, 201);
  return Dispute.findOne({ bookingId }).orFail();
}

async function setInput(actor: { _id: Types.ObjectId; role: string }, disputeId: string, participantRole: "CUSTOMER" | "CREATOR", state: "OPEN" | "CLOSED") {
  const res = response();
  await setAdminDisputeInputAccess({ user: { id: String(actor._id), role: actor.role }, params: { disputeId }, body: { participantRole, state } } as unknown as Request, res.response);
  return res;
}

test("DI-2B defaults both shared-dispute branches OPEN regardless of who raises the dispute", async () => {
  const customerRaised = await fixture();
  const customerDispute = await open(String(customerRaised.customer._id), String(customerRaised.booking._id));
  assert.equal(customerDispute.customerInput.state, "OPEN");
  assert.equal(customerDispute.creatorInput.state, "OPEN");

  const creatorRaised = await fixture();
  const creatorDispute = await open(String(creatorRaised.creator._id), String(creatorRaised.booking._id));
  assert.equal(creatorDispute.raisedByRole, "CREATOR");
  assert.equal(creatorDispute.customerInput.state, "OPEN");
  assert.equal(creatorDispute.creatorInput.state, "OPEN");
  assert.equal(await Dispute.countDocuments({ bookingId: creatorRaised.booking._id }), 1);
});

test("DI-2B Admin independently closes and reopens each branch with replay-safe audit", async () => {
  const data = await fixture();
  const dispute = await open(String(data.customer._id), String(data.booking._id));

  assert.equal((await setInput(data.admin, String(dispute._id), "CUSTOMER", "CLOSED")).statusCode, undefined);
  let reread = await Dispute.findById(dispute._id).orFail();
  assert.equal(reread.customerInput.state, "CLOSED");
  assert.equal(reread.creatorInput.state, "OPEN");
  assert.equal(String(reread.customerInput.changedBy), String(data.admin._id));

  const replay = await setInput(data.admin, String(dispute._id), "CUSTOMER", "CLOSED");
  assert.deepEqual(replay.body, { disputeId: String(dispute._id), participantRole: "CUSTOMER", state: "CLOSED", changed: false, changedAt: reread.customerInput.changedAt });
  assert.equal(await AuditLog.countDocuments({ action: "DISPUTE_INPUT_ACCESS_CHANGED", entityId: dispute._id }), 1);

  await setInput(data.admin, String(dispute._id), "CUSTOMER", "OPEN");
  await setInput(data.admin, String(dispute._id), "CREATOR", "CLOSED");
  reread = await Dispute.findById(dispute._id).orFail();
  assert.equal(reread.customerInput.state, "OPEN");
  assert.equal(reread.creatorInput.state, "CLOSED");
  await setInput(data.admin, String(dispute._id), "CREATOR", "OPEN");
  assert.equal((await Dispute.findById(dispute._id).orFail()).creatorInput.state, "OPEN");
  assert.equal(await AuditLog.countDocuments({ action: "DISPUTE_INPUT_ACCESS_CHANGED", entityId: dispute._id }), 4);
});

test("DI-2B rejects non-Admin, unauthenticated, and terminal-dispute input changes without lifecycle side effects", async () => {
  const data = await fixture();
  const dispute = await open(String(data.customer._id), String(data.booking._id));
  const before = await Promise.all([
    User.findById(data.customer._id).lean(), Booking.findById(data.booking._id).lean(), Payment.countDocuments(),
    BookingFundReservation.countDocuments(), Wallet.countDocuments(), LedgerEntry.countDocuments(),
  ]);

  await assert.rejects(() => setAdminDisputeInputAccess({ user: { id: String(data.customer._id), role: "user" }, params: { disputeId: String(dispute._id) }, body: { participantRole: "CUSTOMER", state: "CLOSED" } } as unknown as Request, response().response), /Forbidden/);
  await assert.rejects(() => setAdminDisputeInputAccess({ params: { disputeId: String(dispute._id) }, body: { participantRole: "CUSTOMER", state: "CLOSED" } } as unknown as Request, response().response), /Unauthorized/);

  dispute.status = "REJECTED";
  await dispute.save();
  await assert.rejects(() => setInput(data.admin, String(dispute._id), "CREATOR", "CLOSED"), /only change while a dispute is OPEN/);
  assert.deepEqual(await Promise.all([
    User.findById(data.customer._id).lean(), Booking.findById(data.booking._id).lean(), Payment.countDocuments(),
    BookingFundReservation.countDocuments(), Wallet.countDocuments(), LedgerEntry.countDocuments(),
  ]), before);
});

test("DI-2B exposes only own participant input state and both safe states to Admin", async () => {
  const data = await fixture();
  const dispute = await open(String(data.creator._id), String(data.booking._id));
  await setInput(data.admin, String(dispute._id), "CUSTOMER", "CLOSED");

  const customerRead = response();
  await getBookingDisputeState({ user: { id: String(data.customer._id) }, params: { bookingId: String(data.booking._id) } } as unknown as Request, customerRead.response);
  const participantDispute = (customerRead.body as { dispute: Record<string, unknown> }).dispute;
  assert.deepEqual(participantDispute.input, { state: "CLOSED" });
  assert.equal(JSON.stringify(participantDispute).includes("creatorInput"), false);
  assert.equal(JSON.stringify(participantDispute).includes("changedBy"), false);

  const adminRead = response();
  await getAdminDispute({ params: { disputeId: String(dispute._id) } } as unknown as Request, adminRead.response);
  const adminDispute = (adminRead.body as { dispute: { investigation: { customerInput: { state: string; changedAt: Date | null }; creatorInput: { state: string } } } }).dispute;
  assert.equal(adminDispute.investigation.customerInput.state, "CLOSED");
  assert.equal(adminDispute.investigation.creatorInput.state, "OPEN");
  assert.equal("changedBy" in adminDispute.investigation.customerInput, false);
});
