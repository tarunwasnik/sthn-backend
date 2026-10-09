import assert from "node:assert/strict";
import test from "node:test";
import mongoose, { Types } from "mongoose";

import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import {
  ProfileSubmissionAccountPersistenceError,
  profileSubmissionAccountPersistenceService,
} from "../../services/profile/profileSubmissionAccountPersistence.service";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../financial/phase7h/helpers/database";

const contact = { mobileCountryCode: "+91", mobileNumber: "98765 43210" };

async function seedUser(status: "pending_profile" | "active" | "suspended" | "banned" = "pending_profile") {
  return User.create({
    email: `profile-account-${new Types.ObjectId()}@test.local`,
    password: "test-password",
    status,
    governanceState: "ACTIVE",
  });
}

async function seedLegacyProfile(userId: Types.ObjectId, suffix = new Types.ObjectId().toString()) {
  return UserProfile.create({
    userId,
    username: `legacy-contact-${suffix}`,
    bio: "",
    interests: [],
    avatar: "",
    cover: "",
    profilePhotos: [],
    profileStatus: "incomplete",
    verificationSubmissionVersion: 0,
  });
}

async function transaction<T>(work: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let outcome!: T;
    await session.withTransaction(async () => { outcome = await work(session); });
    return outcome;
  } finally {
    await session.endSession();
  }
}

test.before(async () => {
  process.env.NODE_ENV = "test";
  await connectPhase7HDatabase();
});
test.beforeEach(clearPhase7HDatabase);
test.after(disconnectPhase7HDatabase);

test("activates only the authenticated pending-profile account and stores normalized contact", async () => {
  const actor = await seedUser();
  const other = await seedUser();
  await seedLegacyProfile(actor._id);
  await transaction(async (session) => {
    const persisted = await profileSubmissionAccountPersistenceService.persist({
      session,
      actorId: actor._id,
      action: { kind: "FIRST_SUBMISSION", mobileContact: contact },
    });
    assert.equal(persisted.status, "active");
    assert.equal(persisted.mobileNumber, "9876543210");
  });
  const [stored, untouched] = await Promise.all([User.findById(actor._id), User.findById(other._id)]);
  assert.equal(stored?.status, "active");
  assert.equal(stored?.mobileCountryCode, "+91");
  assert.equal(stored?.mobileNumber, "9876543210");
  assert.equal(untouched?.status, "pending_profile");
  assert.equal(untouched?.mobileNumber, null);
});

test("preserves an already-active account and all unrelated governance fields", async () => {
  const actor = await seedUser("active");
  actor.creatorStatus = "approved";
  actor.governanceState = "PENDING_SUSPENSION";
  actor.abuseScore = 12;
  await actor.save();
  await transaction((session) => profileSubmissionAccountPersistenceService.persist({
    session,
    actorId: actor._id,
    action: { kind: "FIRST_SUBMISSION", mobileContact: contact },
  }));
  const stored = await User.findById(actor._id);
  assert.equal(stored?.status, "active");
  assert.equal(stored?.creatorStatus, "approved");
  assert.equal(stored?.governanceState, "PENDING_SUSPENSION");
  assert.equal(stored?.abuseScore, 12);
});

test("rejected-resubmission and verified-edit actions cannot change account state or contact", async () => {
  const actor = await seedUser("active");
  actor.mobileCountryCode = "+44";
  actor.mobileNumber = "1234567890";
  await actor.save();
  for (const kind of ["REJECTED_RESUBMISSION", "VERIFIED_EDIT"] as const) {
    await transaction((session) => profileSubmissionAccountPersistenceService.persist({ session, actorId: actor._id, action: { kind } }));
  }
  const stored = await User.findById(actor._id);
  assert.equal(stored?.status, "active");
  assert.equal(stored?.mobileCountryCode, "+44");
  assert.equal(stored?.mobileNumber, "1234567890");
});

