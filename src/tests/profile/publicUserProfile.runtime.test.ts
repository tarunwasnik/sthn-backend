import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";
import type { NextFunction, Request, Response } from "express";

import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { getUserPublicProfile } from "../../controllers/user.controller";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

type ControllerResult = { statusCode?: number; body?: unknown };

const invokePublicProfile = (userId: string) => new Promise<ControllerResult>((resolve, reject) => {
  const result: ControllerResult = {};
  const response = {
    status: (statusCode: number) => {
      result.statusCode = statusCode;
      return response;
    },
    json: (body: unknown) => {
      result.body = body;
      resolve(result);
      return response;
    },
  } as unknown as Response;
  const next: NextFunction = (error) => reject(error);

  getUserPublicProfile({ params: { userId } } as unknown as Request, response, next);
});

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

test("public user profile returns only its allowlisted DTO and derives age", async () => {
  const suffix = new Types.ObjectId().toString();
  const user = await User.create({
    email: `public-profile-${suffix}@test.local`,
    password: "test",
    status: "active",
    governanceState: "ACTIVE",
  });
  const profile = await UserProfile.create({
    userId: user._id,
    username: `public-profile-${suffix}`,
    realName: "Private Real Name",
    dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
    country: "India",
    city: "Mumbai",
    languages: ["English", "Hindi"],
    interests: ["music", "travel"],
    bio: "Public biography",
    avatar: "https://example.test/avatar.jpg",
    cover: "https://example.test/private-cover.jpg",
    profilePhotos: ["https://example.test/photo-1.jpg", "https://example.test/photo-2.jpg"],
    profileStatus: "rejected",
    rejectionReason: "Private review feedback",
    verificationSubmittedAt: new Date("2024-01-01T00:00:00.000Z"),
  });

  await UserProfile.collection.updateOne(
    { _id: profile._id },
    { $set: { mobileCountryCode: "+91", mobileNumber: "9876543210" } },
  );

  const result = await invokePublicProfile(String(user._id));
  assert.equal(result.statusCode, 200);
  const body = result.body as { profile: Record<string, unknown> };

  assert.deepEqual(Object.keys(body.profile).sort(), [
    "age", "avatar", "bio", "city", "country", "cover", "id", "interests",
    "languages", "profilePhotos", "username",
  ]);
  assert.equal(body.profile.id, String(profile._id));
  assert.equal(body.profile.username, profile.username);
  assert.equal(body.profile.avatar, profile.avatar);
  assert.equal(body.profile.cover, profile.cover);
  assert.equal(body.profile.country, profile.country);
  assert.equal(body.profile.city, profile.city);
  assert.deepEqual(body.profile.languages, profile.languages);
  assert.deepEqual(body.profile.interests, profile.interests);
  assert.deepEqual(body.profile.profilePhotos, profile.profilePhotos);
  assert.equal(body.profile.age, new Date().getUTCFullYear() - 1990);

  for (const privateField of [
    "_id", "__v", "userId", "realName", "dateOfBirth", "mobileCountryCode", "mobileNumber", "profileStatus",
    "rejectionReason", "verificationSubmittedAt", "createdAt", "updatedAt",
  ]) {
    assert.equal(privateField in body.profile, false, `${privateField} must not be public`);
  }
});

test("public user profile returns bounded errors for unknown and malformed identifiers", async () => {
  const unknown = await invokePublicProfile(String(new Types.ObjectId()));
  assert.equal(unknown.statusCode, 404);
  assert.deepEqual(unknown.body, { message: "Profile not found" });

  const malformed = await invokePublicProfile("not-an-object-id");
  assert.equal(malformed.statusCode, 400);
  assert.deepEqual(malformed.body, { message: "Invalid userId" });
});
