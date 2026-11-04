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
import { AuditLog } from "../../models/auditLog.model";
import { Notification } from "../../models/notification.model";
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

async function createAdminToken() {
  const admin = await User.create({ email: `creator-application-admin-${new Types.ObjectId()}@test.local`, password: "test-password", role: "admin", status: "active", governanceState: "ACTIVE" });
  return jwt.sign({ id: String(admin._id), role: "admin" }, process.env.JWT_SECRET!);
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

test("Admin approval preserves an append-only decision audit", async () => {
  const user = await createEligibleUser();
  user.creatorStatus = "pending";
  await user.save();
  const application = await CreatorApplication.create({ userId: user._id, displayName: "Approved Creator", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: ["Portraits"], publicBio: "I create documentary portraits.", languages: ["English"], status: "submitted", rejectionReason: "", submittedForReviewAt: new Date() });
  const response = await fetch(`${baseUrl}/api/v1/admin/creator-applications/${application._id}/approve`, { method: "PATCH", headers: { authorization: `Bearer ${await createAdminToken()}` } });
  assert.equal(response.status, 200);
  const audit = await AuditLog.findOne({ entityId: application._id, action: "CREATOR_APPLICATION_APPROVED" }).lean();
  assert.equal(audit?.actorType, "ADMIN");
  assert.equal(audit?.before?.status, "submitted");
  assert.equal(audit?.after?.status, "approved");
});

test("Admin rejection preserves the decision actor and reason in the audit", async () => {
  const user = await createEligibleUser();
  user.creatorStatus = "pending";
  await user.save();
  const application = await CreatorApplication.create({ userId: user._id, displayName: "Rejected Creator", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: ["Portraits"], publicBio: "I create documentary portraits.", languages: ["English"], status: "submitted", rejectionReason: "", submittedForReviewAt: new Date() });
  const response = await fetch(`${baseUrl}/api/v1/admin/creator-applications/${application._id}/reject`, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${await createAdminToken()}` }, body: JSON.stringify({ reason: "Please provide a clearer portfolio." }) });
  assert.equal(response.status, 200);
  const audit = await AuditLog.findOne({ entityId: application._id, action: "CREATOR_APPLICATION_REJECTED" }).lean();
  assert.equal(audit?.actorType, "ADMIN");
  assert.equal(audit?.after?.status, "rejected");
  assert.equal(audit?.after?.rejectionReason, "Please provide a clearer portfolio.");
  const notification = await Notification.findOne({ recipientId: user._id, idempotencyKey: `creator-application:${application._id}:rejected:${user._id}` }).lean();
  assert.equal(notification?.category, "CREATOR_APPLICATION");
  assert.equal(notification?.navigationPath, "/creator-application");
});

test("unauthorized, repeated, and concurrent approval attempts create at most one successful audit", async () => {
  const unauthorizedUser = await createEligibleUser();
  unauthorizedUser.creatorStatus = "pending";
  await unauthorizedUser.save();
  const unauthorizedApplication = await CreatorApplication.create({ userId: unauthorizedUser._id, displayName: "Unauthorized Creator", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: ["Portraits"], publicBio: "I create documentary portraits.", languages: ["English"], status: "submitted", rejectionReason: "", submittedForReviewAt: new Date() });
  const unauthorized = await fetch(`${baseUrl}/api/v1/admin/creator-applications/${unauthorizedApplication._id}/approve`, { method: "PATCH", headers: { authorization: `Bearer ${jwt.sign({ id: String(unauthorizedUser._id), role: "user" }, process.env.JWT_SECRET!)}` } });
  assert.equal(unauthorized.status, 403);
  assert.equal(await AuditLog.countDocuments({ entityId: unauthorizedApplication._id, action: "CREATOR_APPLICATION_APPROVED" }), 0);

  const user = await createEligibleUser();
  user.creatorStatus = "pending";
  await user.save();
  const application = await CreatorApplication.create({ userId: user._id, displayName: "Concurrent Creator", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: ["Portraits"], publicBio: "I create documentary portraits.", languages: ["English"], status: "submitted", rejectionReason: "", submittedForReviewAt: new Date() });
  const adminToken = await createAdminToken();
  const approve = () => fetch(`${baseUrl}/api/v1/admin/creator-applications/${application._id}/approve`, { method: "PATCH", headers: { authorization: `Bearer ${adminToken}` } });
  const [first, second] = await Promise.all([approve(), approve()]);
  assert.deepEqual([first.status, second.status].sort(), [200, 400]);
  assert.equal(await AuditLog.countDocuments({ entityId: application._id, action: "CREATOR_APPLICATION_APPROVED" }), 1);
  const replay = await approve();
  assert.equal(replay.status, 400);
  assert.equal(await AuditLog.countDocuments({ entityId: application._id, action: "CREATOR_APPLICATION_APPROVED" }), 1);
});

test("Admin cleanup cannot delete submitted or terminal creator applications", async () => {
  const user = await createEligibleUser();
  user.creatorStatus = "pending";
  await user.save();
  const application = await CreatorApplication.create({ userId: user._id, displayName: "Retained Creator", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: ["Portraits"], publicBio: "I create documentary portraits.", languages: ["English"], status: "submitted", rejectionReason: "", submittedForReviewAt: new Date() });
  const response = await fetch(`${baseUrl}/api/v1/admin/creator-applications/${application._id}`, { method: "DELETE", headers: { authorization: `Bearer ${await createAdminToken()}` } });
  assert.equal(response.status, 409);
  assert.ok(await CreatorApplication.exists({ _id: application._id, status: "submitted" }));
});

test("Admin cleanup permits deletion of an unsubmitted draft", async () => {
  const user = await createEligibleUser();
  const application = await CreatorApplication.create({ userId: user._id, displayName: "Draft Creator", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: ["Portraits"], publicBio: "I create documentary portraits.", languages: ["English"], status: "draft", rejectionReason: "" });
  const response = await fetch(`${baseUrl}/api/v1/admin/creator-applications/${application._id}`, { method: "DELETE", headers: { authorization: `Bearer ${await createAdminToken()}` } });
  assert.equal(response.status, 200);
  assert.equal(await CreatorApplication.exists({ _id: application._id }), null);
});

test("Admin application history filters return only their requested status", async () => {
  const submittedUser = await createEligibleUser();
  const approvedUser = await createEligibleUser();
  const rejectedUser = await createEligibleUser();
  await CreatorApplication.create([
    { userId: submittedUser._id, displayName: "Submitted History", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: [], publicBio: "Submitted application", languages: [], status: "submitted", rejectionReason: "", submittedForReviewAt: new Date() },
    { userId: approvedUser._id, displayName: "Approved History", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: [], publicBio: "Approved application", languages: [], status: "approved", rejectionReason: "", submittedForReviewAt: new Date() },
    { userId: rejectedUser._id, displayName: "Rejected History", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: [], publicBio: "Rejected application", languages: [], status: "rejected", rejectionReason: "Incomplete portfolio", submittedForReviewAt: new Date() },
  ]);
  const adminToken = await createAdminToken();
  for (const status of ["submitted", "approved", "rejected"] as const) {
    const response = await fetch(`${baseUrl}/api/v1/admin/creator-applications?status=${status}`, { headers: { authorization: `Bearer ${adminToken}` } });
    assert.equal(response.status, 200);
    const body = await response.json() as { applications: Array<{ status: string }> };
    assert.ok(body.applications.length > 0);
    assert.ok(body.applications.every((application) => application.status === status));
  }
});
