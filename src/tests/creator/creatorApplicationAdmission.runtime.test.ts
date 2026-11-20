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
import { CreatorProfile } from "../../models/creatorProfile.model";
import { ProviderAssetReference } from "../../models/providerAssetReference.model";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";
import { createAuthSession } from "../../services/authSession.service";
import { startCreatorVerificationSession, acceptCreatorVerificationCapture } from "../../services/creator/creatorVerification.service";

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

async function submit(userId: Types.ObjectId, media: Record<string, unknown>, fields: Record<string, unknown> = {}) {
  const session = await createAuthSession(String(userId));
  const token = jwt.sign({ id: String(userId), role: "user", sid: String(session._id) }, process.env.JWT_SECRET!);
  const existing = await CreatorApplication.findOne({ userId });
  const headers = { "content-type": "application/json", authorization: `Bearer ${token}` };
  const saved = await fetch(`${baseUrl}/api/v1/creator-applications/me/upgrade-draft`, { method: "PUT", headers, body: JSON.stringify({ ...creatorPayload(media), ...fields, draftVersion: existing?.draftVersion ?? 0 }) });
  if (!saved.ok) return saved;
  const application = await CreatorApplication.findOne({ userId }).orFail();
  if (application.avatarUrl && application.coverUrl && (application.media?.length ?? 0) >= 2 && (application.media?.length ?? 0) <= 6 && application.languages.length) {
    const face = await startCreatorVerificationSession(String(userId));
    for (let index = 0; index < 5; index++) await acceptCreatorVerificationCapture({ userId: String(userId), sessionReference: face.sessionReference, challengeIndex: String(index), file: { buffer: Buffer.from([1, 2, 3]) } as Express.Multer.File, storeEvidence: async ({ buffer, publicId }) => ({ publicId, bytes: buffer.length, format: "png", mimeType: "image/png" }) });
  }
  return fetch(`${baseUrl}/api/v1/creator-applications`, { method: "POST", headers, body: "{}" });
}

async function createAdminToken() {
  const admin = await User.create({ email: `creator-application-admin-${new Types.ObjectId()}@test.local`, password: "test-password", role: "admin", status: "active", governanceState: "ACTIVE" });
  const session = await createAuthSession(String(admin._id));
  return jwt.sign({ id: String(admin._id), role: "admin", sid: String(session._id) }, process.env.JWT_SECRET!);
}

const requiredFixtureMedia = { avatarUrl: "https://legacy.test/avatar", coverUrl: "https://legacy.test/cover", media: ["https://legacy.test/one", "https://legacy.test/two"] };

async function completeSubmittedApplication() {
  const user = await createEligibleUser();
  const avatar = await createAdmission(user._id, "CREATOR_APPLICATION_AVATAR", `https://trusted.test/${user._id}-avatar`);
  const cover = await createAdmission(user._id, "CREATOR_APPLICATION_COVER", `https://trusted.test/${user._id}-cover`);
  const one = await createAdmission(user._id, "CREATOR_APPLICATION_MEDIA", `https://trusted.test/${user._id}-one`);
  const two = await createAdmission(user._id, "CREATOR_APPLICATION_MEDIA", `https://trusted.test/${user._id}-two`);
  const response = await submit(user._id, { avatar: { kind: "ADMISSION", admissionReference: avatar.admission.admissionReference }, cover: { kind: "ADMISSION", admissionReference: cover.admission.admissionReference }, media: [{ kind: "ADMISSION", admissionReference: one.admission.admissionReference }, { kind: "ADMISSION", admissionReference: two.admission.admissionReference }] });
  assert.equal(response.status, 201);
  return { user, application: await CreatorApplication.findOne({ userId: user._id }).orFail() };
}

