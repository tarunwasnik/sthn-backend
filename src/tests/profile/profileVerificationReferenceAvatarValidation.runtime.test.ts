import assert from "node:assert/strict";
import { test } from "node:test";

import { errorHandler } from "../../middlewares/errorHandler";
import { AppError } from "../../utils/AppError";
import { referenceAvatarPreflightReasonCode, validateBiometricReferenceDetection } from "../../services/profile/profileVerificationReferenceAvatarValidation.service";
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

test("reference preflight reason codes are bounded and preserve multiple-face distinction", () => {
  assert.equal(referenceAvatarPreflightReasonCode("NO_FACE"), "REFERENCE_AVATAR_NO_FACE");
  assert.equal(referenceAvatarPreflightReasonCode("INVALID_GEOMETRY"), "REFERENCE_AVATAR_INVALID_GEOMETRY");
  assert.equal(referenceAvatarPreflightReasonCode("INVALID_LANDMARKS"), "REFERENCE_AVATAR_INVALID_LANDMARKS");
  assert.equal(referenceAvatarPreflightReasonCode("MULTIPLE_FACES"), "REFERENCE_AVATAR_MULTIPLE_FACES");
});

const errorResponse = (error: Error) => {
  let statusCode = 0;
  let body: unknown;
  const response = {
    status: (value: number) => { statusCode = value; return response; },
    json: (value: unknown) => { body = value; return response; },
  };
  errorHandler(error, {} as never, response as never, (() => undefined) as never);
  return { statusCode, body };
};

test("ordinary and unknown errors preserve their existing response shapes and status behavior", () => {
  assert.deepEqual(errorResponse(new AppError("Ordinary validation failure", 418)), {
    statusCode: 418,
    body: { success: false, message: "Ordinary validation failure" },
  });
  assert.deepEqual(errorResponse(new Error("Unknown failure")), {
    statusCode: 500,
    body: { success: false, message: "Unknown failure" },
  });
});

test("the existing error response exposes only the bounded preflight code", () => {
  const { statusCode, body } = errorResponse(new AppError("This profile photo cannot be used for face verification.", 409, "REFERENCE_AVATAR_NO_FACE"));
  assert.equal(statusCode, 409);
  assert.deepEqual(body, { success: false, message: "This profile photo cannot be used for face verification.", code: "REFERENCE_AVATAR_NO_FACE" });
});
