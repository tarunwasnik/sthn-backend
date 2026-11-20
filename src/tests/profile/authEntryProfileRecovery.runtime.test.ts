import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { Request, Response } from "express";
import type { Types } from "mongoose";

import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { authEntry } from "../../controllers/authEntry.controller";
import { CreatorApplication } from "../../models/creatorApplication.model";
import { restrictPendingDirectCreatorBooking } from "../../middlewares/directCreatorBooking.middleware";
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

test("auth entry routes active incomplete and rejected profiles to onboarding recovery", async () => {
  const active = await User.create({ email: "entry-incomplete@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  await profile(active._id, "incomplete");
  assert.equal((await invoke({ id: String(active._id), _id: active._id, status: "active", role: "user" })).entryRoute, "/onboarding");
  const rejected = await User.create({ email: "entry-rejected@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  await profile(rejected._id, "rejected");
  assert.equal((await invoke({ id: String(rejected._id), _id: rejected._id, status: "active", role: "user" })).entryRoute, "/onboarding");
  for (const status of ["pending_verification", "verified"] as const) {
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

test("an old direct Creator intent returns to User onboarding without role elevation", async () => {
  const applicant = await User.create({
    email: "entry-direct-creator@test.local",
    password: "test-password",
    status: "pending_profile",
    role: "user",
    creatorStatus: "none",
    creatorOnboardingIntent: "direct_creator",
    governanceState: "ACTIVE",
  });
  const entry = await invoke({ id: String(applicant._id), _id: applicant._id, status: "pending_profile", role: "user" });
  assert.equal(entry.entryRoute, "/onboarding");
  assert.equal((await User.findById(applicant._id))?.role, "user");
});

test("a previously submitted direct Creator returns to User onboarding", async () => {
  const applicant = await User.create({
    email: "entry-submitted-direct-creator@test.local",
    password: "test-password",
    status: "pending_profile",
    role: "user",
    creatorStatus: "pending",
    creatorOnboardingIntent: "direct_creator",
    governanceState: "ACTIVE",
  });
  await CreatorApplication.create({ userId: applicant._id, applicationJourney: "direct_creator", status: "submitted", displayName: "Applicant", primaryCategory: "Music", country: "India", city: "Pune", currency: "INR", publicBio: "Applicant", languages: ["English"], avatarUrl: "https://example.test/avatar", coverUrl: "https://example.test/cover", media: ["https://example.test/one", "https://example.test/two"] });
  const entry = await invoke({ id: String(applicant._id), _id: applicant._id, status: "pending_profile", role: "user", creatorStatus: "pending" });
  assert.equal(entry.entryType, "ONBOARDING");
  assert.equal(entry.entryRoute, "/onboarding");
  assert.equal((await User.findById(applicant._id))?.role, "user");
});

test("an older submitted direct Creator with no UserProfile returns to User onboarding", async () => {
  const applicant = await User.create({ email: "entry-legacy-submitted@test.local", password: "test-password", status: "pending_profile", role: "user", creatorStatus: "none", creatorOnboardingIntent: "direct_creator", governanceState: "ACTIVE" });
  await CreatorApplication.create({ userId: applicant._id, applicationJourney: "direct_creator", status: "submitted", displayName: "Applicant", primaryCategory: "Music", country: "India", city: "Pune", currency: "INR", publicBio: "Applicant", languages: ["English"], avatarUrl: "https://example.test/avatar", coverUrl: "https://example.test/cover", media: ["https://example.test/one", "https://example.test/two"] });
  const entry = await invoke(applicant as unknown as Record<string, unknown>);
  assert.equal(entry.entryType, "ONBOARDING");
  assert.equal(entry.entryRoute, "/onboarding");
  assert.equal((await User.findById(applicant._id))?.creatorStatus, "none");
});

test("auth entry resolves an actual Mongoose User document for a verified User upgrade", async () => {
  const user = await User.create({ email: "entry-mongoose-upgrade@test.local", password: "test-password", status: "active", role: "user", creatorStatus: "pending", governanceState: "ACTIVE" });
  await profile(user._id, "verified");
  const entry = await invoke(user as unknown as Record<string, unknown>);
  assert.equal(entry.entryType, "USER");
  assert.equal(entry.entryRoute, "/dashboard/user");
});

test("customer booking is denied for a submitted direct applicant but not a verified User upgrade", async () => {
  const applicant = await User.create({ email: "booking-direct@test.local", password: "test-password", status: "pending_profile", role: "user", creatorStatus: "pending", governanceState: "ACTIVE" });
  await CreatorApplication.create({ userId: applicant._id, applicationJourney: "direct_creator", status: "submitted", displayName: "Applicant", primaryCategory: "Music", country: "India", city: "Pune", currency: "INR", publicBio: "Applicant", languages: ["English"], avatarUrl: "https://example.test/avatar", coverUrl: "https://example.test/cover", media: ["https://example.test/one", "https://example.test/two"] });
  let code = 0;
  let nextCalled = false;
  const response = { status: (value: number) => { code = value; return { json: () => undefined }; } } as unknown as Response;
  await restrictPendingDirectCreatorBooking({ user: applicant } as unknown as Request, response, () => { nextCalled = true; });
  assert.equal(code, 403);
  assert.equal(nextCalled, false);
  const upgrade = await User.create({ email: "booking-upgrade@test.local", password: "test-password", status: "active", role: "user", creatorStatus: "pending", governanceState: "ACTIVE" });
  await restrictPendingDirectCreatorBooking({ user: upgrade } as unknown as Request, response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});
