import assert from "node:assert/strict";
import { test } from "node:test";

import { FaceVerificationChallenge } from "../../models/faceVerificationSession.model";
import { classifyYuNetDetections } from "../../services/profile/profileVerificationYuNetAdapter";
import { YUNET_ARTIFACT, YUNET_CAPTURE_USABILITY_SCORE_THRESHOLD, YUNET_DETECTOR_SCORE_THRESHOLD, YUNET_LIMITS } from "../../services/profile/profileVerificationYuNet.constants";

const challenges: FaceVerificationChallenge[] = ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"];
const captureSet = (faces: Array<{ x: number; y: number; width: number; height: number; confidence: number }>) => challenges.map((challenge, challengeIndex) => ({
  challengeIndex, challenge, detection: { width: 640, height: 480, decodedBytes: 640 * 480 * 3, faces },
}));

test("YuNet dynamic artifact identity and bounded detector-only findings remain explicit", () => {
  assert.equal(YUNET_ARTIFACT.filename, "face_detection_yunet_2026may.onnx");
  assert.match(YUNET_ARTIFACT.sha256, /^[a-f0-9]{64}$/);
  assert.equal(YUNET_LIMITS.maxWidth, 2048);
  assert.equal(YUNET_DETECTOR_SCORE_THRESHOLD, 0.65);
  assert.equal(YUNET_CAPTURE_USABILITY_SCORE_THRESHOLD, 0.85);
  const findings = classifyYuNetDetections(captureSet([{ x: 260, y: 150, width: 120, height: 120, confidence: 0.99 }]));
  assert.equal(findings.captures.length, 5);
  assert.deepEqual(findings.captures.map((finding) => finding.usability), ["USABLE", "USABLE", "USABLE", "USABLE", "USABLE"]);
  assert.deepEqual(findings.crossCapture, { status: "NOT_RUN", usableCaptureCount: 5, outlierCaptureCount: 0 });
  assert.deepEqual(findings.avatar, { status: "NOT_RUN" });
  assert.deepEqual(findings.antiSpoof, { status: "NOT_RUN" });
});

test("YuNet uses an explicit capture-usability boundary independent of detector threshold", () => {
  assert.equal(classifyYuNetDetections(captureSet([{ x: 260, y: 150, width: 120, height: 120, confidence: 0.8499 }])).captures[0].usability, "UNCERTAIN");
  assert.equal(classifyYuNetDetections(captureSet([{ x: 260, y: 150, width: 120, height: 120, confidence: 0.85 }])).captures[0].usability, "USABLE");
});

test("YuNet maps zero, multiple, small, large, and badly aligned detections to bounded non-decision findings", () => {
  assert.equal(classifyYuNetDetections(captureSet([])).captures[0].faceCount, "ZERO");
  assert.equal(classifyYuNetDetections(captureSet([{ x: 200, y: 100, width: 120, height: 120, confidence: 0.99 }, { x: 320, y: 100, width: 120, height: 120, confidence: 0.99 }])).captures[0].faceCount, "MULTIPLE");
  assert.deepEqual(classifyYuNetDetections(captureSet([{ x: 300, y: 220, width: 10, height: 10, confidence: 0.99 }])).captures[0].reasonCodes, ["FACE_TOO_SMALL"]);
  assert.deepEqual(classifyYuNetDetections(captureSet([{ x: 10, y: 10, width: 630, height: 470, confidence: 0.99 }])).captures[0].reasonCodes, ["FACE_TOO_LARGE"]);
  assert.deepEqual(classifyYuNetDetections(captureSet([{ x: 0, y: 150, width: 120, height: 120, confidence: 0.99 }])).captures[0].reasonCodes, ["POOR_ALIGNMENT"]);
});

test("YuNet refuses any non-five capture set before it can create findings", () => {
  assert.throws(() => classifyYuNetDetections(captureSet([]).slice(0, 4)));
});