test("Creator draft and face-verification endpoints are unavailable", async () => {
  const user = await createEligibleUser();
  const session = await createAuthSession(String(user._id));
  const token = jwt.sign({ id: String(user._id), role: "user", sid: String(session._id) }, process.env.JWT_SECRET!);
  const headers = { authorization: `Bearer ${token}` };
  assert.equal((await fetch(`${baseUrl}/api/v1/creator-applications/me/draft`, { headers })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/v1/creator-applications/me/face-verification/session`, { method: "POST", headers })).status, 404);
});

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
  const photoTwo = await createAdmission(user._id, "CREATOR_APPLICATION_MEDIA", "https://trusted.test/creator-photo-two");
  const response = await submit(user._id, { avatar: { kind: "ADMISSION", admissionReference: avatar.admission.admissionReference }, cover: { kind: "ADMISSION", admissionReference: cover.admission.admissionReference }, media: [{ kind: "ADMISSION", admissionReference: photo.admission.admissionReference }, { kind: "ADMISSION", admissionReference: photoTwo.admission.admissionReference }] });
  assert.equal(response.status, 201);
  const application = await CreatorApplication.findOne({ userId: user._id }).lean();
  assert.equal(application?.status, "submitted");
  assert.equal(application?.avatarUrl, "https://trusted.test/creator-avatar");
  assert.equal(application?.coverUrl, "https://trusted.test/creator-cover");
  assert.deepEqual(application?.media, ["https://trusted.test/creator-photo", "https://trusted.test/creator-photo-two"]);
  assert.equal((await User.findById(user._id))?.creatorStatus, "pending");
  assert.equal((await ImageAdmission.findById(avatar.admission._id))?.status, "CONSUMED");
  assert.equal((await ImageAdmission.findById(cover.admission._id))?.status, "CONSUMED");
  assert.equal((await ImageAdmission.findById(photo.admission._id))?.status, "CONSUMED");
  assert.equal((await ImageAdmission.findById(photoTwo.admission._id))?.status, "CONSUMED");
});

test("application stores personal interests without requiring services or inventing a category", async () => {
  const user = await createEligibleUser();
  const avatar = await createAdmission(user._id, "CREATOR_APPLICATION_AVATAR", "https://trusted.test/interests-avatar");
  const cover = await createAdmission(user._id, "CREATOR_APPLICATION_COVER", "https://trusted.test/interests-cover");
  const one = await createAdmission(user._id, "CREATOR_APPLICATION_MEDIA", "https://trusted.test/interests-one");
  const two = await createAdmission(user._id, "CREATOR_APPLICATION_MEDIA", "https://trusted.test/interests-two");
  const response = await submit(user._id, { avatar: { kind: "ADMISSION", admissionReference: avatar.admission.admissionReference }, cover: { kind: "ADMISSION", admissionReference: cover.admission.admissionReference }, media: [{ kind: "ADMISSION", admissionReference: one.admission.admissionReference }, { kind: "ADMISSION", admissionReference: two.admission.admissionReference }] }, { primaryCategory: undefined, services: undefined, interests: ["Music", "Travel"] });
  assert.equal(response.status, 201);
  const application = await CreatorApplication.findOne({ userId: user._id }).lean();
  assert.deepEqual(application?.interests, ["Music", "Travel"]);
  assert.equal(application?.primaryCategory, undefined);
  assert.deepEqual(application?.services, []);
});

test("creator application requires all approved media, language, and a supported operating currency", async () => {
  for (const scenario of ["no-avatar", "no-cover", "one-photo", "no-language", "bad-currency", "valid"]) {
    const user = await createEligibleUser();
    const avatar = await createAdmission(user._id, "CREATOR_APPLICATION_AVATAR", `https://trusted.test/${user._id}-avatar`);
    const cover = await createAdmission(user._id, "CREATOR_APPLICATION_COVER", `https://trusted.test/${user._id}-cover`);
    const one = await createAdmission(user._id, "CREATOR_APPLICATION_MEDIA", `https://trusted.test/${user._id}-one`);
    const two = await createAdmission(user._id, "CREATOR_APPLICATION_MEDIA", `https://trusted.test/${user._id}-two`);
    const media = { ...(scenario === "no-avatar" ? {} : { avatar: { kind: "ADMISSION", admissionReference: avatar.admission.admissionReference } }), ...(scenario === "no-cover" ? {} : { cover: { kind: "ADMISSION", admissionReference: cover.admission.admissionReference } }), media: [{ kind: "ADMISSION", admissionReference: one.admission.admissionReference }, ...(scenario === "one-photo" ? [] : [{ kind: "ADMISSION", admissionReference: two.admission.admissionReference }])] };
    const fields = scenario === "no-language" ? { languages: [] } : scenario === "bad-currency" ? { currency: "ZZZ" } : { currency: "inr" };
    const response = await submit(user._id, media, fields);
    assert.equal(response.status, scenario === "valid" ? 201 : scenario === "bad-currency" ? 400 : 409, scenario);
  }
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
  await CreatorApplication.create({ userId: user._id, displayName: "Rejected Creator", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: ["Portraits"], publicBio: "I create documentary portraits.", languages: ["English"], avatarUrl: "https://legacy.test/creator-avatar", coverUrl: "https://legacy.test/creator-cover", media: ["https://legacy.test/creator-photo", "https://legacy.test/creator-photo-two"], status: "rejected", rejectionReason: "Please update your application." });
  const response = await submit(user._id, { avatar: { kind: "UNCHANGED", reference: "https://legacy.test/creator-avatar" }, cover: { kind: "UNCHANGED", reference: "https://legacy.test/creator-cover" }, media: [{ kind: "UNCHANGED", reference: "https://legacy.test/creator-photo" }, { kind: "UNCHANGED", reference: "https://legacy.test/creator-photo-two" }] });
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
  await CreatorApplication.create({ userId: user._id, displayName: "Rejected Creator", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: ["Portraits"], publicBio: "I create documentary portraits.", languages: ["English"], avatarUrl: "https://legacy.test/creator-avatar", coverUrl: "https://legacy.test/creator-cover", media: ["https://legacy.test/creator-photo", "https://legacy.test/creator-photo-two"], status: "rejected", rejectionReason: "Use a clearer avatar." });
  const avatar = await createAdmission(user._id, "CREATOR_APPLICATION_AVATAR", "https://trusted.test/corrected-avatar");
  const response = await submit(user._id, { avatar: { kind: "ADMISSION", admissionReference: avatar.admission.admissionReference }, cover: { kind: "UNCHANGED", reference: "https://legacy.test/creator-cover" }, media: [{ kind: "UNCHANGED", reference: "https://legacy.test/creator-photo" }, { kind: "UNCHANGED", reference: "https://legacy.test/creator-photo-two" }] });
  assert.equal(response.status, 201);
  const application = await CreatorApplication.findOne({ userId: user._id }).lean();
  assert.equal(application?.status, "submitted");
  assert.equal(application?.avatarUrl, "https://trusted.test/corrected-avatar");
  assert.equal(application?.coverUrl, "https://legacy.test/creator-cover");
  assert.deepEqual(application?.media, ["https://legacy.test/creator-photo", "https://legacy.test/creator-photo-two"]);
  assert.equal((await ImageAdmission.findById(avatar.admission._id))?.status, "CONSUMED");
  assert.equal((await User.findById(user._id))?.creatorStatus, "pending");
});

test("Admin approval preserves an append-only decision audit", async () => {
  const { application } = await completeSubmittedApplication();
  const response = await fetch(`${baseUrl}/api/v1/admin/creator-applications/${application._id}/approve`, { method: "PATCH", headers: { authorization: `Bearer ${await createAdminToken()}` } });
  assert.equal(response.status, 200);
  const audit = await AuditLog.findOne({ entityId: application._id, action: "CREATOR_APPLICATION_APPROVED" }).lean();
  assert.equal(audit?.actorType, "ADMIN");
  assert.equal(audit?.before?.status, "submitted");
  assert.equal(audit?.after?.status, "approved");
});

test("Admin approval copies only trusted application media and retains it for the Creator profile", async () => {
  const user = await createEligibleUser();
  const avatar = await createAdmission(user._id, "CREATOR_APPLICATION_AVATAR", "https://trusted.test/application-avatar");
  const cover = await createAdmission(user._id, "CREATOR_APPLICATION_COVER", "https://trusted.test/application-cover");
  const photo = await createAdmission(user._id, "CREATOR_APPLICATION_MEDIA", "https://trusted.test/application-media");
  const photoTwo = await createAdmission(user._id, "CREATOR_APPLICATION_MEDIA", "https://trusted.test/application-media-two");
  assert.equal((await submit(user._id, {
    avatar: { kind: "ADMISSION", admissionReference: avatar.admission.admissionReference },
    cover: { kind: "ADMISSION", admissionReference: cover.admission.admissionReference },
    media: [{ kind: "ADMISSION", admissionReference: photo.admission.admissionReference }, { kind: "ADMISSION", admissionReference: photoTwo.admission.admissionReference }],
  })).status, 201);

  const application = await CreatorApplication.findOne({ userId: user._id });
  assert.ok(application);
  user.creatorStatus = "pending";
  await user.save();
  const response = await fetch(`${baseUrl}/api/v1/admin/creator-applications/${application._id}/approve`, { method: "PATCH", headers: { authorization: `Bearer ${await createAdminToken()}` } });
  assert.equal(response.status, 200);

  const creatorProfile = await CreatorProfile.findOne({ userId: user._id }).lean();
  assert.equal(creatorProfile?.avatarUrl, application.avatarUrl);
  assert.equal(creatorProfile?.coverUrl, application.coverUrl);
  assert.deepEqual(creatorProfile?.media, application.media);
  const unchangedUserProfile = await UserProfile.findOne({ userId: user._id }).lean();
  assert.equal(unchangedUserProfile?.avatar, "https://legacy.test/avatar");
  assert.equal(unchangedUserProfile?.cover, "https://legacy.test/cover");
  assert.deepEqual(unchangedUserProfile?.profilePhotos, ["https://legacy.test/one", "https://legacy.test/two"]);
  assert.equal(await ProviderAssetReference.countDocuments({ entityType: "CREATOR_APPLICATION", entityId: application._id, state: "CURRENT" }), 4);
  assert.equal(await ProviderAssetReference.countDocuments({ entityType: "CREATOR_PROFILE", entityId: creatorProfile?._id, state: "CURRENT" }), 4);
});

test("applications reject missing media and Admin refuses untrusted application URLs", async () => {
  const emptyUser = await createEligibleUser();
  emptyUser.creatorStatus = "pending";
  await emptyUser.save();
  await assert.rejects(() => CreatorApplication.create({ userId: emptyUser._id, displayName: "No Media Creator", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: ["Portraits"], publicBio: "I create documentary portraits.", languages: ["English"], status: "submitted", rejectionReason: "", submittedForReviewAt: new Date() }), /ValidationError/i);
  const adminToken = await createAdminToken();
  assert.equal(await CreatorProfile.countDocuments({ userId: emptyUser._id }), 0);

  const untrustedUser = await createEligibleUser();
  untrustedUser.creatorStatus = "pending";
  await untrustedUser.save();
  const untrustedApplication = await CreatorApplication.create({ userId: untrustedUser._id, displayName: "Untrusted Creator", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: ["Portraits"], publicBio: "I create documentary portraits.", languages: ["English"], avatarUrl: "https://untrusted.test/avatar", coverUrl: "https://untrusted.test/cover", media: ["https://untrusted.test/media", "https://untrusted.test/media2"], status: "submitted", rejectionReason: "", submittedForReviewAt: new Date() });
  const rejected = await fetch(`${baseUrl}/api/v1/admin/creator-applications/${untrustedApplication._id}/approve`, { method: "PATCH", headers: { authorization: `Bearer ${adminToken}` } });
  assert.equal(rejected.status, 400);
  assert.equal(await CreatorProfile.countDocuments({ userId: untrustedUser._id }), 0);
  assert.equal((await CreatorApplication.findById(untrustedApplication._id))?.status, "submitted");
});

test("Admin rejection preserves the decision actor and reason in the audit", async () => {
  const user = await createEligibleUser();
  user.creatorStatus = "pending";
  await user.save();
  const application = await CreatorApplication.create({ userId: user._id, ...requiredFixtureMedia, displayName: "Rejected Creator", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: ["Portraits"], publicBio: "I create documentary portraits.", languages: ["English"], status: "submitted", rejectionReason: "", submittedForReviewAt: new Date() });
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
  const { user: unauthorizedUser, application: unauthorizedApplication } = await completeSubmittedApplication();
  const unauthorizedSession = await createAuthSession(String(unauthorizedUser._id));
  const unauthorized = await fetch(`${baseUrl}/api/v1/admin/creator-applications/${unauthorizedApplication._id}/approve`, { method: "PATCH", headers: { authorization: `Bearer ${jwt.sign({ id: String(unauthorizedUser._id), role: "user", sid: String(unauthorizedSession._id) }, process.env.JWT_SECRET!)}` } });
  assert.equal(unauthorized.status, 403);
  assert.equal(await AuditLog.countDocuments({ entityId: unauthorizedApplication._id, action: "CREATOR_APPLICATION_APPROVED" }), 0);

  const { application } = await completeSubmittedApplication();
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
  const application = await CreatorApplication.create({ userId: user._id, ...requiredFixtureMedia, displayName: "Retained Creator", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: ["Portraits"], publicBio: "I create documentary portraits.", languages: ["English"], status: "submitted", rejectionReason: "", submittedForReviewAt: new Date() });
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
    { userId: submittedUser._id, ...requiredFixtureMedia, displayName: "Submitted History", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: [], publicBio: "Submitted application", languages: [], status: "submitted", rejectionReason: "", submittedForReviewAt: new Date() },
    { userId: approvedUser._id, ...requiredFixtureMedia, displayName: "Approved History", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: [], publicBio: "Approved application", languages: [], status: "approved", rejectionReason: "", submittedForReviewAt: new Date() },
    { userId: rejectedUser._id, ...requiredFixtureMedia, displayName: "Rejected History", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: [], publicBio: "Rejected application", languages: [], status: "rejected", rejectionReason: "Incomplete portfolio", submittedForReviewAt: new Date() },
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
