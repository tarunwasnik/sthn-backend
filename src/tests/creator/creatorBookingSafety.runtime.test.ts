import assert from "node:assert/strict";
import http from "node:http";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import creatorBookingSafetyRoutes from "../../routes/v1/creatorBookingSafety.routes";
import { notFound } from "../../middlewares/notFound";
import { errorHandler } from "../../middlewares/errorHandler";
import User from "../../models/User";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { CreatorCustomerBlock } from "../../models/creatorCustomerBlock.model";
import { UserProfile } from "../../models/userProfile.model";
import { AuthSession } from "../../models/authSession.model";
import { assertCreatorBookingAdmission } from "../../services/creator/creatorBookingSafety.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "creator-booking-safety-test-secret";
const app = express(); app.use(express.json()); app.use("/api/v1/creator", creatorBookingSafetyRoutes); app.use(notFound); app.use(errorHandler);
let server: http.Server; let baseUrl = "";
before(async () => { await connectPhase7HDatabase(); server = http.createServer(app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); if (!address || typeof address === "string") throw new Error("bind failed"); baseUrl = `http://127.0.0.1:${address.port}`; }, { timeout: 120_000 });
beforeEach(clearPhase7HDatabase);
after(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); await disconnectPhase7HDatabase(); });

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const tokenFor = async (user: { _id: Types.ObjectId; role: string }) => { const session = await AuthSession.create({ userId: user._id, expiresAt: new Date(Date.now() + 60_000) }); return jwt.sign({ id: String(user._id), role: user.role, sid: String(session._id) }, process.env.JWT_SECRET!); };
async function fixture(suffix = new Types.ObjectId().toString()) {
  const creator = await User.create({ email: `creator-${suffix}@test.local`, password: "unused", role: "creator", status: "active", governanceState: "ACTIVE", creatorStatus: "approved" });
  const customer = await User.create({ email: `customer-${suffix}@test.local`, password: "unused", role: "user", status: "active", governanceState: "ACTIVE" });
  await CreatorProfile.create({ userId: creator._id, slug: `creator-${suffix}`, displayName: "Safety Creator", primaryCategory: "Music", country: "IN", city: "Pune", currency: "INR", status: "active" });
  await UserProfile.create({ userId: customer._id, username: `customer-${suffix}`, dateOfBirth: new Date("1990-01-01"), interests: [], bio: "Customer", avatar: "avatar", cover: "cover", profilePhotos: ["one", "two"], profileStatus: "verified" });
  return { creator, customer, username: `customer-${suffix}`, token: await tokenFor(creator) };
}

test("an active Creator can pause and resume only their new booking admission", async () => {
  const { creator, customer, token } = await fixture();
  const initial = await fetch(`${baseUrl}/api/v1/creator/booking-safety`, { headers: auth(token) }); assert.equal(initial.status, 200); assert.equal((await initial.json() as { acceptingNewBookings: boolean }).acceptingNewBookings, true);
  const paused = await fetch(`${baseUrl}/api/v1/creator/booking-safety`, { method: "PATCH", headers: { "content-type": "application/json", ...auth(token) }, body: JSON.stringify({ acceptingNewBookings: false }) }); assert.equal(paused.status, 200);
  await assert.rejects(() => assertCreatorBookingAdmission({ creatorId: creator._id, customerId: customer._id }), { message: "This creator is currently unable to receive new booking requests." });
  const resumed = await fetch(`${baseUrl}/api/v1/creator/booking-safety`, { method: "PATCH", headers: { "content-type": "application/json", ...auth(token) }, body: JSON.stringify({ acceptingNewBookings: true }) }); assert.equal(resumed.status, 200);
  await assert.doesNotReject(() => assertCreatorBookingAdmission({ creatorId: creator._id, customerId: customer._id }));
});

test("blocks are directional, list only minimal customer data, and unblock restores admission", async () => {
  const { creator, customer, username, token } = await fixture();
  const blocked = await fetch(`${baseUrl}/api/v1/creator/blocked-customers/${customer._id}`, { method: "POST", headers: auth(token) }); assert.equal(blocked.status, 201);
  assert.equal(await CreatorCustomerBlock.countDocuments({ creatorId: creator._id, customerId: customer._id }), 1);
  const list = await fetch(`${baseUrl}/api/v1/creator/booking-safety`, { headers: auth(token) }); const body = await list.json() as { blockedCustomers: Array<{ id: string; username: string; avatarUrl: string | null }> }; assert.deepEqual(body.blockedCustomers.map(({ id, username, avatarUrl }) => ({ id, username, avatarUrl })), [{ id: String(customer._id), username, avatarUrl: "avatar" }]);
  await assert.rejects(() => assertCreatorBookingAdmission({ creatorId: creator._id, customerId: customer._id }), { message: "This creator is currently unable to receive new booking requests." });
  assert.equal((await fetch(`${baseUrl}/api/v1/creator/blocked-customers/${customer._id}`, { method: "DELETE", headers: auth(token) })).status, 204);
  await assert.doesNotReject(() => assertCreatorBookingAdmission({ creatorId: creator._id, customerId: customer._id }));
});

test("a Creator cannot manage another Creator's directed block", async () => {
  const first = await fixture("first-" + new Types.ObjectId().toString());
  const second = await fixture("second-" + new Types.ObjectId().toString());
  assert.equal((await fetch(`${baseUrl}/api/v1/creator/blocked-customers/${first.customer._id}`, { method: "POST", headers: auth(first.token) })).status, 201);
  assert.equal((await fetch(`${baseUrl}/api/v1/creator/blocked-customers/${first.customer._id}`, { method: "DELETE", headers: auth(second.token) })).status, 404);
  assert.equal(await CreatorCustomerBlock.countDocuments({ creatorId: first.creator._id, customerId: first.customer._id }), 1);
});

test("block endpoints reject customer callers, self-blocking, invalid identities, and duplicates", async () => {
  const { creator, customer, token } = await fixture();
  const customerToken = await tokenFor(customer);
  assert.equal((await fetch(`${baseUrl}/api/v1/creator/booking-safety`, { headers: auth(customerToken) })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/v1/creator/blocked-customers/${creator._id}`, { method: "POST", headers: auth(token) })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/v1/creator/blocked-customers/not-an-id`, { method: "POST", headers: auth(token) })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/v1/creator/blocked-customers/${customer._id}`, { method: "POST", headers: auth(token) })).status, 201);
  assert.equal((await fetch(`${baseUrl}/api/v1/creator/blocked-customers/${customer._id}`, { method: "POST", headers: auth(token) })).status, 409);
});

test("concurrent pause and block operations leave both persisted admission controls authoritative", async () => {
  const { creator, customer, token } = await fixture();
  const [pause, block] = await Promise.all([
    fetch(`${baseUrl}/api/v1/creator/booking-safety`, { method: "PATCH", headers: { "content-type": "application/json", ...auth(token) }, body: JSON.stringify({ acceptingNewBookings: false }) }),
    fetch(`${baseUrl}/api/v1/creator/blocked-customers/${customer._id}`, { method: "POST", headers: auth(token) }),
  ]);
  assert.equal(pause.status, 200);
  assert.equal(block.status, 201);
  const profile = await CreatorProfile.findOne({ userId: creator._id }).lean();
  const relationship = await CreatorCustomerBlock.exists({ creatorId: creator._id, customerId: customer._id });
  assert.ok(profile && (profile.acceptingNewBookings === false || !!relationship));
  await assert.rejects(() => assertCreatorBookingAdmission({ creatorId: creator._id, customerId: customer._id }));
});
