import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { ImageAdmission } from "../../models/imageAdmission.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { ImageModerationAttempt } from "../../models/imageModerationAttempt.model";
import { ProfileVerificationJob } from "../../models/profileVerificationJob.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { ImageModerationSurface } from "../../enums/imageModeration.enums";
import { saveMyOnboardingDraft } from "../../controllers/profile.controller";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

const sha = "a".repeat(64);
const future = () => new Date(Date.now() + 60_000);
const claim = (admissionReference: string) => ({ kind: "ADMISSION", admissionReference });
const unchanged = (reference: string) => ({ kind: "UNCHANGED", reference });

const invoke = (request: Record<string, unknown>) => new Promise<unknown>((resolve, reject) => {
  const response = { status: () => response, json: (body: unknown) => { resolve(body); return response; } } as unknown as Response;
  saveMyOnboardingDraft(request as unknown as Request, response, reject as NextFunction);
});

const requestFor = (userId: Types.ObjectId, body: Record<string, unknown>) => ({
  user: { id: userId.toString(), role: "user", status: "pending_profile" },
  body,
});

const baseDraft = (media: Record<string, unknown>, patch: Record<string, unknown> = {}) => ({
  username: `draft-${new Types.ObjectId()}`,
  realName: "Draft User",
  dateOfBirth: "1990-01-01",
  mobileCountryCode: "+91",
  mobileNumber: "9876543210",
  country: "India",
  city: "Mumbai",
  languages: ["English"],
  interests: ["Music"],
  bio: "A complete onboarding draft.",
  ...media,
  ...patch,
});

async function seedAdmission(actorId: Types.ObjectId, surface: ImageModerationSurface, trustedMediaReference: string) {
  const binding = `PENDING:${actorId}:${surface}`;
  const asset = await ImageModerationAsset.create({
    assetReference: `ima_${new Types.ObjectId()}`,
    actorId,
    contentSha256: sha,
    providerAssetId: `provider_${new Types.ObjectId()}`,
    trustedMediaReference,
    expiresAt: future(),
    retentionDeadline: future(),
  });
  const attempt = await ImageModerationAttempt.create({
    attemptReference: `imat_${new Types.ObjectId()}`,
    assetId: asset._id,
    actorId,
    contentSha256: sha,
    surface,
    entityBinding: binding,
    status: "PASSED",
    provenanceModel: { identifier: "test", revision: "test", artifactSha256: sha },
    policy: { key: "TEST", version: "V1" },
    expiresAt: future(),
    retentionDeadline: future(),
  });
  const admission = await ImageAdmission.create({
    admissionReference: `imauth_${new Types.ObjectId()}`,
    attemptId: attempt._id,
    assetId: asset._id,
    actorId,
    contentSha256: sha,
    surface,
    entityBinding: binding,
    expiresAt: future(),
  });
  return { asset, admission };
}

async function admissionMedia(actorId: Types.ObjectId) {
  const avatar = await seedAdmission(actorId, "USER_PROFILE_AVATAR", "https://trusted.test/avatar");
  const cover = await seedAdmission(actorId, "USER_PROFILE_COVER", "https://trusted.test/cover");
  const one = await seedAdmission(actorId, "USER_PROFILE_PHOTO", "https://trusted.test/photo-one");
  const two = await seedAdmission(actorId, "USER_PROFILE_PHOTO", "https://trusted.test/photo-two");
  return {
    seeded: [avatar, cover, one, two],
    media: { avatar: claim(avatar.admission.admissionReference), cover: claim(cover.admission.admissionReference), profilePhotos: [claim(one.admission.admissionReference), claim(two.admission.admissionReference)] },
  };
}

async function createIncompleteProfile(userId: Types.ObjectId) {
  return UserProfile.create({
    userId,
    username: `existing-${userId}`,
    realName: "Existing User",
    dateOfBirth: new Date("1990-01-01"),
    country: "India",
    city: "Mumbai",
    languages: ["English"],
    interests: ["Music"],
    bio: "Existing draft.",
    avatar: "https://stored.test/avatar",
    cover: "https://stored.test/cover",
    profilePhotos: ["https://stored.test/photo-one", "https://stored.test/photo-two"],
    profileStatus: "incomplete",
    verificationSubmissionVersion: 0,
  });
}

