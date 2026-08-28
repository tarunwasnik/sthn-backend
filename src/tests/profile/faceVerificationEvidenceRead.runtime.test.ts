import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { ProfileVerificationJob } from "../../models/profileVerificationJob.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { ProfileVerificationInferenceResult } from "../../models/profileVerificationInferenceResult.model";
import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";
import { ensureActiveProfileVerificationRequest } from "../../services/profile/profileVerificationRequest.service";
import { readProfileVerificationEvidenceBytes } from "../../services/profile/faceVerificationEvidenceRead.service";
import { FaceVerificationEvidenceStorageReader, createFaceVerificationEvidenceStorageReader } from "../../services/profile/faceVerificationEvidenceStorage.service";
import { FACE_VERIFICATION_EVIDENCE_MAX_AGGREGATE_BYTES, FACE_VERIFICATION_EVIDENCE_MAX_BYTES } from "../../services/profile/faceVerification.constants";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const challenges = ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"] as const;

const makeFixture = async (suffix: string, bytes = png) => {
  const format = bytes.equals(jpeg) ? "jpeg" : bytes.equals(webp) ? "webp" : "png";
  const mimeType = `image/${format}`;
  const user = await User.create({ email: `evidence-read-${suffix}@test.local`, password: "test-password", status: "active", governanceState: "ACTIVE" });
  const profile = await UserProfile.create({
    userId: user._id, username: `evidence-read-${suffix}`, dateOfBirth: new Date("1990-01-01"), interests: [], bio: "Evidence read test.",
    avatar: "https://example.test/avatar.jpg", cover: "https://example.test/cover.jpg", profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
    profileStatus: "pending_verification", verificationSubmittedAt: new Date(), verificationSubmissionVersion: 1,
  });
  const { request } = await ensureActiveProfileVerificationRequest(profile);
  const session = await FaceVerificationSession.create({
    sessionReference: `FACE_SESSION_READ_${suffix}`, userId: user._id, profileId: profile._id, verificationRequestId: request._id,
    profileSubmissionVersion: 1, avatarFingerprint: "a".repeat(64), status: "CAPTURE_COMPLETE", isCurrent: true, challenges: [...challenges],
    requiredCaptureCount: 5, acceptedCaptureCount: 5, startedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), captureCompletedAt: new Date(),
  });
  await FaceVerificationEvidence.insertMany(challenges.map((challenge, challengeIndex) => ({
    evidenceReference: `FACE_EVIDENCE_READ_${suffix}_${challengeIndex}`, sessionId: session._id, userId: user._id, profileId: profile._id,
    verificationRequestId: request._id, challengeIndex, challenge, cloudinaryPublicId: `opaque-${suffix}-${challengeIndex}`,
    cloudinaryResourceType: "image", status: "STORED", mimeType, format, bytes: bytes.length, captureReceivedAt: new Date(),
  })));
  return { user, profile, request, session, bytes };
};

const storageReturning = (bytes: Buffer, contentType = "image/png"): { reader: FaceVerificationEvidenceStorageReader; calls: () => number } => {
  let count = 0;
  return { reader: async () => { count += 1; return { bytes: Buffer.from(bytes), byteLength: bytes.length, contentType }; }, calls: () => count };
};

const rejectsWith = async (operation: () => Promise<unknown>, code: string, retryable?: boolean) => {
  await assert.rejects(operation, (error: unknown) => error instanceof ProfileVerificationInferenceError
    && error.code === code && (retryable === undefined || error.retryable === retryable));
};

const response = (status: number, bytes: Buffer, contentType = "image/png", contentLength?: string) => new Response(new Uint8Array(bytes), {
  status,
  headers: { "content-type": contentType, ...(contentLength ? { "content-length": contentLength } : {}) },
});

