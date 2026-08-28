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
const profileVerificationInferenceResult_model_1 = require("../../models/profileVerificationInferenceResult.model");
const faceVerificationSession_model_1 = require("../../models/faceVerificationSession.model");
const faceVerificationEvidence_model_1 = require("../../models/faceVerificationEvidence.model");
const profileVerificationRequest_service_1 = require("../../services/profile/profileVerificationRequest.service");
const profileVerificationInference_service_1 = require("../../services/profile/profileVerificationInference.service");
const ProfileVerificationInferenceError_1 = require("../../errors/profile/ProfileVerificationInferenceError");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
const testManifest = (pipelineVersion = "TEST_SYNTHETIC_CONTRACT_V1") => ({
    kind: "TEST_SYNTHETIC",
    pipelineVersion,
    runtimeIdentifier: "STHN_TEST_ADAPTER_ONLY",
    runtimeVersion: "1",
});
const testChallenges = ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"];
const findingsFor = () => ({
    captures: [0, 1, 2, 3, 4].map((challengeIndex) => ({
        challengeIndex,
        challenge: testChallenges[challengeIndex],
        faceCount: "NOT_RUN",
        usability: "NOT_RUN",
        reasonCodes: [],
    })),
    crossCapture: { status: "NOT_RUN", usableCaptureCount: 0, outlierCaptureCount: 0 },
    avatar: { status: "NOT_RUN" },
    antiSpoof: { status: "NOT_RUN" },
});
class TestSyntheticAdapter {
    constructor(pipelineVersion, output = findingsFor()) {
        this.output = output;
        this.pipelineManifest = testManifest(pipelineVersion);
    }
    async infer() { return this.output; }
}
const makeCompleteInput = async (suffix) => {
    const user = await User_1.default.create({ email: `inference-${suffix}@test.local`, password: "test-password", status: "active", governanceState: "ACTIVE" });
    const profile = await userProfile_model_1.UserProfile.create({
        userId: user._id, username: `inference-${suffix}`, dateOfBirth: new Date("1990-01-01"), interests: [], bio: "Inference test profile.",
        avatar: "https://example.test/avatar.jpg", cover: "https://example.test/cover.jpg", profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
        profileStatus: "pending_verification", verificationSubmittedAt: new Date(), verificationSubmissionVersion: 1,
    });
    const { request } = await (0, profileVerificationRequest_service_1.ensureActiveProfileVerificationRequest)(profile);
    const challenges = [...testChallenges];
    const session = await faceVerificationSession_model_1.FaceVerificationSession.create({
        sessionReference: `FACE_SESSION_INFERENCE_${suffix}`, userId: user._id, profileId: profile._id, verificationRequestId: request._id,
        profileSubmissionVersion: 1, avatarFingerprint: "a".repeat(64), status: "CAPTURE_COMPLETE", isCurrent: true, challenges,
        requiredCaptureCount: 5, acceptedCaptureCount: 5, startedAt: new Date(), expiresAt: new Date(Date.now() + 60000), captureCompletedAt: new Date(),
    });
    await faceVerificationEvidence_model_1.FaceVerificationEvidence.insertMany(challenges.map((challenge, challengeIndex) => ({
        evidenceReference: `FACE_EVIDENCE_INFERENCE_${suffix}_${challengeIndex}`, sessionId: session._id, userId: user._id, profileId: profile._id,
        verificationRequestId: request._id, challengeIndex, challenge, cloudinaryPublicId: `opaque-${suffix}-${challengeIndex}`,
        cloudinaryResourceType: "image", status: "STORED", mimeType: "image/jpeg", bytes: 1000, format: "jpg", captureReceivedAt: new Date(),
    })));
    return { user, profile, request, session };
};
const rejectsWith = async (operation, code) => {
    await strict_1.default.rejects(operation, (error) => error instanceof ProfileVerificationInferenceError_1.ProfileVerificationInferenceError && error.code === code);
};
(0, node_test_1.before)(async () => {
    await (0, database_1.connectPhase7HDatabase)();
    await profileVerificationInferenceResult_model_1.ProfileVerificationInferenceResult.init();
}, { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
(0, node_test_1.test)("a bound completed session with exactly five stored captures persists a bounded immutable result", async () => {
    const { request } = await makeCompleteInput("valid");
    const outcome = await (0, profileVerificationInference_service_1.finalizeProfileVerificationInference)({ verificationRequestId: String(request._id), adapter: new TestSyntheticAdapter() });
    strict_1.default.ok(outcome.result);
    strict_1.default.equal(outcome.replayed, false);
    strict_1.default.equal(outcome.result.findings.captures.length, 5);
    strict_1.default.equal(outcome.result.findings.antiSpoof.status, "NOT_RUN");
    strict_1.default.match(outcome.result.evidenceSetFingerprint, /^[a-f0-9]{64}$/);
    strict_1.default.equal(JSON.stringify(outcome.result.toObject()).match(/cloudinary|base64|embedding|landmark|https?:\/\//i), null);
    outcome.result.findings.avatar.status = "MATCH_UNCERTAIN";
    await strict_1.default.rejects(() => outcome.result.save());
    await strict_1.default.rejects(() => profileVerificationInferenceResult_model_1.ProfileVerificationInferenceResult.updateOne({ _id: outcome.result._id }, { $set: { "findings.avatar.status": "MATCH_UNCERTAIN" } }));
    const persisted = await profileVerificationInferenceResult_model_1.ProfileVerificationInferenceResult.findById(outcome.result._id);
    strict_1.default.equal(persisted?.findings.avatar.status, "NOT_RUN");
});
(0, node_test_1.test)("incomplete, unbound, or inconsistent evidence cannot finalize an inference result", async () => {
    const partial = await makeCompleteInput("partial");
    await faceVerificationEvidence_model_1.FaceVerificationEvidence.deleteOne({ sessionId: partial.session._id, challengeIndex: 4 });
    await rejectsWith(() => (0, profileVerificationInference_service_1.finalizeProfileVerificationInference)({ verificationRequestId: String(partial.request._id), adapter: new TestSyntheticAdapter() }), "EVIDENCE_INCOMPLETE");
    const unbound = await makeCompleteInput("unbound");
    await faceVerificationSession_model_1.FaceVerificationSession.updateOne({ _id: unbound.session._id }, { $unset: { verificationRequestId: 1 } });
    await rejectsWith(() => (0, profileVerificationInference_service_1.finalizeProfileVerificationInference)({ verificationRequestId: String(unbound.request._id), adapter: new TestSyntheticAdapter() }), "SESSION_NOT_COMPLETE");
    const wrongOwner = await makeCompleteInput("wrong-owner");
    await faceVerificationEvidence_model_1.FaceVerificationEvidence.updateOne({ sessionId: wrongOwner.session._id, challengeIndex: 0 }, { $set: { profileId: wrongOwner.user._id } });
    await rejectsWith(() => (0, profileVerificationInference_service_1.finalizeProfileVerificationInference)({ verificationRequestId: String(wrongOwner.request._id), adapter: new TestSyntheticAdapter() }), "EVIDENCE_INCOMPLETE");
});
(0, node_test_1.test)("identical inference runs replay safely, concurrent callers preserve one result, and changed pipeline identity creates a new result", async () => {
    const { request } = await makeCompleteInput("replay");
    const adapter = new TestSyntheticAdapter();
    const [first, second] = await Promise.all([
        (0, profileVerificationInference_service_1.finalizeProfileVerificationInference)({ verificationRequestId: String(request._id), adapter }),
        (0, profileVerificationInference_service_1.finalizeProfileVerificationInference)({ verificationRequestId: String(request._id), adapter }),
    ]);
    strict_1.default.ok(first.result && second.result);
    strict_1.default.equal(String(first.result._id), String(second.result._id));
    strict_1.default.equal(await profileVerificationInferenceResult_model_1.ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: request._id }), 1);
    const newerPipeline = await (0, profileVerificationInference_service_1.finalizeProfileVerificationInference)({ verificationRequestId: String(request._id), adapter: new TestSyntheticAdapter("TEST_SYNTHETIC_CONTRACT_V2") });
    strict_1.default.ok(newerPipeline.result);
    strict_1.default.notEqual(String(newerPipeline.result._id), String(first.result._id));
    strict_1.default.equal(await profileVerificationInferenceResult_model_1.ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: request._id }), 2);
});
(0, node_test_1.test)("invalid manifests and arbitrary/invalid findings are rejected before persistence", async () => {
    const { request } = await makeCompleteInput("validation");
    const invalidManifest = new TestSyntheticAdapter();
    invalidManifest.pipelineManifest.pipelineVersion = "";
    await rejectsWith(() => (0, profileVerificationInference_service_1.finalizeProfileVerificationInference)({ verificationRequestId: String(request._id), adapter: invalidManifest }), "PIPELINE_IDENTITY_INVALID");
    const invalidFindings = findingsFor();
    invalidFindings.captures = invalidFindings.captures.slice(0, 4);
    invalidFindings.arbitraryBlob = { bytes: "not-persisted" };
    await rejectsWith(() => (0, profileVerificationInference_service_1.finalizeProfileVerificationInference)({ verificationRequestId: String(request._id), adapter: new TestSyntheticAdapter(undefined, invalidFindings) }), "FINDINGS_INVALID");
    strict_1.default.equal(await profileVerificationInferenceResult_model_1.ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: request._id }), 0);
});
(0, node_test_1.test)("terminal requests are bounded no-ops and technical adapter failures produce no result", async () => {
    const terminal = await makeCompleteInput("terminal");
    await profileVerificationRequest_model_1.ProfileVerificationRequest.updateOne({ _id: terminal.request._id }, { $set: { status: "APPROVED", isActive: false, decision: "APPROVE", decidedAt: new Date() } });
    const noOp = await (0, profileVerificationInference_service_1.finalizeProfileVerificationInference)({ verificationRequestId: String(terminal.request._id), adapter: new TestSyntheticAdapter() });
    strict_1.default.equal(noOp.noOp, "TERMINAL_REQUEST");
    strict_1.default.equal(noOp.result, null);
    strict_1.default.equal(await profileVerificationInferenceResult_model_1.ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: terminal.request._id }), 0);
    const technical = await makeCompleteInput("technical");
    const unavailable = {
        pipelineManifest: testManifest(),
        async infer() { throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Synthetic adapter outage", "TECHNICAL_FAILURE", 503); },
    };
    await rejectsWith(() => (0, profileVerificationInference_service_1.finalizeProfileVerificationInference)({ verificationRequestId: String(technical.request._id), adapter: unavailable }), "TECHNICAL_FAILURE");
    strict_1.default.equal(await profileVerificationInferenceResult_model_1.ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: technical.request._id }), 0);
});
