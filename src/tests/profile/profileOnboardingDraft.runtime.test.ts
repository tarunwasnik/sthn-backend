import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { NextFunction, Request, Response } from "express";

import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { ProfileVerificationJob } from "../../models/profileVerificationJob.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { getMyProfile, saveMyOnboardingDraft, upsertProfile } from "../../controllers/profile.controller";
import { fingerprintAvatarReference, startFaceVerificationSession } from "../../services/profile/faceVerificationSession.service";
import { setBiometricReferenceAvatarValidationDependenciesForTests } from "../../services/profile/profileVerificationReferenceAvatarValidation.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

const invoke = (controller: (req: Request, res: Response, next: NextFunction) => unknown, request: Record<string, unknown>) => new Promise<unknown>((resolve, reject) => {
  const response = { status: () => response, json: (body: unknown) => { resolve(body); return response; } } as unknown as Response;
  controller(request as unknown as Request, response, reject);
});

const body = (username = "draft-recovery") => ({
  username,
  realName: "Draft Recovery User",
  dateOfBirth: "1990-01-01",
  mobileCountryCode: "+91",
  mobileNumber: "9876543210",
  country: "India",
  city: "Mumbai",
  languages: ["English", "Hindi"],
  interests: ["Music", "Travel"],
  bio: "A complete recoverable onboarding draft.",
  avatar: "https://example.test/avatar-draft.jpg",
  cover: "https://example.test/cover-draft.jpg",
  profilePhotos: Array.from({ length: 6 }, (_, index) => `https://example.test/profile-${index}.jpg`),
});

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => {
  await clearPhase7HDatabase();
  setBiometricReferenceAvatarValidationDependenciesForTests({
    reader: async () => Buffer.from("draft-avatar"),
    detector: async () => ({ width: 100, height: 100, decodedBytes: 30_000, faces: [] }),
  });
});
after(async () => { setBiometricReferenceAvatarValidationDependenciesForTests(); await disconnectPhase7HDatabase(); }, { timeout: 30_000 });

test("complete incomplete onboarding drafts survive failed preflight and fresh-device hydration without verification side effects", async () => {
  const user = await User.create({ email: "onboarding-draft@test.local", password: "test-password", status: "pending_profile", governanceState: "ACTIVE" });
  const input = body();
  await invoke(saveMyOnboardingDraft, { user: { id: String(user._id), role: "user", status: "pending_profile" }, body: input });

  const profile = await UserProfile.findOne({ userId: user._id }).lean();
  assert.ok(profile);
  assert.equal(profile.username, input.username);
  assert.equal(profile.realName, input.realName);
  assert.equal(profile.avatar, input.avatar);
  assert.equal(profile.cover, input.cover);
  assert.deepEqual(profile.profilePhotos, input.profilePhotos);
  assert.equal(profile.profileStatus, "incomplete");
  assert.equal(profile.verificationSubmissionVersion, 0);
  assert.equal((await User.findById(user._id))?.mobileNumber, input.mobileNumber);
  assert.equal(await ProfileVerificationRequest.countDocuments({ userId: user._id }), 0);
  assert.equal(await ProfileVerificationJob.countDocuments({}), 0);

  const hydrated = await invoke(getMyProfile, { user: { id: String(user._id), role: "user", status: "pending_profile" } }) as typeof input;
  assert.equal(hydrated.username, input.username);
  assert.equal(hydrated.realName, input.realName);
  assert.equal(hydrated.avatar, input.avatar);
  assert.equal(hydrated.cover, input.cover);
  assert.deepEqual(hydrated.profilePhotos, input.profilePhotos);

  await assert.rejects(startFaceVerificationSession({ userId: String(user._id), avatar: input.avatar }), (error: unknown) => (error as { code?: string }).code === "REFERENCE_AVATAR_NO_FACE");
  const afterFailure = await UserProfile.findById(profile._id).lean();
  assert.equal(afterFailure?.username, input.username);
  assert.equal(afterFailure?.avatar, input.avatar);
  assert.deepEqual(afterFailure?.profilePhotos, input.profilePhotos);
  assert.equal(await FaceVerificationSession.countDocuments({ userId: user._id }), 0);
  assert.equal(await ProfileVerificationRequest.countDocuments({ userId: user._id }), 0);
});

