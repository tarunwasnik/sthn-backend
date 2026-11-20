import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import express from "express";
import authRoutes from "../../routes/auth.routes";
import securityRoutes from "../../routes/v1/security.routes";
import { notFound } from "../../middlewares/notFound";
import { errorHandler } from "../../middlewares/errorHandler";
import { AuthSession } from "../../models/authSession.model";
import User from "../../models/User";
import { AuthThrottle } from "../../models/authThrottle.model";
import { AUTH_THROTTLE_POLICIES, consumeAuthThrottle } from "../../services/auth/authThrottle.service";
import { setBreachedPasswordTransportForTests } from "../../services/auth/breachedPassword.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "session-security-test-secret";
setBreachedPasswordTransportForTests(async () => "");
const app = express(); app.use(express.json()); app.use("/api/auth", authRoutes); app.use("/api/v1/security", securityRoutes); app.use(notFound); app.use(errorHandler);
let server: http.Server; let baseUrl = "";
before(async () => { await connectPhase7HDatabase(); server = http.createServer(app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); if (!address || typeof address === "string") throw new Error("bind failed"); baseUrl = `http://127.0.0.1:${address.port}`; }, { timeout: 120_000 });
beforeEach(clearPhase7HDatabase); after(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); await disconnectPhase7HDatabase(); });
const post = (path: string, body: unknown, token?: string) => fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const patch = (path: string, body: unknown, token: string) => fetch(`${baseUrl}${path}`, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

for (const authProvider of ["local", "google"] as const) {
  test(`/auth/me allowlists the ${authProvider} provider without private account fields`, async () => {
    const user = await User.create({ email: `${authProvider}@contract.test`, authProvider, password: "private-password-hash", googleId: "private-google-id", mobileNumber: "private-phone", role: "user", status: "active" });
    const session = await AuthSession.create({ userId: user._id, expiresAt: new Date(Date.now() + 60_000) });
    const token = jwt.sign({ id: String(user._id), role: "user", sid: String(session._id) }, process.env.JWT_SECRET!);
    const headers = { authorization: `Bearer ${token}` };
    const response = await fetch(`${baseUrl}/api/auth/me`, { headers });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: String(user._id), email: user.email, role: "user", status: "active", creatorStatus: "none", authProvider });
    const sessions = await fetch(`${baseUrl}/api/v1/security/sessions`, { headers });
    const list = await sessions.json() as { sessions: Array<{ id: string; current: boolean; createdAt: string }> };
    assert.equal(list.sessions[0].createdAt, session.createdAt.toISOString());
    assert.equal(list.sessions[0].current, true);
    assert.equal(list.sessions[0].id, String(session._id));
    assert.equal((await fetch(`${baseUrl}/api/auth/me`)).status, 401);
  });
}

test("registration issues a tracked session and legacy tokens are rejected", async () => {
  const registration = await post("/api/auth/register", { email: "session@test.local", password: "Long Local!1 passphrase" }); assert.equal(registration.status, 201);
  const body = await registration.json() as { token: string }; const payload = jwt.decode(body.token) as { id: string; sid: string }; assert.ok(payload.sid); assert.equal(await AuthSession.countDocuments({ userId: payload.id }), 1);
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${body.token}` } })).status, 200);
  const legacy = jwt.sign({ id: payload.id, role: "user" }, process.env.JWT_SECRET!); assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${legacy}` } })).status, 401);
});

