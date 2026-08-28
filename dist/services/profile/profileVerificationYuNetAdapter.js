"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createYuNetProfileVerificationAdapter = exports.classifyYuNetDetections = void 0;
const ProfileVerificationInferenceError_1 = require("../../errors/profile/ProfileVerificationInferenceError");
const faceVerificationEvidenceRead_service_1 = require("./faceVerificationEvidenceRead.service");
const profileVerificationInferenceAdapter_1 = require("./profileVerificationInferenceAdapter");
const profileVerificationYuNet_constants_1 = require("./profileVerificationYuNet.constants");
const profileVerificationYuNetRunner_1 = require("./profileVerificationYuNetRunner");
const MIN_FACE_AREA_RATIO = 0.03;
const MAX_FACE_AREA_RATIO = 0.65;
const MAX_CENTER_OFFSET_RATIO = 0.35;
const LOW_CONFIDENCE_MARGIN = 0.02;
const classifyDetection = (input) => {
    const { faces, width, height } = input.detection;
    if (faces.length === 0)
        return { ...input, faceCount: "ZERO", usability: "UNUSABLE", reasonCodes: ["DETECTION_UNCERTAIN"] };
    if (faces.length > 1)
        return { ...input, faceCount: "MULTIPLE", usability: "UNUSABLE", reasonCodes: ["POOR_ALIGNMENT"] };
    const face = faces[0];
    const areaRatio = (face.width * face.height) / (width * height);
    const centerOffset = Math.hypot(face.x + face.width / 2 - width / 2, face.y + face.height / 2 - height / 2) / Math.hypot(width / 2, height / 2);
    if (areaRatio < MIN_FACE_AREA_RATIO)
        return { ...input, faceCount: "ONE", usability: "UNUSABLE", reasonCodes: ["FACE_TOO_SMALL"] };
    if (areaRatio > MAX_FACE_AREA_RATIO)
        return { ...input, faceCount: "ONE", usability: "UNUSABLE", reasonCodes: ["FACE_TOO_LARGE"] };
    if (centerOffset > MAX_CENTER_OFFSET_RATIO || face.x <= 0 || face.y <= 0 || face.x + face.width >= width || face.y + face.height >= height)
        return { ...input, faceCount: "ONE", usability: "UNUSABLE", reasonCodes: ["POOR_ALIGNMENT"] };
    if (face.confidence < profileVerificationYuNet_constants_1.YUNET_LIMITS.scoreThreshold + LOW_CONFIDENCE_MARGIN)
        return { ...input, faceCount: "ONE", usability: "UNCERTAIN", reasonCodes: ["DETECTION_UNCERTAIN"] };
    return { ...input, faceCount: "ONE", usability: "USABLE", reasonCodes: [] };
};
/** Pure, bounded detector-only mapping. It deliberately makes no identity, cross-capture, avatar, or liveness claim. */
const classifyYuNetDetections = (captures) => {
    if (captures.length !== 5)
        throw (0, profileVerificationInferenceAdapter_1.technicalInferenceFailure)("YuNet requires exactly five authoritative captures");
    const findings = captures.map(classifyDetection).sort((left, right) => left.challengeIndex - right.challengeIndex);
    if (findings.some((finding, index) => finding.challengeIndex !== index))
        throw (0, profileVerificationInferenceAdapter_1.technicalInferenceFailure)("YuNet capture ordering is invalid");
    return {
        captures: findings.map(({ challengeIndex, challenge, faceCount, usability, reasonCodes }) => ({ challengeIndex, challenge, faceCount, usability, reasonCodes })),
        crossCapture: { status: "NOT_RUN", usableCaptureCount: findings.filter((finding) => finding.usability === "USABLE").length, outlierCaptureCount: 0 },
        avatar: { status: "NOT_RUN" }, antiSpoof: { status: "NOT_RUN" },
    };
};
exports.classifyYuNetDetections = classifyYuNetDetections;
/**
 * Explicit adapter only: no worker, route, or job registration invokes it in Stage 3F3.
 * It reads protected bytes sequentially and retains only the bounded 3F1 findings.
 */
const createYuNetProfileVerificationAdapter = (dependencies = {}) => {
    const evidenceReader = dependencies.evidenceReader ?? faceVerificationEvidenceRead_service_1.readProfileVerificationEvidenceBytes;
    const detector = dependencies.detector ?? profileVerificationYuNetRunner_1.detectYuNetFaces;
    return {
        pipelineManifest: {
            kind: "MODEL_RUNTIME_DETECTOR_ONLY", pipelineVersion: "STHN_YUNET_DETECTOR_V1", runtimeIdentifier: "onnxruntime-node", runtimeVersion: "1.27.0",
            preprocessingVersion: profileVerificationYuNet_constants_1.YUNET_PREPROCESSING_VERSION,
            detector: { identifier: profileVerificationYuNet_constants_1.YUNET_ARTIFACT.identifier, version: profileVerificationYuNet_constants_1.YUNET_ARTIFACT.version, artifactSha256: profileVerificationYuNet_constants_1.YUNET_ARTIFACT.sha256 },
        },
        async infer(input) {
            const source = await evidenceReader({ verificationRequestId: input.verificationRequestId });
            if (source.noOp)
                throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Verification submission is no longer actionable", source.noOp, 409);
            if (!source.evidence || source.evidence.length !== 5)
                throw (0, profileVerificationInferenceAdapter_1.technicalInferenceFailure)("YuNet evidence is unavailable");
            const detected = [];
            for (const evidence of source.evidence) {
                const expected = input.captures[evidence.challengeIndex];
                if (!expected || expected.challenge !== evidence.challenge)
                    throw (0, profileVerificationInferenceAdapter_1.technicalInferenceFailure)("YuNet evidence binding is inconsistent");
                detected.push({ challengeIndex: evidence.challengeIndex, challenge: evidence.challenge, detection: await detector(evidence.bytes) });
            }
            return (0, exports.classifyYuNetDetections)(detected);
        },
    };
};
exports.createYuNetProfileVerificationAdapter = createYuNetProfileVerificationAdapter;