test.before(async () => {
  process.env.NODE_ENV = "test";
  await connectPhase7HDatabase();
});
test.beforeEach(clearPhase7HDatabase);
test.after(disconnectPhase7HDatabase);

test("new draft creation consumes valid avatar, cover, and gallery admissions without verification side effects", async () => {
  const user = await User.create({ email: "draft-new@test.local", password: "test", status: "pending_profile", governanceState: "ACTIVE" });
  const { media, seeded } = await admissionMedia(user._id);
  await invoke(requestFor(user._id, baseDraft(media)));

  const profile = await UserProfile.findOne({ userId: user._id });
  assert.equal(profile?.profileStatus, "incomplete");
  assert.equal(profile?.avatar, "https://trusted.test/avatar");
  assert.equal(profile?.cover, "https://trusted.test/cover");
  assert.deepEqual(profile?.profilePhotos, ["https://trusted.test/photo-one", "https://trusted.test/photo-two"]);
  assert.equal((await User.findById(user._id))?.mobileNumber, "9876543210");
  for (const item of seeded) {
    assert.equal((await ImageAdmission.findById(item.admission._id))?.status, "CONSUMED");
    assert.equal((await ImageModerationAsset.findById(item.asset._id))?.status, "COMMITTED");
  }
  assert.equal(await ProfileVerificationRequest.countDocuments({ userId: user._id }), 0);
  assert.equal(await ProfileVerificationJob.countDocuments({}), 0);
  assert.equal(await FaceVerificationSession.countDocuments({ userId: user._id }), 0);
});

test("existing drafts accept unchanged media and mixed ordered gallery claims while preserving draft fields", async () => {
  const user = await User.create({ email: "draft-existing@test.local", password: "test", status: "pending_profile", governanceState: "ACTIVE" });
  const profile = await createIncompleteProfile(user._id);
  const newPhoto = await seedAdmission(user._id, "USER_PROFILE_PHOTO", "https://trusted.test/new-gallery-photo");
  await invoke(requestFor(user._id, baseDraft({
    avatar: unchanged(profile.avatar),
    cover: unchanged(profile.cover),
    profilePhotos: [claim(newPhoto.admission.admissionReference), unchanged(profile.profilePhotos[1])],
  }, { username: profile.username, realName: "Updated Draft", bio: "Updated draft bio.", mobileNumber: "9123456789" })));

  const persisted = await UserProfile.findById(profile._id);
  assert.equal(persisted?.realName, "Updated Draft");
  assert.equal(persisted?.bio, "Updated draft bio.");
  assert.deepEqual(persisted?.profilePhotos, ["https://trusted.test/new-gallery-photo", "https://stored.test/photo-two"]);
  assert.equal((await User.findById(user._id))?.mobileNumber, "9123456789");
  assert.equal((await ImageAdmission.findById(newPhoto.admission._id))?.committedReference, `USER_PROFILE:${profile._id}:photo:0`);
});

test("rejects raw URL media and makes no draft write", async () => {
  const user = await User.create({ email: "draft-raw-url@test.local", password: "test", status: "pending_profile", governanceState: "ACTIVE" });
  await assert.rejects(
    invoke(requestFor(user._id, baseDraft({ avatar: "https://attacker.test/avatar", cover: "https://attacker.test/cover", profilePhotos: ["one", "two"] }))),
    /Invalid avatar media claim/,
  );
  assert.equal(await UserProfile.findOne({ userId: user._id }), null);
});