test("obsolete Creator registration intent is ignored and User onboarding is used", async () => {
  const registration = await post("/api/auth/register", {
    email: "creator-intent@test.local",
    password: "Creator Intent Secure!1 phrase",
    creatorOnboardingIntent: "direct_creator",
  });
  assert.equal(registration.status, 201);
  const { token } = await registration.json() as { token: string };
  const account = await User.findOne({ email: "creator-intent@test.local" }).lean();
  assert.equal(account?.creatorOnboardingIntent, "none");
  assert.equal(account?.role, "user");
  assert.equal(account?.creatorStatus, "none");
  const entry = await fetch(`${baseUrl}/api/auth/entry`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(entry.status, 200);
  assert.equal((await entry.json() as { entryRoute: string }).entryRoute, "/onboarding");
});
test("password policy and session revocation are enforced through HTTP", async () => {
  assert.equal((await post("/api/auth/register", { email: "short@test.local", password: "short" })).status, 400);
  const registration = await post("/api/auth/register", { email: "revoke@test.local", password: "Valid Passphrase!12" }); const { token } = await registration.json() as { token: string };
  const sessions = await fetch(`${baseUrl}/api/v1/security/sessions`, { headers: { authorization: `Bearer ${token}` } }); assert.equal(sessions.status, 200); const list = await sessions.json() as { sessions: Array<{ id: string; current: boolean }> }; assert.equal(list.sessions.length, 1); assert.equal(list.sessions[0].current, true);
  assert.equal((await fetch(`${baseUrl}/api/v1/security/sessions/${list.sessions[0].id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${token}` } })).status, 401);
});
test("password changes preserve the current session and revoke other login sessions", async () => {
  const registration = await post("/api/auth/register", { email: "password@test.local", password: "Original Secure!1 passphrase" }); const { token } = await registration.json() as { token: string };
  const login = await post("/api/auth/login", { email: "password@test.local", password: "Original Secure!1 passphrase" }); assert.equal(login.status, 200); const other = (await login.json() as { token: string }).token;
  assert.equal((await patch("/api/v1/security/password", { currentPassword: "wrong password", newPassword: "Different Secure!2 passphrase" }, token)).status, 400);
  assert.equal((await patch("/api/v1/security/password", { currentPassword: "Original Secure!1 passphrase", newPassword: "Original Secure!1 passphrase" }, token)).status, 400);
  assert.equal((await patch("/api/v1/security/password", { currentPassword: "Original Secure!1 passphrase", newPassword: "Different Secure!2 passphrase" }, token)).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${token}` } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${other}` } })).status, 401);
  assert.equal((await post("/api/auth/login", { email: "password@test.local", password: "Original Secure!1 passphrase" })).status, 400);
  assert.equal((await post("/api/auth/login", { email: "password@test.local", password: "Different Secure!2 passphrase" })).status, 200);
});
test("session ownership and revoke-other preserve the requesting session", async () => {
  const a = await post("/api/auth/register", { email: "owner-a@test.local", password: "Owner A Secure!1 phrase" }); const tokenA = (await a.json() as { token: string }).token;
  const aSecond = await post("/api/auth/login", { email: "owner-a@test.local", password: "Owner A Secure!1 phrase" }); const tokenA2 = (await aSecond.json() as { token: string }).token;
  const b = await post("/api/auth/register", { email: "owner-b@test.local", password: "Owner B Secure!1 phrase" }); const tokenB = (await b.json() as { token: string }).token;
  const bSessions = await fetch(`${baseUrl}/api/v1/security/sessions`, { headers: { authorization: `Bearer ${tokenB}` } }); const bId = (await bSessions.json() as { sessions: Array<{ id: string }> }).sessions[0].id;
  assert.equal((await fetch(`${baseUrl}/api/v1/security/sessions/${bId}`, { method: "DELETE", headers: { authorization: `Bearer ${tokenA}` } })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/v1/security/sessions/others`, { method: "DELETE", headers: { authorization: `Bearer ${tokenA}` } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${tokenA}` } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${tokenA2}` } })).status, 401);
});

test("login failures are generic, concurrent failures persist, and cooldown blocks further bcrypt work", async () => {
  const registration = await post("/api/auth/register", { email: "cooldown@test.local", password: "Original Secure!1 passphrase" });
  assert.equal(registration.status, 201);
  const unknown = await post("/api/auth/login", { email: "missing@test.local", password: "wrong password" });
  const invalid = await post("/api/auth/login", { email: "cooldown@test.local", password: "wrong password" });
  assert.equal(unknown.status, 400); assert.equal(invalid.status, 400);
  assert.equal((await unknown.json() as { message: string }).message, (await invalid.json() as { message: string }).message);
  await Promise.all(Array.from({ length: 4 }, () => post("/api/auth/login", { email: "cooldown@test.local", password: "wrong password" })));
  const user = await User.findOne({ email: "cooldown@test.local" }).lean();
  assert.ok((user?.loginFailureCount ?? 0) >= 5); assert.ok(user?.loginCooldownUntil && user.loginCooldownUntil > new Date());
  const blocked = await post("/api/auth/login", { email: "cooldown@test.local", password: "Original Secure!1 passphrase" });
  assert.equal(blocked.status, 429); assert.ok(blocked.headers.get("retry-after"));
});

test("persistent throttle is shared across calls and cleans up by expiry", async () => {
  const identity = "test-network";
  const policy = { ...AUTH_THROTTLE_POLICIES.loginIp, limit: 2, windowMs: 60_000, blockMs: 60_000 };
  assert.equal((await consumeAuthThrottle(policy, identity)).allowed, true);
  assert.equal((await consumeAuthThrottle(policy, identity)).allowed, true);
  const blocked = await consumeAuthThrottle(policy, identity); assert.equal(blocked.allowed, false); assert.ok(blocked.retryAfterSeconds > 0);
  const record = await AuthThrottle.findOne({ scope: policy.scope }).lean(); assert.ok(record?.keyHash); assert.equal(record?.keyHash.includes(identity), false);
});

test("breached passwords are rejected before registration persists an account", async () => {
  const password = "Breached Password!1";
  const hash = crypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  setBreachedPasswordTransportForTests(async (prefix) => prefix === hash.slice(0, 5) ? `${hash.slice(5)}:10\n` : "");
  const response = await post("/api/auth/register", { email: "breached@test.local", password });
  assert.equal(response.status, 400); assert.equal((await response.json() as { code: string }).code, "PASSWORD_BREACHED");
  assert.equal(await User.countDocuments({ email: "breached@test.local" }), 0);
  setBreachedPasswordTransportForTests(async () => "");
});

test("breached password changes preserve the existing password and session", async () => {
  const original = "Original Secure!1 passphrase";
  const breached = "Breached Password!1";
  const registration = await post("/api/auth/register", { email: "change-breached@test.local", password: original });
  const { token } = await registration.json() as { token: string };
  const hash = crypto.createHash("sha1").update(breached, "utf8").digest("hex").toUpperCase();
  setBreachedPasswordTransportForTests(async (prefix) => prefix === hash.slice(0, 5) ? `${hash.slice(5)}:10\n` : "");
  const response = await patch("/api/v1/security/password", { currentPassword: original, newPassword: breached }, token);
  assert.equal(response.status, 400); assert.equal((await response.json() as { code: string }).code, "PASSWORD_BREACHED");
  assert.equal((await post("/api/auth/login", { email: "change-breached@test.local", password: original })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${token}` } })).status, 200);
  setBreachedPasswordTransportForTests(async () => "");
});

test("logout revokes only the verified current session", async () => {
  const registered = await post("/api/auth/register", { email: "logout@test.local", password: "Logout Secure!1 passphrase" });
  const firstToken = (await registered.json() as { token: string }).token;
  const secondLogin = await post("/api/auth/login", { email: "logout@test.local", password: "Logout Secure!1 passphrase" });
  const secondToken = (await secondLogin.json() as { token: string }).token;
  const response = await post("/api/v1/security/sessions/current/logout", {}, firstToken);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { loggedOut: true });
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${firstToken}` } })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${secondToken}` } })).status, 200);
  assert.equal((await post("/api/v1/security/sessions/current/logout", {}, firstToken)).status, 401);
  assert.equal((await post("/api/v1/security/sessions/current/logout", {})).status, 401);
});
