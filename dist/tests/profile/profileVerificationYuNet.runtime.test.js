"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const profileVerificationYuNetAdapter_1 = require("../../services/profile/profileVerificationYuNetAdapter");
const profileVerificationYuNet_constants_1 = require("../../services/profile/profileVerificationYuNet.constants");
const challenges = ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"];
const captureSet = (faces) => challenges.map((challenge, challengeIndex) => ({
    challengeIndex, challenge, detection: { width: 640, height: 480, decodedBytes: 640 * 480 * 3, faces },
}));
(0, node_test_1.test)("YuNet dynamic artifact identity and bounded detector-only findings remain explicit", () => {
    strict_1.default.equal(profileVerificationYuNet_constants_1.YUNET_ARTIFACT.filename, "face_detection_yunet_2026may.onnx");
    strict_1.default.match(profileVerificationYuNet_constants_1.YUNET_ARTIFACT.sha256, /^[a-f0-9]{64}$/);
    strict_1.default.equal(profileVerificationYuNet_constants_1.YUNET_LIMITS.maxWidth, 2048);
    const findings = (0, profileVerificationYuNetAdapter_1.classifyYuNetDetections)(captureSet([{ x: 260, y: 150, width: 120, height: 120, confidence: 0.99 }]));
    strict_1.default.equal(findings.captures.length, 5);
    strict_1.default.deepEqual(findings.captures.map((finding) => finding.usability), ["USABLE", "USABLE", "USABLE", "USABLE", "USABLE"]);
    strict_1.default.deepEqual(findings.crossCapture, { status: "NOT_RUN", usableCaptureCount: 5, outlierCaptureCount: 0 });
    strict_1.default.deepEqual(findings.avatar, { status: "NOT_RUN" });
    strict_1.default.deepEqual(findings.antiSpoof, { status: "NOT_RUN" });
});
(0, node_test_1.test)("YuNet maps zero, multiple, small, large, and badly aligned detections to bounded non-decision findings", () => {
    strict_1.default.equal((0, profileVerificationYuNetAdapter_1.classifyYuNetDetections)(captureSet([])).captures[0].faceCount, "ZERO");
    strict_1.default.equal((0, profileVerificationYuNetAdapter_1.classifyYuNetDetections)(captureSet([{ x: 200, y: 100, width: 120, height: 120, confidence: 0.99 }, { x: 320, y: 100, width: 120, height: 120, confidence: 0.99 }])).captures[0].faceCount, "MULTIPLE");
    strict_1.default.deepEqual((0, profileVerificationYuNetAdapter_1.classifyYuNetDetections)(captureSet([{ x: 300, y: 220, width: 10, height: 10, confidence: 0.99 }])).captures[0].reasonCodes, ["FACE_TOO_SMALL"]);
    strict_1.default.deepEqual((0, profileVerificationYuNetAdapter_1.classifyYuNetDetections)(captureSet([{ x: 10, y: 10, width: 630, height: 470, confidence: 0.99 }])).captures[0].reasonCodes, ["FACE_TOO_LARGE"]);
    strict_1.default.deepEqual((0, profileVerificationYuNetAdapter_1.classifyYuNetDetections)(captureSet([{ x: 0, y: 150, width: 120, height: 120, confidence: 0.99 }])).captures[0].reasonCodes, ["POOR_ALIGNMENT"]);
});
(0, node_test_1.test)("YuNet refuses any non-five capture set before it can create findings", () => {
    strict_1.default.throws(() => (0, profileVerificationYuNetAdapter_1.classifyYuNetDetections)(captureSet([]).slice(0, 4)));
});