test("wrong-actor, expired, and consumed admissions are rejected without profile mutation", async () => {
  const user = await User.create({ email: "draft-claim-reject@test.local", password: "test", status: "pending_profile", governanceState: "ACTIVE" });
  const profile = await createIncompleteProfile(user._id);
  const other = new Types.ObjectId();
  const wrongActor = await seedAdmission(other, "USER_PROFILE_AVATAR", "https://trusted.test/other");
  const expired = await seedAdmission(user._id, "USER_PROFILE_COVER", "https://trusted.test/expired");
  const consumed = await seedAdmission(user._id, "USER_PROFILE_PHOTO", "https://trusted.test/consumed");
  await ImageAdmission.collection.updateOne({ _id: expired.admission._id }, { $set: { expiresAt: new Date(0) } });
  await ImageAdmission.updateOne({ _id: consumed.admission._id }, { $set: { status: "CONSUMED" } });

  const unchangedMedia = { avatar: unchanged(profile.avatar), cover: unchanged(profile.cover), profilePhotos: [unchanged(profile.profilePhotos[0]), unchanged(profile.profilePhotos[1])] };
  await assert.rejects(invoke(requestFor(user._id, baseDraft(
    { ...unchangedMedia, avatar: claim(wrongActor.admission.admissionReference) },
    { username: profile.username },
  ))));
  await assert.rejects(invoke(requestFor(user._id, baseDraft(
    { ...unchangedMedia, cover: claim(expired.admission.admissionReference) },
    { username: profile.username },
  ))));
  await assert.rejects(invoke(requestFor(user._id, baseDraft(
    { ...unchangedMedia, profilePhotos: [claim(consumed.admission.admissionReference), unchanged(profile.profilePhotos[1])] },
    { username: profile.username },
  ))));

  assert.equal((await UserProfile.findById(profile._id))?.avatar, profile.avatar);
  assert.equal((await ImageAdmission.findById(wrongActor.admission._id))?.status, "ACTIVE");
  assert.equal((await ImageAdmission.findById(expired.admission._id))?.status, "ACTIVE");
  assert.equal((await ImageModerationAsset.findById(expired.asset._id))?.status, "TEMPORARY");
});

test("failed later media claim rolls back earlier consumption, profile, and mobile contact", async () => {
  const user = await User.create({ email: "draft-rollback@test.local", password: "test", status: "pending_profile", governanceState: "ACTIVE", mobileCountryCode: "+1", mobileNumber: "1111111" });
  const profile = await createIncompleteProfile(user._id);
  const avatar = await seedAdmission(user._id, "USER_PROFILE_AVATAR", "https://trusted.test/rollback-avatar");
  const blockedCover = await seedAdmission(user._id, "USER_PROFILE_COVER", "https://trusted.test/blocked-cover");
  await ImageModerationAsset.updateOne({ _id: blockedCover.asset._id }, { $set: { status: "INVALIDATED" } });
  await assert.rejects(invoke(requestFor(user._id, baseDraft(
    {
      avatar: claim(avatar.admission.admissionReference),
      cover: claim(blockedCover.admission.admissionReference),
      profilePhotos: [unchanged(profile.profilePhotos[0]), unchanged(profile.profilePhotos[1])],
    },
    { username: profile.username, mobileCountryCode: "+91", mobileNumber: "9876543210" },
  ))));

  assert.equal((await UserProfile.findById(profile._id))?.avatar, profile.avatar);
  assert.equal((await User.findById(user._id))?.mobileNumber, "1111111");
  assert.equal((await ImageAdmission.findById(avatar.admission._id))?.status, "ACTIVE");
  assert.equal((await ImageModerationAsset.findById(avatar.asset._id))?.status, "TEMPORARY");
});

test("an all-unchanged existing draft preserves media and does not create verification authority", async () => {
  const user = await User.create({ email: "draft-unchanged@test.local", password: "test", status: "pending_profile", governanceState: "ACTIVE" });
  const profile = await createIncompleteProfile(user._id);
  await invoke(requestFor(user._id, baseDraft({
    avatar: unchanged(profile.avatar),
    cover: unchanged(profile.cover),
    profilePhotos: profile.profilePhotos.map(unchanged),
  }, { username: profile.username })));

  const persisted = await UserProfile.findById(profile._id);
  assert.equal(persisted?.avatar, profile.avatar);
  assert.equal(persisted?.cover, profile.cover);
  assert.deepEqual(persisted?.profilePhotos, profile.profilePhotos);
  assert.equal(persisted?.profileStatus, "incomplete");
  assert.equal(persisted?.verificationSubmissionVersion, 0);
  assert.equal(await ProfileVerificationRequest.countDocuments({ userId: user._id }), 0);
  assert.equal(await ProfileVerificationJob.countDocuments({}), 0);
});
