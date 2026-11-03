import assert from "node:assert/strict";
import http from "node:http";
import { after, before, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import app from "../../app";
import User from "../../models/User";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "creator-profile-admission-route-test";
let server: http.Server; let baseUrl: string;
async function seed() { const user = await User.create({ email: `creator-profile-${new Types.ObjectId()}@test.local`, password: "test", role: "creator", status: "active", governanceState: "ACTIVE", creatorStatus: "approved" }); const profile = await CreatorProfile.create({ userId: user._id, slug: `creator-${user._id}`, displayName: "Creator", primaryCategory: "Music", country: "India", city: "Pune", currency: "INR", avatarUrl: "https://legacy.test/avatar", coverUrl: "https://legacy.test/cover", media: ["https://legacy.test/one", "https://legacy.test/two"] }); return { user, profile }; }
async function patch(userId: Types.ObjectId, body: object) { const token = jwt.sign({ id: String(userId), role: "creator" }, process.env.JWT_SECRET!); return fetch(`${baseUrl}/api/v1/creator/profile`, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); }
before(async () => { await connectPhase7HDatabase(); server = http.createServer(app); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); if (!address || typeof address === "string") throw new Error("Test server did not bind"); baseUrl = `http://127.0.0.1:${address.port}`; }, { timeout: 120_000 });
beforeEach(clearPhase7HDatabase); after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await disconnectPhase7HDatabase(); });

test("non-media PATCH and exact approval-derived UNCHANGED claims preserve creator media", async () => {
  const { user, profile } = await seed();
  let response = await patch(user._id, { displayName: "Updated Creator", city: "Mumbai" });
  assert.equal(response.status, 200);
  let saved = await CreatorProfile.findById(profile._id).lean();
  assert.equal(saved?.displayName, "Updated Creator"); assert.equal(saved?.avatarUrl, "https://legacy.test/avatar"); assert.deepEqual(saved?.media, ["https://legacy.test/one", "https://legacy.test/two"]);
  response = await patch(user._id, { avatar: { kind: "UNCHANGED", reference: "https://legacy.test/avatar" }, cover: { kind: "UNCHANGED", reference: "https://legacy.test/cover" }, media: [{ kind: "UNCHANGED", reference: "https://legacy.test/two" }, { kind: "UNCHANGED", reference: "https://legacy.test/one" }] });
  assert.equal(response.status, 200); saved = await CreatorProfile.findById(profile._id).lean(); assert.deepEqual(saved?.media, ["https://legacy.test/two", "https://legacy.test/one"]);
});

test("route rejects raw or forged unchanged media without changing the owned profile", async () => {
  const { user, profile } = await seed();
  assert.equal((await patch(user._id, { avatarUrl: "https://raw.test/avatar" })).status, 400);
  assert.equal((await patch(user._id, { avatar: { kind: "UNCHANGED", reference: "https://foreign.test/avatar" } })).status, 400);
  const saved = await CreatorProfile.findById(profile._id).lean(); assert.equal(saved?.avatarUrl, "https://legacy.test/avatar");
});

test("route requires authentication and cannot update another creator profile", async () => {
  const first = await seed(); const second = await seed();
  assert.equal((await fetch(`${baseUrl}/api/v1/creator/profile`, { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" })).status, 401);
  await patch(first.user._id, { displayName: "Only First" });
  assert.equal((await CreatorProfile.findById(second.profile._id))?.displayName, "Creator");
});
