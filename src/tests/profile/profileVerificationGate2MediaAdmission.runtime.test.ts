import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateProfileVerificationGate2MediaAdmission } from "../../services/profile/profileVerificationGate2MediaAdmission.service";
import { ProfileVerificationProfileMediaShadowAnalysis } from "../../services/profile/profileVerificationInference.types";

const media = (role: "AVATAR" | "COVER" | "PROFILE_PHOTO", status: "NO_FACE" | "NO_USABLE_FACE" | "FACE_CANDIDATES_AVAILABLE" | "MEDIA_READ_FAILED", usableFaceCount = 0, profilePhotoIndex?: number) => ({ role, ...(profilePhotoIndex === undefined ? {} : { profilePhotoIndex }), status, detectedFaceCount: status === "NO_FACE" || status === "MEDIA_READ_FAILED" ? 0 : Math.max(1, usableFaceCount), usableFaceCount, candidateCount: usableFaceCount });
const analysis = (entries: ReturnType<typeof media>[], reasonCode?: "MEDIA_SNAPSHOT_UNAVAILABLE" | "INSUFFICIENT_USABLE_LIVE_CAPTURES"): ProfileVerificationProfileMediaShadowAnalysis => ({ status: "COMPLETED", processedAt: new Date(), ...(reasonCode ? { reasonCode } : {}), model: { identifier: "OPENCV_ZOO_SFACE", version: "face_recognition_sface_2021dec" }, summary: { submittedMediaCount: entries.length, processedMediaCount: entries.length, mediaWithNoFaceCount: entries.filter(entry => entry.status === "NO_FACE").length, mediaWithUsableFacesCount: entries.filter(entry => entry.status === "FACE_CANDIDATES_AVAILABLE").length, multiFaceMediaCount: entries.filter(entry => entry.detectedFaceCount > 1).length, failedMediaCount: entries.filter(entry => entry.status === "MEDIA_READ_FAILED").length }, live: { usableCaptureCount: 5, pairwiseComparisonCount: 10 }, media: entries });

test("Gate 2 requires exactly one usable avatar face without deciding its identity", () => {
  const valid = evaluateProfileVerificationGate2MediaAdmission(analysis([media("AVATAR", "FACE_CANDIDATES_AVAILABLE", 1), media("COVER", "NO_FACE")]));
  assert.equal(valid.status, "READY_FOR_GATE3"); assert.equal(valid.avatar?.admission, "VALID_SINGLE_FACE");
  assert.equal(evaluateProfileVerificationGate2MediaAdmission(analysis([media("AVATAR", "NO_FACE")])).avatar?.admission, "AVATAR_INVALID_NO_FACE");
  assert.equal(evaluateProfileVerificationGate2MediaAdmission(analysis([media("AVATAR", "NO_USABLE_FACE")])).avatar?.admission, "AVATAR_INVALID_FACE_UNUSABLE");
  assert.equal(evaluateProfileVerificationGate2MediaAdmission(analysis([media("AVATAR", "FACE_CANDIDATES_AVAILABLE", 2)])).avatar?.admission, "AVATAR_INVALID_MULTIPLE_FACES");
  assert.equal(evaluateProfileVerificationGate2MediaAdmission(analysis([media("AVATAR", "MEDIA_READ_FAILED")])).avatar?.admission, "AVATAR_MEDIA_READ_FAILED");
});

test("optional cover and gallery media admit no-face, foreign-only, and group evidence without Gate-2 rejection", () => {
  const result = evaluateProfileVerificationGate2MediaAdmission(analysis([
    media("AVATAR", "FACE_CANDIDATES_AVAILABLE", 1), media("COVER", "NO_FACE"), media("PROFILE_PHOTO", "FACE_CANDIDATES_AVAILABLE", 1, 0), media("PROFILE_PHOTO", "FACE_CANDIDATES_AVAILABLE", 3, 1), media("PROFILE_PHOTO", "NO_USABLE_FACE", 0, 2), media("PROFILE_PHOTO", "MEDIA_READ_FAILED", 0, 3),
  ]));
  assert.equal(result.status, "READY_FOR_GATE3");
  assert.deepEqual(result.optionalMedia.map(entry => [entry.role, entry.profilePhotoIndex, entry.admission, entry.usableFaceCount]), [["COVER", undefined, "NO_FACE_VALID", 0], ["PROFILE_PHOTO", 0, "USABLE_FACE_EVIDENCE", 1], ["PROFILE_PHOTO", 1, "USABLE_FACE_EVIDENCE", 3], ["PROFILE_PHOTO", 2, "FACE_EVIDENCE_UNUSABLE", 0], ["PROFILE_PHOTO", 3, "MEDIA_READ_FAILED", 0]]);
  assert.equal(JSON.stringify(result).includes("similarity"), false);
});

test("Gate 2 preserves immutable-media and live-evidence unavailable states without a fallback", () => {
  assert.equal(evaluateProfileVerificationGate2MediaAdmission(analysis([], "MEDIA_SNAPSHOT_UNAVAILABLE")).status, "MEDIA_SNAPSHOT_UNAVAILABLE");
  assert.equal(evaluateProfileVerificationGate2MediaAdmission(analysis([], "INSUFFICIENT_USABLE_LIVE_CAPTURES")).status, "LIVE_EVIDENCE_UNAVAILABLE");
});

test("Gate 2 preserves explicit cover then six ordered optional-photo slots", () => {
  const result = evaluateProfileVerificationGate2MediaAdmission(analysis([
    media("AVATAR", "FACE_CANDIDATES_AVAILABLE", 1), media("COVER", "NO_FACE"),
    ...Array.from({ length: 6 }, (_, index) => media("PROFILE_PHOTO", "NO_FACE", 0, index)),
  ]));
  assert.deepEqual(result.optionalMedia.map(entry => [entry.role, entry.profilePhotoIndex]), [["COVER", undefined], ["PROFILE_PHOTO", 0], ["PROFILE_PHOTO", 1], ["PROFILE_PHOTO", 2], ["PROFILE_PHOTO", 3], ["PROFILE_PHOTO", 4], ["PROFILE_PHOTO", 5]]);
});