test("draft saving validates username uniqueness and cannot alter rejected recovery state", async () => {
  const existingUser = await User.create({ email: "onboarding-draft-existing@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
  await UserProfile.create({ userId: existingUser._id, username: "taken-draft-name", realName: "Rejected User", dateOfBirth: new Date("1990-01-01"), country: "India", city: "Mumbai", languages: ["English"], interests: [], bio: "Existing rejected profile", avatar: "https://example.test/rejected-avatar.jpg", cover: "https://example.test/rejected-cover.jpg", profilePhotos: ["https://example.test/rejected-one.jpg", "https://example.test/rejected-two.jpg"], profileStatus: "rejected", rejectionReason: "Review required", verificationSubmissionVersion: 2 });
  const newUser = await User.create({ email: "onboarding-draft-new@test.local", password: "test-password", status: "pending_profile", governanceState: "ACTIVE" });
  await assert.rejects(invoke(saveMyOnboardingDraft, { user: { id: String(newUser._id), role: "user", status: "pending_profile" }, body: body("taken-draft-name") }), /Username already taken/);
  assert.equal(await UserProfile.findOne({ userId: newUser._id }), null);
  await assert.rejects(invoke(saveMyOnboardingDraft, { user: { id: String(existingUser._id), role: "user", status: "active" }, body: body("taken-draft-name") }), /not eligible/);
  const rejected = await UserProfile.findOne({ userId: existingUser._id }).lean();
  assert.equal(rejected?.profileStatus, "rejected");
  assert.equal(rejected?.verificationSubmissionVersion, 2);
  assert.equal(rejected?.avatar, "https://example.test/rejected-avatar.jpg");
});

test("gated final submission rejects a two-photo draft without partial authority and freezes the current six-photo draft", async () => {
  const previousPolicy = process.env.STHN_PROFILE_VERIFICATION_POLICY;
  process.env.STHN_PROFILE_VERIFICATION_POLICY = "GATED_MULTI_MEDIA_V1";
  try {
    const user = await User.create({ email: "onboarding-gated@test.local", password: "test-password", status: "pending_profile", governanceState: "ACTIVE" });
    const twoPhotoDraft = { ...body("gated-draft"), profilePhotos: body().profilePhotos.slice(0, 2) };
    await invoke(saveMyOnboardingDraft, { user: { id: String(user._id), role: "user", status: "pending_profile" }, body: twoPhotoDraft });

    await assert.rejects(
      invoke(upsertProfile, { user: { id: String(user._id), role: "user", status: "pending_profile" }, body: twoPhotoDraft }),
      (error: unknown) => (error as { statusCode?: number; code?: string }).statusCode === 400
        && (error as { code?: string }).code === "PROFILE_PHOTO_COUNT_INVALID",
    );
    let profile = await UserProfile.findOne({ userId: user._id });
    assert.ok(profile);
    assert.equal(profile.profileStatus, "incomplete");
    assert.equal(profile.verificationSubmissionVersion, 0);
    assert.equal(await ProfileVerificationRequest.countDocuments({ userId: user._id }), 0);
    assert.equal(await ProfileVerificationJob.countDocuments({}), 0);

    const sixPhotoDraft = body("gated-draft");
    await invoke(saveMyOnboardingDraft, { user: { id: String(user._id), role: "user", status: "pending_profile" }, body: sixPhotoDraft });
    profile = await UserProfile.findOne({ userId: user._id });
    assert.ok(profile);
    await FaceVerificationSession.create({
      sessionReference: "ONBOARDING_GATED_COMPLETE",
      userId: user._id,
      profileId: profile._id,
      profileSubmissionVersion: 1,
      avatarFingerprint: fingerprintAvatarReference(sixPhotoDraft.avatar),
      status: "CAPTURE_COMPLETE",
      isCurrent: true,
      challenges: ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"],
      requiredCaptureCount: 5,
      acceptedCaptureCount: 5,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      captureCompletedAt: new Date(),
    });
    setBiometricReferenceAvatarValidationDependenciesForTests({
      reader: async () => Buffer.from("draft-avatar"),
      detector: async () => ({ width: 100, height: 100, decodedBytes: 30_000, faces: [{ x: 30, y: 30, width: 40, height: 40, confidence: 0.9, landmarks: { rightEye: { x: 40, y: 42 }, leftEye: { x: 55, y: 42 }, noseTip: { x: 48, y: 50 }, rightMouthCorner: { x: 42, y: 60 }, leftMouthCorner: { x: 54, y: 60 } } }] }),
    });

    await invoke(upsertProfile, { user: { id: String(user._id), role: "user", status: "pending_profile" }, body: sixPhotoDraft });
    profile = await UserProfile.findOne({ userId: user._id });
    const request = await ProfileVerificationRequest.findOne({ userId: user._id });
    const session = await FaceVerificationSession.findOne({ userId: user._id });
    assert.equal(profile?.profileStatus, "pending_verification");
    assert.equal(profile?.verificationSubmissionVersion, 1);
    assert.equal(request?.profileSubmissionVersion, 1);
    assert.equal(request?.verificationPolicy?.key, "GATED_MULTI_MEDIA");
    assert.equal(request?.submittedMedia?.profilePhotos.length, 6);
    assert.deepEqual(request?.submittedMedia?.profilePhotos.map((photo) => photo.sourceReference), sixPhotoDraft.profilePhotos);
    assert.equal(String(session?.verificationRequestId), String(request?._id));
    assert.equal(await ProfileVerificationJob.countDocuments({ verificationRequestId: request?._id }), 1);
  } finally {
    if (previousPolicy === undefined) delete process.env.STHN_PROFILE_VERIFICATION_POLICY;
    else process.env.STHN_PROFILE_VERIFICATION_POLICY = previousPolicy;
  }
});