test("migrates legacy contact fields inside the caller transaction without changing account status", async () => {
  const actor = await seedUser("active");
  const profile = await seedLegacyProfile(actor._id);
  await UserProfile.collection.updateOne({ _id: profile._id }, { $set: { mobileCountryCode: "+61", mobileNumber: "234567890" } });
  await transaction((session) => profileSubmissionAccountPersistenceService.persist({
    session,
    actorId: actor._id,
    action: { kind: "VERIFIED_EDIT" },
  }));
  const [stored, rawProfile] = await Promise.all([
    User.findById(actor._id),
    UserProfile.collection.findOne({ _id: profile._id }),
  ]);
  assert.equal(stored?.status, "active");
  assert.equal(stored?.mobileCountryCode, "+61");
  assert.equal(stored?.mobileNumber, "234567890");
  assert.equal(Object.prototype.hasOwnProperty.call(rawProfile ?? {}, "mobileCountryCode"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(rawProfile ?? {}, "mobileNumber"), false);
});

test("transaction abort and callback-style failure restore contact, status, and legacy fields", async () => {
  const actor = await seedUser();
  const profile = await seedLegacyProfile(actor._id);
  await UserProfile.collection.updateOne({ _id: profile._id }, { $set: { mobileCountryCode: "+81", mobileNumber: "345678901" } });
  const session = await mongoose.startSession();
  try {
    await assert.rejects(session.withTransaction(async () => {
      await profileSubmissionAccountPersistenceService.persist({ session, actorId: actor._id, action: { kind: "FIRST_SUBMISSION", mobileContact: contact } });
      throw new Error("callback failure");
    }), /callback failure/);
  } finally {
    await session.endSession();
  }
  const [stored, rawProfile] = await Promise.all([User.findById(actor._id), UserProfile.collection.findOne({ _id: profile._id })]);
  assert.equal(stored?.status, "pending_profile");
  assert.equal(stored?.mobileNumber, null);
  assert.equal(rawProfile?.mobileCountryCode, "+81");
  assert.equal(rawProfile?.mobileNumber, "345678901");
});

test("invalid contact and inactive sessions reject without mutation", async () => {
  const actor = await seedUser();
  const inactive = await mongoose.startSession();
  try {
    await assert.rejects(
      profileSubmissionAccountPersistenceService.persist({ session: inactive, actorId: actor._id, action: { kind: "FIRST_SUBMISSION", mobileContact: contact } }),
      (error: unknown) => error instanceof ProfileSubmissionAccountPersistenceError && error.code === "TRANSACTION_REQUIRED",
    );
  } finally {
    await inactive.endSession();
  }
  await assert.rejects(
    transaction((session) => profileSubmissionAccountPersistenceService.persist({
      session,
      actorId: actor._id,
      action: { kind: "FIRST_SUBMISSION", mobileContact: { mobileCountryCode: "+", mobileNumber: "bad" } },
    })),
    (error: unknown) => error instanceof ProfileSubmissionAccountPersistenceError && error.code === "INVALID_CONTACT",
  );
  const stored = await User.findById(actor._id);
  assert.equal(stored?.status, "pending_profile");
  assert.equal(stored?.mobileNumber, null);
});

test("restricted statuses are never reactivated and retries are idempotent", async () => {
  for (const status of ["suspended", "banned"] as const) {
    const actor = await seedUser(status);
    await transaction((session) => profileSubmissionAccountPersistenceService.persist({ session, actorId: actor._id, action: { kind: "FIRST_SUBMISSION", mobileContact: contact } }));
    assert.equal((await User.findById(actor._id))?.status, status);
  }
  const retryActor = await seedUser();
  await transaction((session) => profileSubmissionAccountPersistenceService.persist({ session, actorId: retryActor._id, action: { kind: "FIRST_SUBMISSION", mobileContact: contact } }));
  await transaction((session) => profileSubmissionAccountPersistenceService.persist({ session, actorId: retryActor._id, action: { kind: "FIRST_SUBMISSION", mobileContact: contact } }));
  const retried = await User.findById(retryActor._id);
  assert.equal(retried?.status, "active");
  assert.equal(retried?.mobileNumber, "9876543210");
});
