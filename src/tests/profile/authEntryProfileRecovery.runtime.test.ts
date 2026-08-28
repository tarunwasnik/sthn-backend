import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { Request, Response } from "express";
import type { Types } from "mongoose";

import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { authEntry } from "../../controllers/authEntry.controller";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

const invoke = (user: Record<string, unknown>) => new Promise<Record<string, unknown>>((resolve) => {
  const response = { status: () => response, json: (body: Record<string, unknown>) => { resolve(body); return response; } } as unknown as Response;
  authEntry({ user } as unknown as Request, response);
});
const profile = (userId: Types.ObjectId, status: "incomplete" | "pending_verification" | "verified" | "rejected") => UserProfile.create({ userId, username: `entry-${status}-${Date.now()}`, dateOfBirth: new Date("1990-01-01"), interests: [], bio: "Entry profile.", avatar: "a", cover: "c", profilePhotos: ["one", "two"], profileStatus: status });

test("auth entry routes only active incomplete profiles to onboarding recovery", async () => {
  const active = await User.create({ email: "entry-incomplete@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  await profile(active._id, "incomplete");
  assert.equal((await invoke({ id: String(active._id), _id: active._id, status: "active", role: "user" })).entryRoute, "/onboarding");
  for (const status of ["pending_verification", "verified", "rejected"] as const) {
    const user = await User.create({ email: `entry-${status}@test.local`, password: "test-password", status: "active", governanceState: "ACTIVE" });
    await profile(user._id, status);
    assert.equal((await invoke({ id: String(user._id), _id: user._id, status: "active", role: "user" })).entryRoute, "/dashboard/user");
  }
});

test("auth entry preserves Admin and Creator destinations", async () => {
  const admin = await User.create({ email: "entry-admin@test.local", password: "test-password", status: "active", role: "admin", governanceState: "ACTIVE" });
  await profile(admin._id, "incomplete");
  assert.equal((await invoke({ id: String(admin._id), _id: admin._id, status: "active", role: "admin" })).entryRoute, "/admin/entry");
  const creator = await User.create({ email: "entry-creator@test.local", password: "test-password", status: "active", role: "creator", governanceState: "ACTIVE" });
  await profile(creator._id, "verified");
  assert.equal((await invoke({ id: String(creator._id), _id: creator._id, status: "active", role: "creator" })).entryRoute, "/dashboard/creator");
});
