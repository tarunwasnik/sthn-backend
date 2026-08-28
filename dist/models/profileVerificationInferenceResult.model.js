"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileVerificationInferenceResult = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const profileVerificationInference_enums_1 = require("../enums/profileVerificationInference.enums");
const componentSchema = new mongoose_1.Schema({
    identifier: { type: String, required: true, immutable: true, trim: true, maxlength: 120 },
    version: { type: String, required: true, immutable: true, trim: true, maxlength: 120 },
    artifactSha256: { type: String, required: true, immutable: true, lowercase: true, match: /^[a-f0-9]{64}$/ },
}, { _id: false, strict: "throw" });
const schema = new mongoose_1.Schema({
    inferenceReference: { type: String, required: true, unique: true, immutable: true, index: true, trim: true, maxlength: 96 },
    inferenceRunFingerprint: { type: String, required: true, unique: true, immutable: true, index: true, lowercase: true, match: /^[a-f0-9]{64}$/ },
    verificationRequestId: { type: mongoose_1.Schema.Types.ObjectId, ref: "ProfileVerificationRequest", required: true, immutable: true, index: true },
    profileId: { type: mongoose_1.Schema.Types.ObjectId, ref: "UserProfile", required: true, immutable: true, index: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true },
    profileSubmissionVersion: { type: Number, required: true, immutable: true, min: 1, index: true },
    faceVerificationSessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: "FaceVerificationSession", required: true, immutable: true, index: true },
    evidenceSetFingerprint: { type: String, required: true, immutable: true, lowercase: true, match: /^[a-f0-9]{64}$/ },
    pipelineManifestFingerprint: { type: String, required: true, immutable: true, lowercase: true, match: /^[a-f0-9]{64}$/ },
    pipeline: {
        kind: { type: String, required: true, immutable: true, enum: profileVerificationInference_enums_1.PROFILE_VERIFICATION_INFERENCE_PIPELINE_KINDS },
        pipelineVersion: { type: String, required: true, immutable: true, trim: true, maxlength: 120 },
        runtimeIdentifier: { type: String, required: true, immutable: true, trim: true, maxlength: 120 },
        runtimeVersion: { type: String, required: true, immutable: true, trim: true, maxlength: 120 },
        preprocessingVersion: { type: String, immutable: true, trim: true, maxlength: 120 },
        detector: { type: componentSchema, immutable: true },
        embedding: { type: componentSchema, immutable: true },
    },
    findings: {
        captures: [{
                _id: false,
                challengeIndex: { type: Number, required: true, immutable: true, min: 0, max: 4 },
                challenge: { type: String, required: true, immutable: true, enum: ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "LOOK_DOWN", "BLINK"] },
                faceCount: { type: String, required: true, immutable: true, enum: profileVerificationInference_enums_1.PROFILE_VERIFICATION_FACE_COUNT_FINDINGS },
                usability: { type: String, required: true, immutable: true, enum: profileVerificationInference_enums_1.PROFILE_VERIFICATION_CAPTURE_USABILITY_FINDINGS },
                reasonCodes: { type: [String], required: true, immutable: true, enum: profileVerificationInference_enums_1.PROFILE_VERIFICATION_CAPTURE_REASON_CODES, validate: { validator: (value) => value.length <= 5 && new Set(value).size === value.length, message: "Capture reason codes must be unique and bounded" } },
            }],
        crossCapture: {
            status: { type: String, required: true, immutable: true, enum: profileVerificationInference_enums_1.PROFILE_VERIFICATION_CROSS_CAPTURE_FINDINGS },
            usableCaptureCount: { type: Number, required: true, immutable: true, min: 0, max: 5 },
            outlierCaptureCount: { type: Number, required: true, immutable: true, min: 0, max: 5 },
        },
        avatar: { status: { type: String, required: true, immutable: true, enum: profileVerificationInference_enums_1.PROFILE_VERIFICATION_AVATAR_FINDINGS } },
        antiSpoof: { status: { type: String, required: true, immutable: true, enum: profileVerificationInference_enums_1.PROFILE_VERIFICATION_ANTI_SPOOF_FINDINGS } },
    },
    retentionDeadline: { type: Date, required: true, immutable: true, index: true },
}, { timestamps: true, strict: "throw" });
schema.path("findings.captures").validate((value) => (value.length === 5
    && new Set(value.map((capture) => capture.challengeIndex)).size === 5
    && value.every((capture) => Number.isInteger(capture.challengeIndex) && Number(capture.challengeIndex) >= 0 && Number(capture.challengeIndex) <= 4)), "Exactly five distinct per-capture findings at indexes 0 through 4 are required");
schema.pre(["updateOne", "updateMany", "findOneAndUpdate", "replaceOne"], function rejectInferenceResultMutation() {
    const update = this.getUpdate();
    const set = update?.$set;
    if (set && Object.keys(set).length === 1 && set.retentionDeadline instanceof Date)
        return;
    throw new Error("Profile verification inference results are immutable except for retention deadline shortening");
});
schema.index({ verificationRequestId: 1, profileSubmissionVersion: 1, faceVerificationSessionId: 1, evidenceSetFingerprint: 1, pipelineManifestFingerprint: 1 }, { unique: true, name: "one_profile_verification_inference_result_per_exact_run" });
schema.index({ retentionDeadline: 1, _id: 1 }, { name: "profile_verification_inference_retention_cleanup" });
exports.ProfileVerificationInferenceResult = mongoose_1.default.model("ProfileVerificationInferenceResult", schema);
