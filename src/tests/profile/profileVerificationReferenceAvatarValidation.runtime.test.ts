import assert from "node:assert/strict";
import { test } from "node:test";

import { validateBiometricReferenceDetection } from "../../services/profile/profileVerificationReferenceAvatarValidation.service";
import { YuNetDetection } from "../../services/profile/profileVerificationYuNet.types";

const face = { x: 30, y: 30, width: 40, height: 40, confidence: 0.9, landmarks: { rightEye: { x: 40, y: 42 }, leftEye: { x: 55, y: 42 }, noseTip: { x: 48, y: 50 }, rightMouthCorner: { x: 42, y: 60 }, leftMouthCorner: { x: 54, y: 60 } } };
const detection = (faces: YuNetDetection["faces"]): YuNetDetection => ({ width: 100, height: 100, decodedBytes: 30000, faces });

test("reference validator requires exactly one production-usable face", () => {
  assert.deepEqual(validateBiometricReferenceDetection(detection([])), { valid: false, reason: "NO_FACE" });
  assert.deepEqual(validateBiometricReferenceDetection(detection([face, face])), { valid: false, reason: "MULTIPLE_FACES" });
  assert.deepEqual(validateBiometricReferenceDetection(detection([face])), { valid: true });
});

test("reference validator enforces frozen face area, finite geometry, and five finite landmarks", () => {
  assert.deepEqual(validateBiometricReferenceDetection(detection([{ ...face, width: 10, height: 10 }])), { valid: false, reason: "INVALID_GEOMETRY" });
  assert.deepEqual(validateBiometricReferenceDetection(detection([{ ...face, width: Number.NaN }])), { valid: false, reason: "INVALID_GEOMETRY" });
  assert.deepEqual(validateBiometricReferenceDetection(detection([{ ...face, landmarks: undefined }])), { valid: false, reason: "INVALID_LANDMARKS" });
});
