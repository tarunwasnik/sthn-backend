import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { NextFunction, Request, Response } from "express";

import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { upsertProfile, updateMyProfile } from "../../controllers/profile.controller";
import { migrateLegacyProfileMobileContact } from "../../services/profile/legacyMobileContactMigration.service";
import { startFaceVerificationSession } from "../../services/profile/faceVerificationSession.service";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

const invoke = (
  controller: (req: Request, res: Response, next: NextFunction) => unknown,
  request: Partial<Request>,
) => new Promise<unknown>((resolve, reject) => {
  const response = {
    status: () => response,
    json: (body: unknown) => {
      resolve(body);
      return response;
    },
  } as unknown as Response;
  const next: NextFunction = (error) => reject(error);
  controller(request as unknown as Request, response, next);
});

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

test("private onboarding accepts intended fields and ignores verification mass assignment", async () => {
  const user = await User.create({
    email: "profile-onboarding@test.local",
    password: "test-password",
    status: "pending_profile",
    governanceState: "ACTIVE",
  });
  const faceSession = await startFaceVerificationSession({ userId: String(user._id), avatar: "https://example.test/avatar.jpg" });
  await FaceVerificationSession.updateOne({ _id: faceSession._id }, { $set: { status: "CAPTURE_COMPLETE", acceptedCaptureCount: 5, captureCompletedAt: new Date() } });

  await invoke(upsertProfile, {
    user: { id: String(user._id), role: "user", status: "pending_profile" },
    body: {
      username: "privacy-safe-user",
      realName: "Private Account Name",
      dateOfBirth: "1990-01-01",
      mobileCountryCode: "+91",
      mobileNumber: "98765 43210",
      country: "India",
      city: "Mumbai",
      languages: ["English", "Hindi"],
      interests: ["Music"],
      bio: "A complete private profile.",
      avatar: "https://example.test/avatar.jpg",
      cover: "https://example.test/cover.jpg",
      profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
      profileStatus: "verified",
      rejectionReason: "client supplied",
      verificationSubmittedAt: "2000-01-01",
      userId: "client supplied",
    },
  });

  const profile = await UserProfile.findOne({ userId: user._id }).lean();
  assert.ok(profile);
  assert.equal(profile.realName, "Private Account Name");
  assert.equal("mobileCountryCode" in profile, false);
  assert.equal("mobileNumber" in profile, false);
  assert.equal(profile.country, "India");
  assert.equal(profile.city, "Mumbai");
  assert.deepEqual(profile.languages, ["English", "Hindi"]);
  assert.equal(profile.profileStatus, "pending_verification");
  assert.equal(profile.rejectionReason, "");
  assert.notEqual(profile.verificationSubmittedAt?.toISOString(), "2000-01-01T00:00:00.000Z");

  const account = await User.findById(user._id).lean();
  assert.equal(account?.mobileCountryCode, "+91");
  assert.equal(account?.mobileNumber, "9876543210");

  await assert.rejects(invoke(updateMyProfile, {
    user: { id: String(user._id), role: "user", status: "active" },
    body: {
      profileStatus: "verified",
      rejectionReason: "client supplied",
      mobileCountryCode: "+1",
      mobileNumber: "5551234567",
    },
  }));
  const afterUpdate = await UserProfile.findById(profile._id).lean();
  assert.equal(afterUpdate?.profileStatus, "pending_verification");
  assert.equal(afterUpdate?.rejectionReason, "");
  const accountAfterProfileUpdate = await User.findById(user._id).lean();
  assert.equal(accountAfterProfileUpdate?.mobileCountryCode, "+91");
  assert.equal(accountAfterProfileUpdate?.mobileNumber, "9876543210");
});

test("existing UserProfiles without new fields remain readable", async () => {
  const user = await User.create({
    email: "legacy-profile@test.local",
    password: "test-password",
    status: "active",
    governanceState: "ACTIVE",
  });
  const profile = await UserProfile.create({
    userId: user._id,
    username: "legacy-profile",
    dateOfBirth: new Date("1990-01-01"),
    interests: [],
    bio: "Legacy profile",
    avatar: "https://example.test/avatar.jpg",
    cover: "https://example.test/cover.jpg",
    profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
  });

  const reloaded = await UserProfile.findById(profile._id).lean();
  assert.ok(reloaded);
  assert.equal(reloaded.realName, null);
  assert.equal("mobileNumber" in reloaded, false);
  assert.equal(reloaded.country, null);
  assert.deepEqual(reloaded.languages, []);
});

test("legacy UserProfile mobile fields move to User before removal", async () => {
  const user = await User.create({
    email: "legacy-mobile@test.local",
    password: "test-password",
    status: "active",
    governanceState: "ACTIVE",
  });
  await UserProfile.collection.insertOne({
    userId: user._id,
    username: "legacy-mobile-profile",
    dateOfBirth: new Date("1990-01-01"),
    interests: [],
    bio: "Legacy profile",
    avatar: "https://example.test/avatar.jpg",
    cover: "https://example.test/cover.jpg",
    profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
    profileStatus: "verified",
    rejectionReason: "",
    mobileCountryCode: "+91",
    mobileNumber: "9876543210",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await migrateLegacyProfileMobileContact(String(user._id));

  const account = await User.findById(user._id).lean();
  const rawProfile = await UserProfile.collection.findOne({ userId: user._id });
  assert.equal(account?.mobileCountryCode, "+91");
  assert.equal(account?.mobileNumber, "9876543210");
  assert.equal("mobileCountryCode" in (rawProfile ?? {}), false);
  assert.equal("mobileNumber" in (rawProfile ?? {}), false);
});

test("onboarding rejects malformed mobile contact input", async () => {
  const user = await User.create({
    email: "invalid-mobile@test.local",
    password: "test-password",
    status: "pending_profile",
    governanceState: "ACTIVE",
  });

  await assert.rejects(
    invoke(upsertProfile, {
      user: { id: String(user._id), role: "user", status: "pending_profile" },
      body: {
        username: "invalid-mobile-profile",
        realName: "Private Account Name",
        dateOfBirth: "1990-01-01",
        mobileCountryCode: "91",
        mobileNumber: "not-a-number",
        country: "India",
        city: "Mumbai",
        languages: ["English"],
        interests: [],
        bio: "A complete private profile.",
        avatar: "https://example.test/avatar.jpg",
        cover: "https://example.test/cover.jpg",
        profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
      },
    }),
  );
  assert.equal(await UserProfile.exists({ userId: user._id }), null);
  const account = await User.findById(user._id).lean();
  assert.equal(account?.mobileNumber, null);
});