before(async () => { await connectPhase7HDatabase(); }, { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

test("active authority returns exactly five safe descriptors in challenge-index order without mutations", async () => {
  const fixture = await makeFixture("valid");
  const storage = storageReturning(fixture.bytes);
  const before = JSON.stringify({ request: (await ProfileVerificationRequest.findById(fixture.request._id))?.toObject(), session: (await FaceVerificationSession.findById(fixture.session._id))?.toObject(), evidence: await FaceVerificationEvidence.find({ sessionId: fixture.session._id }).lean() });
  const outcome = await readProfileVerificationEvidenceBytes({ verificationRequestId: String(fixture.request._id), storageReader: storage.reader });
  assert.deepEqual(outcome.evidence?.map((item) => item.challengeIndex), [0, 1, 2, 3, 4]);
  assert.equal(storage.calls(), 5);
  assert.equal(JSON.stringify(outcome.evidence).match(/url|publicid|assetid|credential/i), null);
  assert.equal(JSON.stringify({ request: (await ProfileVerificationRequest.findById(fixture.request._id))?.toObject(), session: (await FaceVerificationSession.findById(fixture.session._id))?.toObject(), evidence: await FaceVerificationEvidence.find({ sessionId: fixture.session._id }).lean() }), before);
  assert.equal(await ProfileVerificationJob.countDocuments({ verificationRequestId: fixture.request._id }), 0);
  assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: fixture.request._id }), 0);
});

test("terminal, stale, and invalid exact-five authority paths perform zero storage reads", async () => {
  const terminal = await makeFixture("terminal");
  await ProfileVerificationRequest.updateOne({ _id: terminal.request._id }, { $set: { status: "APPROVED", isActive: false, decision: "APPROVE", decidedAt: new Date() } });
  const terminalStorage = storageReturning(png);
  assert.equal((await readProfileVerificationEvidenceBytes({ verificationRequestId: String(terminal.request._id), storageReader: terminalStorage.reader })).noOp, "TERMINAL_REQUEST");
  assert.equal(terminalStorage.calls(), 0);

  const stale = await makeFixture("stale");
  await FaceVerificationSession.updateOne({ _id: stale.session._id }, { $set: { profileSubmissionVersion: 2 } });
  const staleStorage = storageReturning(png);
  assert.equal((await readProfileVerificationEvidenceBytes({ verificationRequestId: String(stale.request._id), storageReader: staleStorage.reader })).noOp, "STALE_SUBMISSION");
  assert.equal(staleStorage.calls(), 0);

  const invalid = await makeFixture("invalid");
  await FaceVerificationEvidence.deleteOne({ sessionId: invalid.session._id, challengeIndex: 4 });
  const invalidStorage = storageReturning(png);
  await rejectsWith(() => readProfileVerificationEvidenceBytes({ verificationRequestId: String(invalid.request._id), storageReader: invalidStorage.reader }), "EVIDENCE_INCOMPLETE");
  assert.equal(invalidStorage.calls(), 0);
});

test("metadata/content/magic mismatches and unavailable stored assets are bounded and return no partial payload", async () => {
  const mismatch = await makeFixture("mismatch");
  const mismatchStorage = storageReturning(jpeg, "image/jpeg");
  await rejectsWith(() => readProfileVerificationEvidenceBytes({ verificationRequestId: String(mismatch.request._id), storageReader: mismatchStorage.reader }), "EVIDENCE_INTEGRITY_FAILED");
  assert.equal(mismatchStorage.calls(), 1);

  const unavailable = await makeFixture("missing");
  let calls = 0;
  const unavailableReader: FaceVerificationEvidenceStorageReader = async () => { calls += 1; throw new ProfileVerificationInferenceError("signed=https://private.example/sensitive", "EVIDENCE_NOT_AVAILABLE", 409); };
  await rejectsWith(() => readProfileVerificationEvidenceBytes({ verificationRequestId: String(unavailable.request._id), storageReader: unavailableReader }), "EVIDENCE_NOT_AVAILABLE", false);
  await assert.rejects(
    () => readProfileVerificationEvidenceBytes({ verificationRequestId: String(unavailable.request._id), storageReader: unavailableReader }),
    (error: unknown) => error instanceof Error && !error.message.includes("private.example") && !error.message.includes("signed="),
  );
  assert.equal(calls, 2);
});

