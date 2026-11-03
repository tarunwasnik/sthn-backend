import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { Booking } from "../../models/booking.model";
import { Payment } from "../../models/payment.model";
import { CreatorEntitlement } from "../../models/creatorEntitlement.model";
import { CreatorEntitlementFinancialAllocation } from "../../models/creatorEntitlementFinancialAllocation.model";
import { Dispute } from "../../models/dispute.model";
import { Appeal } from "../../models/appeal.model";
import { AuditLog } from "../../models/auditLog.model";
import { createBookingWalletFixture } from "./phase8a/fixtures/bookingWalletFixtures";
import { startReleaseHttpServer } from "./phase8b/fixtures/bookingWalletReleaseFixtures";
import { createActiveWalletBooking } from "./phase8b/fixtures/bookingWalletReleaseFixtures";
import { createBookingCheckoutQuote } from "../../services/booking/bookingCheckoutQuote.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";

process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "appeal-finalization-test";
before(async () => { await connectPhase7HDatabase(); await Promise.all([CreatorEntitlement.init(), CreatorEntitlementFinancialAllocation.init()]); }, { timeout: 120_000 });
beforeEach(clearPhase7HDatabase); after(disconnectPhase7HDatabase);

async function fixture() {
  const f = await createBookingWalletFixture({ walletAmount: 0, slotAmounts: [500] });
  const customer = await User.create({ email: `${new Types.ObjectId()}@test.local`, role: "user", status: "active" });
  await UserProfile.create({ userId: customer._id, username: `a${String(customer._id)}`, dateOfBirth: new Date("1990-01-01"), interests: ["test"], bio: "test", avatar: "https://test/a", cover: "https://test/c", profilePhotos: ["https://test/1", "https://test/2"], profileStatus: "verified" });
  const server = await startReleaseHttpServer();
  const key = `appeal-${new Types.ObjectId()}`;
  const quote = createBookingCheckoutQuote({ customerId: String(customer._id), creatorId: String(f.actors.creatorId), serviceId: String(f.serviceId), slotIds: f.slotIds.map(String), currency: "INR", serviceAmount: f.serviceAmount, customerFeeAmount: f.platformFeeAmount, totalAmount: f.totalAmount });
  const response = await fetch(`${server.baseUrl}/api/v1/bookings/request`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${jwt.sign({ id: String(customer._id), role: "user" }, process.env.JWT_SECRET!)}`, "Idempotency-Key": key }, body: JSON.stringify({ serviceId: String(f.serviceId), slotIds: f.slotIds.map(String), paymentMethod: "INTERNAL", checkoutQuote: quote.token, idempotencyKey: key }) });
  assert.equal(response.status, 201); const body = await response.json() as { booking: { _id: string } }; const booking = await Booking.findById(body.booking._id).orFail(); const payment = await Payment.findById(booking.paymentId).orFail();
  const entitlement = await CreatorEntitlement.create({ decisionAuthority: "test", decisionId: String(booking._id), fingerprint: "x", bookingId: booking._id, paymentId: payment._id, creatorId: booking.creatorId, currency: payment.currency, totalAmount: payment.amount, creatorAmount: 400, platformAmount: payment.amount - 400, customerRefundAmount: 0, state: "HELD" });
  const dispute = await Dispute.create({ bookingId: booking._id, raisedBy: customer._id, raisedByRole: "USER", reason: "x", status: "RESOLVED" });
  const appeal = await Appeal.create({ disputeId: dispute._id, raisedBy: customer._id, raisedByRole: "USER", reason: "x" });
  return { server, booking, payment, entitlement, appeal, adminToken: jwt.sign({ id: String(f.actors.adminId), role: "admin" }, process.env.JWT_SECRET!) };
}
const decide = (base: string, token: string, appealId: string, body: object) => fetch(`${base}/api/v1/admin/appeals/${appealId}/decide`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

test("appeal finalization replays exactly once and rejects changed decision or allocation", async () => {
  const x = await fixture(); try {
    const body = { action: "REVERSE_DECISION", note: "final evidence", financialAllocation: { creatorAmount: 300, customerRefundAmount: 100, platformAmount: x.payment.amount - 400, reasonReference: "finding-1" } };
    let r = await decide(x.server.baseUrl, x.adminToken, String(x.appeal._id), body); assert.equal(r.status, 200); assert.equal((await r.json() as any).replayed, false);
    const first = await Appeal.findById(x.appeal._id).orFail(); const audits = await AuditLog.countDocuments({ action: "APPEAL_DECIDED", entityId: x.appeal._id }); assert.equal(await CreatorEntitlementFinancialAllocation.countDocuments({ appealId: x.appeal._id }), 1);
    r = await decide(x.server.baseUrl, x.adminToken, String(x.appeal._id), body); assert.equal(r.status, 200); assert.equal((await r.json() as any).replayed, true); assert.equal((await Appeal.findById(x.appeal._id).orFail()).decision!.decidedAt.getTime(), first.decision!.decidedAt.getTime()); assert.equal(await AuditLog.countDocuments({ action: "APPEAL_DECIDED", entityId: x.appeal._id }), audits);
    assert.equal((await decide(x.server.baseUrl, x.adminToken, String(x.appeal._id), { ...body, action: "CONFIRM_DECISION" })).status, 409);
    assert.equal((await decide(x.server.baseUrl, x.adminToken, String(x.appeal._id), { ...body, financialAllocation: { ...body.financialAllocation, creatorAmount: 299, platformAmount: x.payment.amount - 399 } })).status, 409);
    assert.equal((await decide(x.server.baseUrl, x.adminToken, String(x.appeal._id), { ...body, note: "changed evidence" })).status, 409);
    assert.equal((await decide(x.server.baseUrl, jwt.sign({ id: String(x.booking.userId), role: "user" }, process.env.JWT_SECRET!), String(x.appeal._id), body)).status, 403);
    assert.equal((await CreatorEntitlement.findById(x.entitlement._id).orFail()).creatorAmount, 400);
  } finally { await x.server.close(); }
});

test("wallet-backed appeal finalization does not require provider allocation evidence", async () => {
  const server = await startReleaseHttpServer(); try { const x = await createActiveWalletBooking(server.baseUrl); const dispute = await Dispute.create({ bookingId: x.booking._id, raisedBy: x.fixture.actors.userId, raisedByRole: "USER", reason: "x", status: "RESOLVED" }); const appeal = await Appeal.create({ disputeId: dispute._id, raisedBy: x.fixture.actors.userId, raisedByRole: "USER", reason: "x" }); const r = await decide(server.baseUrl, x.adminToken, String(appeal._id), { action: "REVERSE_DECISION", note: "legacy" }); assert.equal(r.status, 200); assert.equal((await Appeal.findById(appeal._id).orFail()).status, "UPHELD"); assert.equal(await CreatorEntitlementFinancialAllocation.countDocuments(), 0); } finally { await server.close(); }
});

test("concurrent identical appeal decisions converge to one decision, allocation and audit", async () => {
  const x = await fixture(); try { const body = { action: "REVERSE_DECISION", note: "final evidence", financialAllocation: { creatorAmount: 300, customerRefundAmount: 100, platformAmount: x.payment.amount - 400, reasonReference: "finding-1" } }; const rs = await Promise.all([decide(x.server.baseUrl, x.adminToken, String(x.appeal._id), body), decide(x.server.baseUrl, x.adminToken, String(x.appeal._id), body)]); assert.ok(rs.every(r => r.status === 200)); assert.equal(await CreatorEntitlementFinancialAllocation.countDocuments({ appealId: x.appeal._id }), 1); assert.equal(await AuditLog.countDocuments({ action: "APPEAL_DECIDED", entityId: x.appeal._id }), 1); } finally { await x.server.close(); }
});
