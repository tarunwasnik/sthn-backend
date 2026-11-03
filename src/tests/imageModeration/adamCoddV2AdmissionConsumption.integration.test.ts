import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";

import app from "../../app";
import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { CreatorApplication } from "../../models/creatorApplication.model";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { CreatorService } from "../../models/creatorService.model";
import { ImageAdmission } from "../../models/imageAdmission.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { ImageModerationAttempt } from "../../models/imageModerationAttempt.model";
import { ProviderAssetReference } from "../../models/providerAssetReference.model";
import { CreatorMediaCleanupIntent } from "../../models/creatorMediaCleanupIntent.model";
import { AdamCoddV2ImageSafetyService } from "../../services/imageModeration/adamCoddV2ImageSafety.service";
import { ImageTemporaryUploadService } from "../../services/imageModeration/imageTemporaryUpload.service";
import { TemporaryImageAssetCleanupService, TemporaryImageAssetReleaseError } from "../../services/imageModeration/temporaryImageAssetCleanup.service";
import { profileMediaAdmissionPersistenceService } from "../../services/profile/profileMediaAdmissionPersistence.service";
import { CreatorMediaAdmissionPersistenceService } from "../../services/creator/creatorMediaAdmissionPersistence.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

/*
 * This suite deliberately uses the real V2 preprocessor and ONNX runtime, but
 * replaces only the external provider adapter.  No request in this file can
 * reach Cloudinary or a configured MongoDB instance.
 */
process.env.NODE_ENV = "test";

const fixturePath = path.resolve(process.cwd(), "evaluation-cache/image-moderation/benchmark/collection-c/manual-incoming/01_PASS/04_beachwear_swimwear/andrew-valdivia-GZ6whV2o5p4-unsplash.jpg");
const modelPath = path.resolve(process.cwd(), "models/adamcodd-v2/model_int8.onnx");
let fixture: Buffer;
let uploadOrdinal = 0;
let server: http.Server;
let baseUrl: string;
const v2 = new AdamCoddV2ImageSafetyService({ modelPath });
const uploader = new ImageTemporaryUploadService(
  undefined,
  v2,
  async (bytes: Buffer, publicId: string) => ({ secure_url: `https://isolated.invalid/${publicId}.jpg`, public_id: `isolated/${++uploadOrdinal}`, resource_type: "image", bytes: bytes.length, format: "jpg", original_filename: "ignored" }),
  async () => undefined,
);

const createUser = async (role: "user" | "creator" = "user") => User.create({
  email: `v2-consume-${new Types.ObjectId()}@test.local`, password: "test-password", status: "active", governanceState: "ACTIVE", role,
});

const passAdmission = async (actorId: Types.ObjectId, role: string, surface: string) => {
  const result = await uploader.submit({ actorId, role, surface, bytes: fixture });
  assert.equal(result.decision, "PASS", `fixture must remain a frozen V2 PASS for ${surface}`);
  assert.ok("admissionReference" in result);
  return result as Extract<typeof result, { decision: "PASS" }>;
};

before(async () => {
  fixture = await readFile(fixturePath);
  await connectPhase7HDatabase();
  process.env.JWT_SECRET = "v2-consumption-isolated-test-secret";
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("isolated test server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
}, { timeout: 120_000 });
beforeEach(async () => { uploadOrdinal = 0; await clearPhase7HDatabase(); });
after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await disconnectPhase7HDatabase(); });

test("real V2 PASS admission becomes committed User Profile media; unchanged and rollback boundaries hold", { timeout: 300_000 }, async () => {
  const user = await createUser();
  const profile = await UserProfile.create({ userId: user._id, username: `v2-user-${new Types.ObjectId()}`, dateOfBirth: new Date("1990-01-01"), bio: "isolated", interests: [], avatar: "https://legacy.invalid/avatar", cover: "https://legacy.invalid/cover", profilePhotos: ["https://legacy.invalid/one", "https://legacy.invalid/two"], profileStatus: "verified" });
  const approved = await passAdmission(user._id, "user", "USER_PROFILE_COVER");
  await profileMediaAdmissionPersistenceService.persist({ actorId: user._id, expectedProfileVersion: profile.__v, allowedExistingProfileStatuses: ["verified"], media: { cover: { kind: "ADMISSION", admissionReference: approved.admissionReference } } });
  const persisted = await UserProfile.findById(profile._id).lean();
  const asset = await ImageModerationAsset.findOne({ assetReference: approved.assetReference }).lean();
  assert.equal(persisted?.cover, asset?.trustedMediaReference, "authoritative media is the trusted provider reference");
  assert.equal(persisted?.avatar, "https://legacy.invalid/avatar");
  assert.deepEqual(persisted?.profilePhotos, ["https://legacy.invalid/one", "https://legacy.invalid/two"]);
  const admission = await ImageAdmission.findOne({ admissionReference: approved.admissionReference }).lean();
  const attempt = await ImageModerationAttempt.findOne({ attemptReference: approved.attemptReference }).lean();
  assert.equal(admission?.status, "CONSUMED"); assert.equal(asset?.status, "COMMITTED");
  assert.equal(attempt?.provenanceModel.identifier, "STHN_ADAMCODD_V2_INT8");
  assert.equal(attempt?.provenanceModel.pipeline, "V2");
  assert.equal(attempt?.provenanceModel.threshold, 0.3362914399272772);
  assert.equal(await ProviderAssetReference.countDocuments({ imageModerationAssetId: asset?._id, releasedAt: null }), 1);
  let physicalDeletes = 0;
  const cleanup = new TemporaryImageAssetCleanupService(undefined, undefined, async () => { physicalDeletes += 1; return "DELETED"; });
  await assert.rejects(() => cleanup.requestRelease({ actorId: user._id, assetReference: approved.assetReference, surface: "USER_PROFILE_COVER" }), (error: unknown) => error instanceof TemporaryImageAssetReleaseError && error.code === "COMMITTED");
  assert.equal(physicalDeletes, 0);
  const rollback = await passAdmission(user._id, "user", "USER_PROFILE_COVER");
  await assert.rejects(() => profileMediaAdmissionPersistenceService.persist({ actorId: user._id, media: { cover: { kind: "ADMISSION", admissionReference: rollback.admissionReference } }, withinTransaction: async () => { throw new Error("injected rollback"); } }));
  assert.equal((await UserProfile.findById(profile._id).lean())?.cover, persisted?.cover);
  assert.equal((await ImageAdmission.findOne({ admissionReference: rollback.admissionReference }).lean())?.status, "ACTIVE");
  assert.equal((await ImageModerationAsset.findOne({ assetReference: rollback.assetReference }).lean())?.status, "TEMPORARY");
});