test("storage boundary classifies timeout, 5xx, 404, content-length, and streamed overflow without leaking its private URL", async () => {
  const privateUrl = "https://private.example/download?signature=secret&public_id=opaque";
  const timeoutReader = createFaceVerificationEvidenceStorageReader({ privateDownloadUrlFactory: () => privateUrl, fetchImplementation: async () => { const error = new Error("aborted"); error.name = "AbortError"; throw error; } });
  await rejectsWith(() => timeoutReader({ publicId: "opaque", format: "png", maximumBytes: 10, timeoutMs: 10 }), "EVIDENCE_RETRIEVAL_TIMEOUT", true);

  const fiveHundredReader = createFaceVerificationEvidenceStorageReader({ privateDownloadUrlFactory: () => privateUrl, fetchImplementation: async () => response(503, png) });
  await rejectsWith(() => fiveHundredReader({ publicId: "opaque", format: "png", maximumBytes: 10, timeoutMs: 10 }), "EVIDENCE_RETRIEVAL_FAILED", true);

  const missingReader = createFaceVerificationEvidenceStorageReader({ privateDownloadUrlFactory: () => privateUrl, fetchImplementation: async () => response(404, png) });
  await rejectsWith(() => missingReader({ publicId: "opaque", format: "png", maximumBytes: 10, timeoutMs: 10 }), "EVIDENCE_NOT_AVAILABLE", false);

  const declaredOversize = createFaceVerificationEvidenceStorageReader({ privateDownloadUrlFactory: () => privateUrl, fetchImplementation: async () => response(200, png, "image/png", "11") });
  await rejectsWith(() => declaredOversize({ publicId: "opaque", format: "png", maximumBytes: 10, timeoutMs: 10 }), "EVIDENCE_TOO_LARGE");

  const streamedOversize = createFaceVerificationEvidenceStorageReader({ privateDownloadUrlFactory: () => privateUrl, fetchImplementation: async () => response(200, Buffer.alloc(11), "image/png") });
  await rejectsWith(() => streamedOversize({ publicId: "opaque", format: "png", maximumBytes: 10, timeoutMs: 10 }), "EVIDENCE_TOO_LARGE");
});

test("aggregate limits, supported signatures, and concurrent reads remain bounded and side-effect free", async () => {
  assert.equal(webp.length, 12);
  const aggregate = await makeFixture("aggregate");
  await FaceVerificationEvidence.updateMany({ sessionId: aggregate.session._id }, { $set: { bytes: FACE_VERIFICATION_EVIDENCE_MAX_BYTES + 1 } });
  const aggregateStorage = storageReturning(png);
  await rejectsWith(() => readProfileVerificationEvidenceBytes({ verificationRequestId: String(aggregate.request._id), storageReader: aggregateStorage.reader }), "EVIDENCE_TOO_LARGE");
  assert.equal(aggregateStorage.calls(), 0);

  for (const [suffix, bytes, contentType] of [["jpeg", jpeg, "image/jpeg"], ["png", png, "image/png"], ["webp", webp, "image/webp"]] as const) {
    const fixture = await makeFixture(`format-${suffix}`, bytes);
    const storage = storageReturning(bytes, contentType);
    const result = await readProfileVerificationEvidenceBytes({ verificationRequestId: String(fixture.request._id), storageReader: storage.reader });
    assert.equal(result.evidence?.[0].format, suffix === "jpeg" ? "jpeg" : suffix);
  }

  const concurrent = await makeFixture("concurrent");
  const storage = storageReturning(concurrent.bytes);
  const [first, second] = await Promise.all([
    readProfileVerificationEvidenceBytes({ verificationRequestId: String(concurrent.request._id), storageReader: storage.reader }),
    readProfileVerificationEvidenceBytes({ verificationRequestId: String(concurrent.request._id), storageReader: storage.reader }),
  ]);
  assert.equal(first.evidence?.length, 5); assert.equal(second.evidence?.length, 5); assert.equal(storage.calls(), 10);
  assert.equal(FACE_VERIFICATION_EVIDENCE_MAX_AGGREGATE_BYTES, 25 * 1024 * 1024);
});
