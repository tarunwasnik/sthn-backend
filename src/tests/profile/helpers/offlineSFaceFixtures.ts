import "./offlineSFaceIsolation";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { TestContext } from "node:test";
import sharp from "sharp";
import mongoose from "mongoose";
import { sfacePath, yunetPath } from "./offlineSFaceIsolation";
import User from "../../../models/User";
import { UserProfile } from "../../../models/userProfile.model";
import { CreatorApplication } from "../../../models/creatorApplication.model";
import { CreatorProfile } from "../../../models/creatorProfile.model";
import { FaceVerificationSession } from "../../../models/faceVerificationSession.model";
import { FaceVerificationEvidence } from "../../../models/faceVerificationEvidence.model";
import { ProfileVerificationRequest } from "../../../models/profileVerificationRequest.model";
import { ProfileVerificationJob } from "../../../models/profileVerificationJob.model";
import { ProfileVerificationInferenceResult } from "../../../models/profileVerificationInferenceResult.model";
import { faceVerificationSessionRepository } from "../../../repositories/faceVerificationSession.repository";
import { faceVerificationEvidenceRepository } from "../../../repositories/faceVerificationEvidence.repository";
import { ensureActiveProfileVerificationRequest } from "../../../services/profile/profileVerificationRequest.service";
import { ensureProfileVerificationJob } from "../../../services/profile/profileVerificationJob.service";
import { acceptFaceVerificationCapture } from "../../../services/profile/faceVerificationSession.service";
import { startCreatorVerificationSession, acceptCreatorVerificationCapture, submitCreatorVerificationRequest } from "../../../services/creator/creatorVerification.service";
import * as storage from "../../../services/profile/faceVerificationEvidenceStorage.service";
import * as avatar from "../../../services/profile/profileVerificationAvatarRead.service";
import { readProfileVerificationEvidenceBytes } from "../../../services/profile/faceVerificationEvidenceRead.service";
import { createSFaceProfileVerificationAdapter } from "../../../services/profile/profileVerificationSFaceAdapter";
import { fingerprintProfileMediaReference } from "../../../services/profile/profileVerificationSubmittedMedia.service";
import * as embedding from "../../../services/profile/profileVerificationFaceEmbeddingAdapter";
import { normalizeFaceEmbeddingL2 } from "../../../services/profile/profileVerificationFaceEmbedding.service";
import { YUNET_ARTIFACT } from "../../../services/profile/profileVerificationYuNet.constants";
import { YuNetDetection } from "../../../services/profile/profileVerificationYuNet.types";
import { YuNetRunnerRole } from "../../../services/profile/profileVerificationYuNetRuntimeAudit.service";
import { connectPhase7HDatabase, disconnectPhase7HDatabase, clearPhase7HDatabase } from "../../financial/phase7h/helpers/database";

export { clearPhase7HDatabase as clearOfflineDatabase, disconnectPhase7HDatabase as disconnectOfflineDatabase };
export type Target = "USER_PROFILE" | "CREATOR_APPLICATION";
export const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function connectOfflineDatabase() {
  // Independently verify both local artifacts; no download/fallback is permitted.
  for (const [file, spec] of [[sfacePath, embedding.SFACE_ARTIFACT], [yunetPath, YUNET_ARTIFACT]] as const) {
    const bytes = await fs.readFile(file);
    assert.equal(bytes.length, spec.bytes);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), spec.sha256);
  }
  await connectPhase7HDatabase();
  assert.equal(mongoose.connection.host, "127.0.0.1");
  assert.equal(mongoose.connection.name, "sthn_phase7h_test");
  await Promise.all([User, UserProfile, CreatorApplication, CreatorProfile, FaceVerificationSession, FaceVerificationEvidence, ProfileVerificationRequest, ProfileVerificationJob, ProfileVerificationInferenceResult].map(model => model.init()));
  // Existing Creator harness pattern, exclusively in the newly created disposable DB.
  for (const [model, legacy, name] of [
    [FaceVerificationSession, "one_current_face_verification_session", "one_current_face_verification_target_session"],
    [ProfileVerificationRequest, "one_active_profile_verification_request", "one_active_target_verification_request"],
  ] as const) {
    const indexes = await model.collection.indexes();
    if (indexes.some(index => index.name === legacy)) await model.collection.dropIndex(legacy);
    if (!indexes.some(index => index.name === name)) await model.collection.createIndex({ targetType: 1, targetId: 1 }, {
      unique: true, name, partialFilterExpression: { [model === FaceVerificationSession ? "isCurrent" : "isActive"]: true, targetType: { $exists: true }, targetId: { $exists: true } },
    });
  }
}

