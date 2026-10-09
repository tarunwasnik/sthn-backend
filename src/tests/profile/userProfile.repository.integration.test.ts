import assert from "node:assert/strict";
import test from "node:test";
import mongoose, { Types } from "mongoose";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../financial/phase7h/helpers/database";
import { UserProfile } from "../../models/userProfile.model";
import { userProfileRepository } from "../../repositories/userProfile.repository";

const user = () => new Types.ObjectId();
const make = (userId: Types.ObjectId) => ({
  userId,
  username: `u${userId}`,
  dateOfBirth: new Date("1990-01-01"),
  interests: [],
  bio: "b",
  avatar: "a",
  cover: "c",
  profilePhotos: ["1", "2"],
  profileStatus: "verified" as const,
  verificationSubmissionVersion: 0,
});

const inTransaction = async <T>(work: (session: mongoose.ClientSession) => Promise<T>) => {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
};

test.before(async () => {
  process.env.NODE_ENV = "test";
  await connectPhase7HDatabase();
});
test.beforeEach(clearPhase7HDatabase);
test.after(disconnectPhase7HDatabase);

test("transactionally creates an owned profile", async () => {
  const userId = user();
  const created = await inTransaction((session) =>
    userProfileRepository.createOwned(make(userId), session));

  assert.equal(created.userId.toString(), userId.toString());
  assert.equal(created.__v, 0);
  assert.equal((await UserProfile.findOne({ userId }))?.username, `u${userId}`);
});

test("updates only when the expected database version matches", async () => {
  const userId = user();
  const profile = await UserProfile.create(make(userId));
  const updated = await inTransaction((session) =>
    userProfileRepository.updateOwnedAtVersion({
      profileId: profile._id,
      userId,
      expectedVersion: profile.__v,
      set: { bio: "next" },
      session,
    }));

  assert.equal(updated?.bio, "next");
  assert.equal(updated?.__v, 1);
  assert.equal((await UserProfile.findById(profile._id))?.bio, "next");
});

test("returns an explicit conflict result for a stale version", async () => {
  const userId = user();
  const profile = await UserProfile.create(make(userId));
  const result = await inTransaction((session) =>
    userProfileRepository.updateOwnedAtVersion({
      profileId: profile._id,
      userId,
      expectedVersion: 99,
      set: { bio: "bad" },
      session,
    }));

  assert.equal(result, null);
  assert.equal((await UserProfile.findById(profile._id))?.bio, "b");
});

test("aborted transactions restore the original profile and version", async () => {
  const userId = user();
  const profile = await UserProfile.create(make(userId));

  await assert.rejects(inTransaction(async (session) => {
    const updated = await userProfileRepository.updateOwnedAtVersion({
      profileId: profile._id,
      userId,
      expectedVersion: 0,
      set: { bio: "must-not-commit" },
      session,
    });
    assert.equal(updated?.bio, "must-not-commit");
    throw new Error("deliberate transaction abort");
  }), /deliberate transaction abort/);

  const persisted = await UserProfile.findById(profile._id).lean();
  assert.equal(persisted?.bio, "b");
  assert.equal(persisted?.__v, 0);
});

test("concurrent conditional updates cannot silently overwrite each other", async () => {
  const userId = user();
  const profile = await UserProfile.create(make(userId));
  const update = (bio: string) => inTransaction((session) =>
    userProfileRepository.updateOwnedAtVersion({
      profileId: profile._id,
      userId,
      expectedVersion: 0,
      set: { bio },
      session,
    }));

  const results = await Promise.all([update("one"), update("two")]);
  assert.equal(results.filter((result) => result !== null).length, 1);
  const persisted = await UserProfile.findById(profile._id).lean();
  assert.ok(["one", "two"].includes(persisted?.bio ?? ""));
  assert.equal(persisted?.__v, 1);
});

test("legacy profiles without a persisted version key are updateable as version zero", async () => {
  const userId = user();
  const profile = await UserProfile.create(make(userId));
  await UserProfile.collection.updateOne({ _id: profile._id }, { $unset: { __v: "" } });

  const updated = await inTransaction((session) =>
    userProfileRepository.updateOwnedAtVersion({
      profileId: profile._id,
      userId,
      expectedVersion: 0,
      set: { bio: "legacy-updated" },
      session,
    }));

  assert.equal(updated?.bio, "legacy-updated");
  assert.equal(updated?.__v, 1);
});

test("concurrent profile creation preserves the unique userId invariant", async () => {
  const userId = user();
  const create = () => inTransaction((session) =>
    userProfileRepository.createOwned(make(userId), session));
  const results = await Promise.allSettled([create(), create()]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await UserProfile.countDocuments({ userId }), 1);
});
