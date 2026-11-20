import assert from "node:assert/strict";
import http from "node:http";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import safetyRoutes from "../../routes/v1/safetyReport.routes";
import { adminDecideSafetyReport, adminGetSafetyReport, adminListSafetyReports } from "../../controllers/safetyReport.controller";
import { protect } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/authorize.middleware";
import { errorHandler } from "../../middlewares/errorHandler";
import { notFound } from "../../middlewares/notFound";
import User from "../../models/User";
import { AuthSession } from "../../models/authSession.model";
import { AuditLog } from "../../models/auditLog.model";
import { Booking } from "../../models/booking.model";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "safety-report-runtime-secret";
const app = express(); app.use(express.json()); app.use("/api/v1/safety-reports", safetyRoutes);
const admin = express.Router(); admin.get("/safety-reports", protect, authorizeRoles("admin"), adminListSafetyReports); admin.get("/safety-reports/:reportId", protect, authorizeRoles("admin"), adminGetSafetyReport); admin.patch("/safety-reports/:reportId", protect, authorizeRoles("admin"), adminDecideSafetyReport); app.use("/api/v1/admin", admin); app.use(notFound); app.use(errorHandler);
let server: http.Server; let baseUrl = "";
before(async () => { await connectPhase7HDatabase(); server = http.createServer(app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); if (!address || typeof address === "string") throw new Error("bind failed"); baseUrl = `http://127.0.0.1:${address.port}`; }, { timeout: 120_000 });
beforeEach(clearPhase7HDatabase); after(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); await disconnectPhase7HDatabase(); });

async function identity(role: "user" | "creator" | "admin", name: string) { const user = await User.create({ email: `${name}@test.local`, password: "not-used", role, status: "active", ...(role === "creator" ? { creatorStatus: "approved" } : {}) }); const session = await AuthSession.create({ userId: user._id, expiresAt: new Date(Date.now() + 3_600_000), lastSeenAt: new Date() }); return { user, token: jwt.sign({ id: String(user._id), role, sid: String(session._id) }, process.env.JWT_SECRET!) }; }
const request = (path: string, options: RequestInit = {}, token?: string) => fetch(`${baseUrl}${path}`, { ...options, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) } });
const create = (token: string, body: unknown) => request("/api/v1/safety-reports", { method: "POST", body: JSON.stringify(body) }, token);

test("customer and creator reports are persisted, validated, and isolated", async () => {
  const customer = await identity("user", "customer"); const creator = await identity("creator", "creator"); const third = await identity("user", "third");
  assert.equal((await create(customer.token, { reportedUserId: String(creator.user._id), reason: "HARASSMENT", explanation: "Detailed harmful conduct evidence." })).status, 201);
  assert.equal((await create(creator.token, { reportedUserId: String(customer.user._id), reason: "SPAM", explanation: "Repeated unwanted contact evidence." })).status, 201);
  assert.equal((await create(customer.token, { reportedUserId: String(customer.user._id), reason: "SPAM", explanation: "Detailed harmful conduct evidence." })).status, 400);
  assert.equal((await create(customer.token, { reportedUserId: String(third.user._id), reason: "NOPE", explanation: "Detailed harmful conduct evidence." })).status, 400);
  assert.equal((await create(customer.token, { reportedUserId: String(third.user._id), reason: "SPAM", explanation: "short" })).status, 400);
  const list = await request("/api/v1/safety-reports", {}, customer.token); assert.equal(list.status, 200); const payload = await list.json() as { items: Array<{ id: string }> }; assert.equal(payload.items.length, 1);
  assert.equal((await request(`/api/v1/safety-reports/${payload.items[0].id}`, {}, third.token)).status, 404);
  assert.equal((await create(customer.token, { reportedUserId: String(creator.user._id), reason: "HARASSMENT", explanation: "Detailed harmful conduct evidence." })).status, 429);
});

test("booking/message references require an authorized real booking context", async () => {
  const customer = await identity("user", "context-customer"); const creator = await identity("creator", "context-creator"); const outsider = await identity("user", "context-outsider"); const missing = new mongoose.Types.ObjectId().toString();
  const booking = await Booking.create({ slotIds: [new mongoose.Types.ObjectId()], userId: customer.user._id, creatorId: creator.user._id, serviceId: new mongoose.Types.ObjectId(), serviceTitle: "Safety context", durationMinutes: 30, price: 100, currency: "USD", status: "CONFIRMED", paymentStatus: "PAID", isPayable: true, isPayoutEligible: false, isFinancialLocked: false, expiresAt: new Date(Date.now() + 86_400_000), serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80, totalAmount: 100 });
  assert.equal((await create(customer.token, { reportedUserId: String(creator.user._id), reason: "HARASSMENT", explanation: "Authorized booking context report.", bookingId: String(booking._id) })).status, 201);
  assert.equal((await create(customer.token, { reportedUserId: String(creator.user._id), reason: "THREATS", explanation: "Threat evidence with enough detail.", bookingId: missing })).status, 403);
  assert.equal((await create(outsider.token, { reportedUserId: String(creator.user._id), reason: "THREATS", explanation: "Threat evidence with enough detail.", messageId: missing })).status, 403);
});

test("admin review is authorized, auditable, requires rationale, and is concurrency safe", async () => {
  const reporter = await identity("user", "review-reporter"); const target = await identity("creator", "review-target"); const adminUser = await identity("admin", "review-admin");
  const created = await create(reporter.token, { reportedUserId: String(target.user._id), reason: "THREATS", explanation: "A complete report for review workflow." }); assert.equal(created.status, 201); const report = await created.json() as { report: { id: string } };
  assert.equal((await request("/api/v1/admin/safety-reports", {}, reporter.token)).status, 403);
  assert.equal((await request("/api/v1/admin/safety-reports", {}, adminUser.token)).status, 200);
  assert.equal((await request(`/api/v1/admin/safety-reports/${report.report.id}`, {}, adminUser.token)).status, 200);
  assert.equal((await request(`/api/v1/admin/safety-reports/${report.report.id}`, { method: "PATCH", body: JSON.stringify({ outcome: "RESOLVED", rationale: "short" }) }, adminUser.token)).status, 400);
  assert.equal((await request(`/api/v1/admin/safety-reports/${report.report.id}`, { method: "PATCH", body: JSON.stringify({ outcome: "UNDER_REVIEW" }) }, adminUser.token)).status, 200);
  const decisions = await Promise.all(["RESOLVED", "DISMISSED"].map((outcome) => request(`/api/v1/admin/safety-reports/${report.report.id}`, { method: "PATCH", body: JSON.stringify({ outcome, rationale: "A sufficiently detailed documented decision." }) }, adminUser.token)));
  assert.deepEqual(decisions.map((response) => response.status).sort(), [200, 409]);
  assert.equal(await AuditLog.countDocuments({ action: "SAFETY_REPORT_DECIDED" }), 2);
  const unchanged = await User.findById(target.user._id).lean(); assert.equal(unchanged?.governanceState, "ACTIVE");
});