test("real V2 admissions consume through Creator Application, Profile, and Service transactions", { timeout: 420_000 }, async () => {
  const creator = await createUser("creator");
  const applicant = await createUser();
  await UserProfile.create({ userId: applicant._id, username: `v2-applicant-${new Types.ObjectId()}`, dateOfBirth: new Date("1990-01-01"), bio: "Verified profile", interests: [], avatar: "https://legacy.invalid/avatar", cover: "https://legacy.invalid/cover", profilePhotos: ["https://legacy.invalid/one", "https://legacy.invalid/two"], profileStatus: "verified" });
  const appAvatar = await passAdmission(applicant._id, "user", "CREATOR_APPLICATION_AVATAR");
  const appCover = await passAdmission(applicant._id, "user", "CREATOR_APPLICATION_COVER");
  const appMedia = await passAdmission(applicant._id, "user", "CREATOR_APPLICATION_MEDIA");
  const token = jwt.sign({ id: String(applicant._id), role: "user" }, process.env.JWT_SECRET!);
  const applicationResponse = await fetch(`${baseUrl}/api/v1/creator-applications`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ displayName: "V2 Applicant", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", services: ["Portraits"], publicBio: "I create documentary portraits.", languages: ["English"], avatar: { kind: "ADMISSION", admissionReference: appAvatar.admissionReference }, cover: { kind: "ADMISSION", admissionReference: appCover.admissionReference }, media: [{ kind: "ADMISSION", admissionReference: appMedia.admissionReference }] }) });
  assert.equal(applicationResponse.status, 201);
  assert.equal((await CreatorApplication.findOne({ userId: applicant._id }).lean())?.status, "submitted");
  assert.equal((await User.findById(applicant._id).lean())?.creatorStatus, "pending");
  assert.equal(await ImageAdmission.countDocuments({ actorId: applicant._id, status: "CONSUMED", surface: /^CREATOR_APPLICATION/ }), 3);
  const persistence = new CreatorMediaAdmissionPersistenceService();

  const profile = await CreatorProfile.create({ userId: creator._id, slug: `v2-${new Types.ObjectId()}`, displayName: "V2 Creator", primaryCategory: "Photography", country: "India", city: "Mumbai", currency: "INR", status: "active", avatarUrl: "https://legacy.invalid/creator-avatar", coverUrl: "https://legacy.invalid/creator-cover", media: ["https://legacy.invalid/creator-media"] });
  const profileAvatar = await passAdmission(creator._id, "creator", "CREATOR_PROFILE_AVATAR");
  await persistence.persist({ actorId: creator._id, kind: "CREATOR_PROFILE", claims: { avatar: { kind: "ADMISSION", admissionReference: profileAvatar.admissionReference } }, loadOwnedResource: async () => ({ id: profile._id, actorId: creator._id, media: { avatar: profile.avatarUrl, cover: profile.coverUrl, media: profile.media ?? [] } }), persistMedia: async ({ session, media }) => { await CreatorProfile.updateOne({ _id: profile._id }, { $set: { avatarUrl: media.avatar, coverUrl: media.cover, media: media.media } }, { session }); } });
  const persistedProfile = await CreatorProfile.findById(profile._id).lean();
  assert.notEqual(persistedProfile?.avatarUrl, "https://legacy.invalid/creator-avatar"); assert.equal(persistedProfile?.coverUrl, "https://legacy.invalid/creator-cover");
  const serviceAdmission = await passAdmission(creator._id, "creator", "CREATOR_SERVICE_MEDIA");
  let serviceId: Types.ObjectId | undefined;
  await persistence.persist({ actorId: creator._id, kind: "CREATOR_SERVICE", claims: { media: [{ kind: "ADMISSION", admissionReference: serviceAdmission.admissionReference }] }, loadOwnedResource: async (session) => { const [service] = await CreatorService.create([{ creatorId: creator._id, title: "V2 service", description: "isolated creator service", durationMinutes: 60, price: 1000, currency: "INR", media: [] }], { session }); serviceId = service._id; return { id: service._id, actorId: creator._id, media: { media: [] } }; }, persistMedia: async ({ session, media }) => { await CreatorService.updateOne({ _id: serviceId }, { $set: { media: media.media } }, { session }); } });
  assert.equal((await CreatorService.findById(serviceId).lean())?.media?.length, 1);
  assert.equal(await ProviderAssetReference.countDocuments({ entityType: "CREATOR_SERVICE", releasedAt: null }), 1);
  assert.equal(await CreatorMediaCleanupIntent.countDocuments({}), 0, "creation/replacement of legacy references must not schedule destructive cleanup");
});
