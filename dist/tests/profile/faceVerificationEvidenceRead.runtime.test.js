"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const User_1 = __importDefault(require("../../models/User"));
const userProfile_model_1 = require("../../models/userProfile.model");
const profileVerificationRequest_model_1 = require("../../models/profileVerificationRequest.model");
const profileVerificationJob_model_1 = require("../../models/profileVerificationJob.model");
const faceVerificationSession_model_1 = require("../../models/faceVerificationSession.model");
const faceVerificationEvidence_model_1 = require("../../models/faceVerificationEvidence.model");
const profileVerificationInferenceResult_model_1 = require("../../models/profileVerificationInferenceResult.model");
const ProfileVerificationInferenceError_1 = require("../../errors/profile/ProfileVerificationInferenceError");
const profileVerificationRequest_service_1 = require("../../services/profile/profileVerificationRequest.service");
const faceVerificationEvidenceRead_service_1 = require("../../services/profile/faceVerificationEvidenceRead.service");
const faceVerificationEvidenceStorage_service_1 = require("../../services/profile/faceVerificationEvidenceStorage.service");
const faceVerification_constants_1 = require("../../services/profile/faceVerification.constants");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const challenges = ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"];
const makeFixture = async (suffix, bytes = png) => {
    const format = bytes.equals(jpeg) ? "jpeg" : bytes.equals(webp) ? "webp" : "png";
    const mimeType = `image/${format}`;
    const user = await User_1.default.create({ email: `evidence-read-${suffix}@test.local`, password: "test-password", status: "active", governanceState: "ACTIVE" });
    const profile = await userProfile_model_1.UserProfile.create({
        userId: user._id, username: `evidence-read-${suffix}`, dateOfBirth: new Date("1990-01-01"), interests: [], bio: "Evidence read test.",
        avatar: "https://example.test/avatar.jpg", cover: "https://example.test/cover.jpg", profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
        profileStatus: "pending_verification", verificationSubmittedAt: new Date(), verificationSubmissionVersion: 1,
    });
    const { request } = await (0, profileVerificationRequest_service_1.ensureActiveProfileVerificationRequest)(profile);
    const session = await faceVerificationSession_model_1.FaceVerificationSession.create({
        sessionReference: `FACE_SESSION_READ_${suffix}`, userId: user._id, profileId: profile._id, verificationRequestId: request._id,
        profileSubmissionVersion: 1, avatarFingerprint: "a".repeat(64), status: "CAPTURE_COMPLETE", isCurrent: true, challenges: [...challenges],
        requiredCaptureCount: 5, acceptedCaptureCount: 5, startedAt: new Date(), expiresAt: new Date(Date.now() + 60000), captureCompletedAt: new Date(),
    });
    await faceVerificationEvidence_model_1.FaceVerificationEvidence.insertMany(challenges.map((challenge, challengeIndex) => ({
        evidenceReference: `FACE_EVIDENCE_READ_${suffix}_${challengeIndex}`, sessionId: session._id, userId: user._id, profileId: profile._id,
        verificationRequestId: request._id, challengeIndex, challenge, cloudinaryPublicId: `opaque-${suffix}-${challengeIndex}`,
        cloudinaryResourceType: "image", status: "STORED", mimeType, format, bytes: bytes.length, captureReceivedAt: new Date(),
    })));
    return { user, profile, request, session, bytes };
};
const storageReturning = (bytes, contentType = "image/png") => {
    let count = 0;
    return { reader: async () => { count += 1; return { bytes: Buffer.from(bytes), byteLength: bytes.length, contentType }; }, calls: () => count };
};
const rejectsWith = async (operation, code, retryable) => {
    await strict_1.default.rejects(operation, (error) => error instanceof ProfileVerificationInferenceError_1.ProfileVerificationInferenceError
        && error.code === code && (retryable === undefined || error.retryable === retryable));
};
const response = (status, bytes, contentType = "image/png", contentLength) => new Response(new Uint8Array(bytes), {
    status,
    headers: { "content-type": contentType, ...(contentLength ? { "content-length": contentLength } : {}) },
});
(0, node_test_1.before)(async () => { await (0, database_1.connectPhase7HDatabase)(); }, { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
(0, node_test_1.test)("active authority returns exactly five safe descriptors in challenge-index order without mutations", async () => {
    const fixture = await makeFixture("valid");
    const storage = storageReturning(fixture.bytes);
    const before = JSON.stringify({ request: (await profileVerificationRequest_model_1.ProfileVerificationRequest.findById(fixture.request._id))?.toObject(), session: (await faceVerificationSession_model_1.FaceVerificationSession.findById(fixture.session._id))?.toObject(), evidence: await faceVerificationEvidence_model_1.FaceVerificationEvidence.find({ sessionId: fixture.session._id }).lean() });
    const outcome = await (0, faceVerificationEvidenceRead_service_1.readProfileVerificationEvidenceBytes)({ verificationRequestId: String(fixture.request._id), storageReader: storage.reader });
    strict_1.default.deepEqual(outcome.evidence?.map((item) => item.challengeIndex), [0, 1, 2, 3, 4]);
    strict_1.default.equal(storage.calls(), 5);
    strict_1.default.equal(JSON.stringify(outcome.evidence).match(/url|publicid|assetid|credential/i), null);
    strict_1.default.equal(JSON.stringify({ request: (await profileVerificationRequest_model_1.ProfileVerificationRequest.findById(fixture.request._id))?.toObject(), session: (await faceVerificationSession_model_1.FaceVerificationSession.findById(fixture.session._id))?.toObject(), evidence: await faceVerificationEvidence_model_1.FaceVerificationEvidence.find({ sessionId: fixture.session._id }).lean() }), before);
    strict_1.default.equal(await profileVerificationJob_model_1.ProfileVerificationJob.countDocuments({ verificationRequestId: fixture.request._id }), 0);
    strict_1.default.equal(await profileVerificationInferenceResult_model_1.ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: fixture.request._id }), 0);
});
(0, node_test_1.test)("terminal, stale, and invalid exact-five authority paths perform zero storage reads", async () => {
    const terminal = await makeFixture("terminal");
    await profileVerificationRequest_model_1.ProfileVerificationRequest.updateOne({ _id: terminal.request._id }, { $set: { status: "APPROVED", isActive: false, decision: "APPROVE", decidedAt: new Date() } });
    const terminalStorage = storageReturning(png);
    strict_1.default.equal((await (0, faceVerificationEvidenceRead_service_1.readProfileVerificationEvidenceBytes)({ verificationRequestId: String(terminal.request._id), storageReader: terminalStorage.reader })).noOp, "TERMINAL_REQUEST");
    strict_1.default.equal(terminalStorage.calls(), 0);
    const stale = await makeFixture("stale");
    await faceVerificationSession_model_1.FaceVerificationSession.updateOne({ _id: stale.session._id }, { $set: { profileSubmissionVersion: 2 } });
    const staleStorage = storageReturning(png);
    strict_1.default.equal((await (0, faceVerificationEvidenceRead_service_1.readProfileVerificationEvidenceBytes)({ verificationRequestId: String(stale.request._id), storageReader: staleStorage.reader })).noOp, "STALE_SUBMISSION");
    strict_1.default.equal(staleStorage.calls(), 0);
    const invalid = await makeFixture("invalid");
    await faceVerificationEvidence_model_1.FaceVerificationEvidence.deleteOne({ sessionId: invalid.session._id, challengeIndex: 4 });
    const invalidStorage = storageReturning(png);
    await rejectsWith(() => (0, faceVerificationEvidenceRead_service_1.readProfileVerificationEvidenceBytes)({ verificationRequestId: String(invalid.request._id), storageReader: invalidStorage.reader }), "EVIDENCE_INCOMPLETE");
    strict_1.default.equal(invalidStorage.calls(), 0);
});
(0, node_test_1.test)("metadata/content/magic mismatches and unavailable stored assets are bounded and return no partial payload", async () => {
    const mismatch = await makeFixture("mismatch");
    const mismatchStorage = storageReturning(jpeg, "image/jpeg");
    await rejectsWith(() => (0, faceVerificationEvidenceRead_service_1.readProfileVerificationEvidenceBytes)({ verificationRequestId: String(mismatch.request._id), storageReader: mismatchStorage.reader }), "EVIDENCE_INTEGRITY_FAILED");
    strict_1.default.equal(mismatchStorage.calls(), 1);
    const unavailable = await makeFixture("missing");
    let calls = 0;
    const unavailableReader = async () => { calls += 1; throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("signed=https://private.example/sensitive", "EVIDENCE_NOT_AVAILABLE", 409); };
    await rejectsWith(() => (0, faceVerificationEvidenceRead_service_1.readProfileVerificationEvidenceBytes)({ verificationRequestId: String(unavailable.request._id), storageReader: unavailableReader }), "EVIDENCE_NOT_AVAILABLE", false);
    await strict_1.default.rejects(() => (0, faceVerificationEvidenceRead_service_1.readProfileVerificationEvidenceBytes)({ verificationRequestId: String(unavailable.request._id), storageReader: unavailableReader }), (error) => error instanceof Error && !error.message.includes("private.example") && !error.message.includes("signed="));
    strict_1.default.equal(calls, 2);
});
(0, node_test_1.test)("storage boundary classifies timeout, 5xx, 404, content-length, and streamed overflow without leaking its private URL", async () => {
    const privateUrl = "https://private.example/download?signature=secret&public_id=opaque";
    const timeoutReader = (0, faceVerificationEvidenceStorage_service_1.createFaceVerificationEvidenceStorageReader)({ privateDownloadUrlFactory: () => privateUrl, fetchImplementation: async () => { const error = new Error("aborted"); error.name = "AbortError"; throw error; } });
    await rejectsWith(() => timeoutReader({ publicId: "opaque", format: "png", maximumBytes: 10, timeoutMs: 10 }), "EVIDENCE_RETRIEVAL_TIMEOUT", true);
    const fiveHundredReader = (0, faceVerificationEvidenceStorage_service_1.createFaceVerificationEvidenceStorageReader)({ privateDownloadUrlFactory: () => privateUrl, fetchImplementation: async () => response(503, png) });
    await rejectsWith(() => fiveHundredReader({ publicId: "opaque", format: "png", maximumBytes: 10, timeoutMs: 10 }), "EVIDENCE_RETRIEVAL_FAILED", true);
    const missingReader = (0, faceVerificationEvidenceStorage_service_1.createFaceVerificationEvidenceStorageReader)({ privateDownloadUrlFactory: () => privateUrl, fetchImplementation: async () => response(404, png) });
    await rejectsWith(() => missingReader({ publicId: "opaque", format: "png", maximumBytes: 10, timeoutMs: 10 }), "EVIDENCE_NOT_AVAILABLE", false);
    const declaredOversize = (0, faceVerificationEvidenceStorage_service_1.createFaceVerificationEvidenceStorageReader)({ privateDownloadUrlFactory: () => privateUrl, fetchImplementation: async () => response(200, png, "image/png", "11") });
    await rejectsWith(() => declaredOversize({ publicId: "opaque", format: "png", maximumBytes: 10, timeoutMs: 10 }), "EVIDENCE_TOO_LARGE");
    const streamedOversize = (0, faceVerificationEvidenceStorage_service_1.createFaceVerificationEvidenceStorageReader)({ privateDownloadUrlFactory: () => privateUrl, fetchImplementation: async () => response(200, Buffer.alloc(11), "image/png") });
    await rejectsWith(() => streamedOversize({ publicId: "opaque", format: "png", maximumBytes: 10, timeoutMs: 10 }), "EVIDENCE_TOO_LARGE");
});
(0, node_test_1.test)("aggregate limits, supported signatures, and concurrent reads remain bounded and side-effect free", async () => {
    strict_1.default.equal(webp.length, 12);
    const aggregate = await makeFixture("aggregate");
    await faceVerificationEvidence_model_1.FaceVerificationEvidence.updateMany({ sessionId: aggregate.session._id }, { $set: { bytes: faceVerification_constants_1.FACE_VERIFICATION_EVIDENCE_MAX_BYTES + 1 } });
    const aggregateStorage = storageReturning(png);
    await rejectsWith(() => (0, faceVerificationEvidenceRead_service_1.readProfileVerificationEvidenceBytes)({ verificationRequestId: String(aggregate.request._id), storageReader: aggregateStorage.reader }), "EVIDENCE_TOO_LARGE");
    strict_1.default.equal(aggregateStorage.calls(), 0);
    for (const [suffix, bytes, contentType] of [["jpeg", jpeg, "image/jpeg"], ["png", png, "image/png"], ["webp", webp, "image/webp"]]) {
        const fixture = await makeFixture(`format-${suffix}`, bytes);
        const storage = storageReturning(bytes, contentType);
        const result = await (0, faceVerificationEvidenceRead_service_1.readProfileVerificationEvidenceBytes)({ verificationRequestId: String(fixture.request._id), storageReader: storage.reader });
        strict_1.default.equal(result.evidence?.[0].format, suffix === "jpeg" ? "jpeg" : suffix);
    }
    const concurrent = await makeFixture("concurrent");
    const storage = storageReturning(concurrent.bytes);
    const [first, second] = await Promise.all([
        (0, faceVerificationEvidenceRead_service_1.readProfileVerificationEvidenceBytes)({ verificationRequestId: String(concurrent.request._id), storageReader: storage.reader }),
        (0, faceVerificationEvidenceRead_service_1.readProfileVerificationEvidenceBytes)({ verificationRequestId: String(concurrent.request._id), storageReader: storage.reader }),
    ]);
    strict_1.default.equal(first.evidence?.length, 5);
    strict_1.default.equal(second.evidence?.length, 5);
    strict_1.default.equal(storage.calls(), 10);
    strict_1.default.equal(faceVerification_constants_1.FACE_VERIFICATION_EVIDENCE_MAX_AGGREGATE_BYTES, 25 * 1024 * 1024);
});
