import assert from "node:assert/strict";
import http from "node:http";
import { after, before, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";

import app from "../../app";
import User from "../../models/User";
import { CreatorApplication } from "../../models/creatorApplication.model";
import { ImageAdmission } from "../../models/imageAdmission.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { ImageModerationAttempt } from "../../models/imageModerationAttempt.model";
import { UserProfile } from "../../models/userProfile.model";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "creator-application-admission-test-jwt";
process.env.TEXT_MODERATION_ADMISSION_SECRET = "creator-application-admission-test-secret-with-at-least-32-characters";

const sha = "a".repeat(64);
const future = () => new Date(Date.now() + 60_000);
let server: http.Server;
let baseUrl: string;

const creatorPayload = (media: Record<string, unknown>) => ({
  displayName: "Admission Creator",
  primaryCategory: "Photography",
  country: "India",
  city: "Mumbai",
  currency: "INR",
  services: ["Portraits"],
  publicBio: "I create documentary portraits.",
  languages: ["English"],
  ...media,
});

async function createEligibleUser() {
  const user = await User.create({ email: `creator-admission-${new Types.ObjectId()}@test.local`, password: "test-password", status: "active", governanceState: "ACTIVE" });
  await UserProfile.create({ userId: user._id, username: `creator-admission-${new Types.ObjectId()}`, dateOfBirth: new Date("1990-01-01"), bio: "Verified profile", interests: [], avatar: "https://legacy.test/avatar", cover: "https://legacy.test/cover", profilePhotos: ["https://legacy.test/one", "https://legacy.test/two"], profileStatus: "verified" });
  return user;
}

async function createAdmission(actorId: Types.ObjectId, surface: "CREATOR_APPLICATION_AVATAR" | "CREATOR_APPLICATION_COVER" | "CREATOR_APPLICATION_MEDIA", reference: string) {
  const asset = await ImageModerationAsset.create({ assetReference: `ima_${new Types.ObjectId()}`, actorId, contentSha256: sha, providerAssetId: `creator-application/${new Types.ObjectId()}`, trustedMediaReference: reference, expiresAt: future(), retentionDeadline: future() });
  const attempt = await ImageModerationAttempt.create({ attemptReference: `imat_${new Types.ObjectId()}`, assetId: asset._id, actorId, contentSha256: sha, surface, entityBinding: `PENDING:${actorId}:${surface}`, status: "PASSED", provenanceModel: { identifier: "test", revision: "test", artifactSha256: sha }, policy: { key: "TEST", version: "V1" }, expiresAt: future(), retentionDeadline: future() });
  const admission = await ImageAdmission.create({ admissionReference: `imauth_${new Types.ObjectId()}`, attemptId: attempt._id, assetId: asset._id, actorId, contentSha256: sha, surface, entityBinding: attempt.entityBinding, expiresAt: future() });
  return { asset, admission };
}

async function submit(userId: Types.ObjectId, media: Record<string, unknown>) {
  const token = jwt.sign({ id: String(userId), role: "user" }, process.env.JWT_SECRET!);
  return fetch(`${baseUrl}/api/v1/creator-applications`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ ...creatorPayload(media) }) });
}

before(async () => {
  await connectPhase7HDatabase();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Creator application test server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
}, { timeout: 120_000 });
beforeEach(async () => { await clearPhase7HDatabase(); });
after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await disconnectPhase7HDatabase(); });

test("creator application consumes only matching admissions and atomically submits without Text AI", async () => {
  const user = await createEligibleUser();
  const avatar = await createAdmission(user._id, "CREATOR_APPLICATION_AVATAR", "https://trusted.test/creator-avatar");
  const cover = await createAdmission(user._id, "CREATOR_APPLICATION_COVER", "https://trusted.test/creator-cover");
  const photo = await createAdmission(user._id, "CREATOR_APPLICATION_MEDIA", "https://trusted.test/creator-photo");
  const response = await submit(user._id, { avatar: { kind: "ADMISSION", admissionReference: avatar.admission.admissionReference }, cover: { kind: "ADMISSION", admissionReference: cover.admission.admissionReference }, media: [{ kind: "ADMISSION", admissionReference: photo.admission.admissionReference }] });
  assert.equal(response.status, 201);
  const application = await CreatorApplication.findOne({ userId: user._id }).lean();
  assert.equal(application?.status, "submitted");
  assert.equal(application?.avatarUrl, "https://trusted.test/creator-avatar");
  assert.equal(application?.coverUrl, "https://trusted.test/creator-cover");
  assert.deepEqual(application?.media, ["https://trusted.test/creator-photo"]);
  assert.equal((await User.findById(user._id))?.creatorStatus, "pending");
  assert.equal((await ImageAdmission.findById(avatar.admission._id))?.status, "CONSUMED");
  assert.equal((await ImageAdmission.findById(cover.admission._id))?.status, "CONSUMED");
  assert.equal((await ImageAdmission.findById(photo.admission._id))?.status, "CONSUMED");
});