/** Generated colour patterns, NOT faces. Similarity is only a numerical integration check. */
export async function generatedImage(seed: number) {
  const pixels = Buffer.alloc(160 * 160 * 3);
  for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) for (let c = 0; c < 3; c++) {
    pixels[(y * 160 + x) * 3 + c] = (x * 13 + y * 7 + c * 71) % 220 + seed;
  }
  return sharp(pixels, { raw: { width: 160, height: 160, channels: 3 } }).png().toBuffer();
}

/** Explicit synthetic detector: no YuNet detection or camera/liveness assertion. */
export const syntheticDetection = (): YuNetDetection => ({
  width: 160, height: 160, decodedBytes: 160 * 160 * 3,
  faces: [{ x: 30, y: 30, width: 100, height: 100, confidence: .99,
    landmarks: { rightEye: { x: 62.2946, y: 75.6963 }, leftEye: { x: 97.5318, y: 75.5014 }, noseTip: { x: 80.0252, y: 95.7366 }, rightMouthCorner: { x: 65.5493, y: 116.3655 }, leftMouthCorner: { x: 94.7299, y: 116.2041 } },
  }],
});

let sequence = 0;
export async function fixture(t: TestContext, target: Target, policy = "GATED_MULTI_MEDIA_V1") {
  process.env.STHN_PROFILE_VERIFICATION_POLICY = policy;
  const suffix = `ai03-${++sequence}`;
  const images = await Promise.all(Array.from({ length: 13 }, (_, i) => generatedImage(i)));
  const references = Array.from({ length: 8 }, (_, i) => `https://res.cloudinary.com/ai03-test/image/upload/${suffix}-${i}.png`);
  const media = new Map(references.map((ref, i) => [ref, images[i + 5]]));
  const assets = new Map<string, Buffer>();
  const store: typeof storage.storeFaceVerificationEvidence = async ({ buffer, publicId }) => {
    assets.set(publicId, Buffer.from(buffer));
    return { publicId, bytes: buffer.length, format: "png", mimeType: "image/png" };
  };
  t.mock.method(storage, "storeFaceVerificationEvidence", store);
  t.mock.method(avatar, "readTrustedFaceVerificationAvatarReference", async (ref: string) => {
    const bytes = media.get(ref); assert.ok(bytes, "Only generated fixture media may be read"); return bytes;
  });
  const user = await User.create({ email: `${suffix}@example.test`, password: "synthetic-only", role: "user", status: "active", governanceState: "ACTIVE", creatorStatus: "none" });
  const profile = await UserProfile.create({ userId: user._id, username: suffix, dateOfBirth: new Date("1990-01-01"), interests: [], bio: "Generated fixture", avatar: references[0], cover: references[1], profilePhotos: references.slice(2), profileStatus: target === "USER_PROFILE" ? "pending_verification" : "verified", verificationSubmissionVersion: 1, verificationSubmittedAt: new Date() });
  let request;
  let session;
  let application;
  if (target === "CREATOR_APPLICATION") {
    application = await CreatorApplication.create({ userId: user._id, applicationJourney: "user_upgrade", draftVersion: 1, verificationRevision: 1, displayName: suffix, primaryCategory: "Music", country: "IN", city: "Kolkata", currency: "INR", services: [], publicBio: "Generated fixture", languages: ["English"], avatarUrl: references[0], coverUrl: references[1], media: references.slice(2), status: "draft" });
    session = await startCreatorVerificationSession(String(user._id));
    for (let i = 0; i < 5; i++) await acceptCreatorVerificationCapture({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: String(i), file: { buffer: images[i] } as Express.Multer.File, storeEvidence: store });
    request = await submitCreatorVerificationRequest(String(user._id));
    assert.ok(request);
  } else {
    // Seed an already-submitted User attempt; admission/onboarding HTTP is outside this harness.
    request = (await ensureActiveProfileVerificationRequest(profile)).request;
    session = await faceVerificationSessionRepository.create({ sessionReference: `FACE_SESSION_${suffix}`, userId: user._id, profileId: profile._id, profileSubmissionVersion: 1, avatarFingerprint: fingerprintProfileMediaReference(profile.avatar), challenges: ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"], expiresAt: new Date(Date.now() + 900_000) });
    for (let i = 0; i < 5; i++) await acceptFaceVerificationCapture({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: String(i), file: { buffer: images[i] } as Express.Multer.File });
    await FaceVerificationSession.updateOne({ _id: session._id }, { $set: { verificationRequestId: request._id } });
    await faceVerificationEvidenceRepository.bindSessionEvidence(session._id, request._id);
    await ensureProfileVerificationJob(request);
  }
  const records = await FaceVerificationEvidence.find({ sessionId: session._id }).sort({ challengeIndex: 1 });
  assert.deepEqual(records.map(r => r.challengeIndex), [0, 1, 2, 3, 4]);
  assert.equal(assets.size, 5);
  const captureReads: number[] = [];
  const mediaReads: string[] = [];
  const detectorRoles: Array<YuNetRunnerRole | undefined> = [];
  const makeAdapter = (detect = async (_bytes: Buffer, _role?: YuNetRunnerRole) => syntheticDetection()) => {
    const adapter = createSFaceProfileVerificationAdapter({
      evidenceReader: input => readProfileVerificationEvidenceBytes({ ...input, storageReader: async ({ publicId }) => {
        const record = records.find(r => r.cloudinaryPublicId === publicId); assert.ok(record);
        const bytes = assets.get(publicId); assert.ok(bytes);
        captureReads.push(record.challengeIndex);
        return { bytes: Buffer.from(bytes), byteLength: bytes.length, contentType: "image/png" };
      } }),
      // Keep the real avatar ownership/version/fingerprint reader, mock only its storage boundary.
      detector: async (bytes, role) => { detectorRoles.push(role); return detect(bytes, role); },
      submittedMediaReader: async item => {
        assert.equal(item.fingerprint, fingerprintProfileMediaReference(item.sourceReference));
        const bytes = media.get(item.sourceReference); assert.ok(bytes); mediaReads.push(item.sourceReference); return bytes;
      },
    });
    return { ...adapter, pipelineManifest: { ...adapter.pipelineManifest,
      pipelineVersion: "AI03_REAL_SFACE_SYNTHETIC_LANDMARKS_V1",
      preprocessingVersion: "AI03_SYNTHETIC_LANDMARKS_REAL_SFACE_RGB_V1",
      detector: { identifier: "TEST_ONLY_SYNTHETIC_LANDMARKS", version: "AI03", artifactSha256: hash("synthetic-landmarks-not-yunet") },
    } };
  };
  return { user, profile, application, request, session, records, images, references, makeAdapter, captureReads, mediaReads, detectorRoles };
}

/** Observe actual production embedding calls without changing their inputs/outputs. */
export function observeRealEmbeddings(t: TestContext) {
  const original = embedding.getProductionFaceEmbeddingAdapter;
  const vectors: number[][] = [];
  t.mock.method(embedding, "getProductionFaceEmbeddingAdapter", () => {
    const real = original();
    return { ...real, infer: async (input: Parameters<typeof real.infer>[0]) => {
      assert.equal(input.width, 112); assert.equal(input.height, 112); assert.equal(input.channels, 3);
      assert.equal(input.preprocessingIdentifier, embedding.SFACE_FACE_EMBEDDING_SPECIFICATION.preprocessing.identifier);
      const values = await real.infer(input);
      assert.equal(values.length, 128); assert.ok(values.every(Number.isFinite));
      const normalized = normalizeFaceEmbeddingL2(values, 128);
      assert.ok(Math.abs(normalized.reduce((s, n) => s + n * n, 0) - 1) < 1e-12);
      vectors.push([...values]); return values;
    } };
  });
  return vectors;
}

export async function assertNoActivation(f: Awaited<ReturnType<typeof fixture>>) {
  const [user, profile, creator] = await Promise.all([User.findById(f.user._id).orFail(), UserProfile.findById(f.profile._id).orFail(), CreatorProfile.findOne({ userId: f.user._id })]);
  assert.equal(user.role, "user"); assert.equal(user.status, "active"); assert.equal(creator, null);
  assert.equal(profile.profileStatus, f.application ? "verified" : "pending_verification");
  assert.equal(user.creatorStatus, f.application ? "pending" : "none");
  if (f.application) assert.equal((await CreatorApplication.findById(f.application._id))?.status, "submitted");
}