test("creator application rejects raw and wrong-surface media before changing application or account status", async () => {
  const rawUser = await createEligibleUser();
  const raw = await submit(rawUser._id, { avatarUrl: "https://untrusted.test/raw-avatar", media: [] });
  assert.equal(raw.status, 400);
  assert.equal(await CreatorApplication.countDocuments({ userId: rawUser._id }), 0);
  assert.equal((await User.findById(rawUser._id))?.creatorStatus, "none");

  const wrongSurfaceUser = await createEligibleUser();
  const wrong = await createAdmission(wrongSurfaceUser._id, "CREATOR_APPLICATION_COVER", "https://trusted.test/wrong-surface");
  const response = await submit(wrongSurfaceUser._id, { avatar: { kind: "ADMISSION", admissionReference: wrong.admission.admissionReference }, media: [] });
  assert.equal(response.status, 400);
  assert.equal((await ImageAdmission.findById(wrong.admission._id))?.status, "ACTIVE");
  assert.equal(await CreatorApplication.countDocuments({ userId: wrongSurfaceUser._id }), 0);
  assert.equal((await User.findById(wrongSurfaceUser._id))?.creatorStatus, "none");
});

test("rejected creator applications accept only exact unchanged media during corrective resubmission", async () => {
  const user = await createEligibleUser();
  user.creatorStatus = "rejected";
  await user.save();
  await CreatorApplication.create({ userId: user._id, displayName: "Rejected Creator", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: ["Portraits"], publicBio: "I create documentary portraits.", languages: ["English"], avatarUrl: "https://legacy.test/creator-avatar", coverUrl: "https://legacy.test/creator-cover", media: ["https://legacy.test/creator-photo"], status: "rejected", rejectionReason: "Please update your application." });
  const response = await submit(user._id, { avatar: { kind: "UNCHANGED", reference: "https://legacy.test/creator-avatar" }, cover: { kind: "UNCHANGED", reference: "https://legacy.test/creator-cover" }, media: [{ kind: "UNCHANGED", reference: "https://legacy.test/creator-photo" }] });
  assert.equal(response.status, 201);
  const application = await CreatorApplication.findOne({ userId: user._id }).lean();
  assert.equal(application?.status, "submitted");
  assert.equal(application?.rejectionReason, "");
  assert.equal((await User.findById(user._id))?.creatorStatus, "pending");
});

test("rejected creator applications can replace only the corrected slot with a matching admission", async () => {
  const user = await createEligibleUser();
  user.creatorStatus = "rejected";
  await user.save();
  await CreatorApplication.create({ userId: user._id, displayName: "Rejected Creator", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: ["Portraits"], publicBio: "I create documentary portraits.", languages: ["English"], avatarUrl: "https://legacy.test/creator-avatar", coverUrl: "https://legacy.test/creator-cover", media: ["https://legacy.test/creator-photo"], status: "rejected", rejectionReason: "Use a clearer avatar." });
  const avatar = await createAdmission(user._id, "CREATOR_APPLICATION_AVATAR", "https://trusted.test/corrected-avatar");
  const response = await submit(user._id, { avatar: { kind: "ADMISSION", admissionReference: avatar.admission.admissionReference }, cover: { kind: "UNCHANGED", reference: "https://legacy.test/creator-cover" }, media: [{ kind: "UNCHANGED", reference: "https://legacy.test/creator-photo" }] });
  assert.equal(response.status, 201);
  const application = await CreatorApplication.findOne({ userId: user._id }).lean();
  assert.equal(application?.status, "submitted");
  assert.equal(application?.avatarUrl, "https://trusted.test/corrected-avatar");
  assert.equal(application?.coverUrl, "https://legacy.test/creator-cover");
  assert.deepEqual(application?.media, ["https://legacy.test/creator-photo"]);
  assert.equal((await ImageAdmission.findById(avatar.admission._id))?.status, "CONSUMED");
  assert.equal((await User.findById(user._id))?.creatorStatus, "pending");
});
