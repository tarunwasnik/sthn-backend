import assert from "node:assert/strict";
import { test } from "node:test";
import { ProfileVerificationProfileMediaShadowAnalysis } from "../../services/profile/profileVerificationInference.types";
import { evaluateProfileVerificationGate3IdentityPolicy } from "../../services/profile/profileVerificationGate3IdentityPolicy.service";

const candidate = (medianSimilarity: number) => ({ candidateIndex: 0, comparisonCount: 5, minimumSimilarity: medianSimilarity, maximumSimilarity: medianSimilarity, meanSimilarity: medianSimilarity, medianSimilarity });
const item = (role: "AVATAR" | "COVER" | "PROFILE_PHOTO", status: "NO_FACE" | "NO_USABLE_FACE" | "FACE_CANDIDATES_AVAILABLE" | "MEDIA_READ_FAILED", score?: number, count = score === undefined ? 0 : 1, profilePhotoIndex?: number) => ({ role, ...(profilePhotoIndex === undefined ? {} : { profilePhotoIndex }), status, detectedFaceCount: count, usableFaceCount: count, candidateCount: count, ...(score === undefined ? {} : { bestCandidate: candidate(score), ...(count > 1 ? { secondBestMedianSimilarity: score - .05, bestVsSecondMargin: .05 } : {}) }) });
const analysis = (entries: ReturnType<typeof item>[]): ProfileVerificationProfileMediaShadowAnalysis => ({ status: "COMPLETED", processedAt: new Date(), model: { identifier: "OPENCV_ZOO_SFACE", version: "face_recognition_sface_2021dec" }, summary: { submittedMediaCount: entries.length, processedMediaCount: entries.length, mediaWithNoFaceCount: entries.filter(entry => entry.status === "NO_FACE").length, mediaWithUsableFacesCount: entries.filter(entry => entry.status === "FACE_CANDIDATES_AVAILABLE").length, multiFaceMediaCount: entries.filter(entry => entry.candidateCount > 1).length, failedMediaCount: entries.filter(entry => entry.status === "MEDIA_READ_FAILED").length }, live: { usableCaptureCount: 5, pairwiseComparisonCount: 10 }, media: entries });
const evaluate = (entries: ReturnType<typeof item>[], gate1Accepted = true) => evaluateProfileVerificationGate3IdentityPolicy({ gate1Accepted, analysis: analysis(entries) });
const avatar = (score: number) => item("AVATAR", "FACE_CANDIDATES_AVAILABLE", score);
const sixNoFace = () => Array.from({ length: 6 }, (_, index) => item("PROFILE_PHOTO", "NO_FACE", undefined, 0, index));

test("avatar membership honors the frozen .36 boundary and optional no-face/foreign evidence is neutral", () => {
  const match = evaluate([avatar(.36), item("COVER", "NO_FACE"), ...sixNoFace()]);
  assert.equal(match.conclusion, "LIKELY_MATCH"); assert.equal(match.optionalClearPersonACandidateCount, 0);
  const foreign = evaluate([avatar(.5), item("COVER", "FACE_CANDIDATES_AVAILABLE", .1), ...Array.from({ length: 6 }, (_, index) => item("PROFILE_PHOTO", "FACE_CANDIDATES_AVAILABLE", .2, 1, index))]);
  assert.equal(foreign.conclusion, "LIKELY_MATCH"); assert.equal(foreign.optionalClearPersonACandidateCount, 0);
});

test("optional clear Person-A evidence supports but never rescues an avatar non-match", () => {
  const supported = evaluate([avatar(.5), item("COVER", "FACE_CANDIDATES_AVAILABLE", .6), ...sixNoFace()]);
  assert.equal(supported.conclusion, "LIKELY_MATCH"); assert.equal(supported.optionalMediaWithPersonA, 1);
  const contradiction = evaluate([avatar(.35), item("COVER", "FACE_CANDIDATES_AVAILABLE", .6), ...sixNoFace()]);
  assert.equal(contradiction.conclusion, "UNABLE_TO_DETERMINE"); assert.equal(contradiction.reasonCode, "CONTRADICTORY_IDENTITY_EVIDENCE");
  assert.equal(evaluate([avatar(.35), item("COVER", "FACE_CANDIDATES_AVAILABLE", .1), ...sixNoFace()]).conclusion, "LIKELY_MISMATCH");
});

test("optional group ambiguity and local optional technical failures do not block an avatar match", () => {
  const group = item("PROFILE_PHOTO", "FACE_CANDIDATES_AVAILABLE", .6, 2, 0); group.secondBestMedianSimilarity = .57; group.bestVsSecondMargin = .03;
  const result = evaluate([avatar(.5), item("COVER", "MEDIA_READ_FAILED"), group, ...Array.from({ length: 5 }, (_, index) => item("PROFILE_PHOTO", "NO_FACE", undefined, 0, index + 1))]);
  assert.equal(result.conclusion, "LIKELY_MATCH"); assert.equal(result.optionalAmbiguousMediaCount, 1); assert.equal(result.optionalTechnicalFailureCount, 1);
  assert.equal(evaluate([avatar(.35), group, ...sixNoFace()]).conclusion, "LIKELY_MISMATCH");
  const clearGroup = item("PROFILE_PHOTO", "FACE_CANDIDATES_AVAILABLE", .6, 2, 0); clearGroup.secondBestMedianSimilarity = .56; clearGroup.bestVsSecondMargin = .04;
  assert.equal(evaluate([avatar(.35), clearGroup, ...sixNoFace()]).conclusion, "UNABLE_TO_DETERMINE");
});

test("mandatory avatar failure and Gate-1 absence remain technical/undetermined, never a false mismatch", () => {
  assert.equal(evaluate([item("AVATAR", "MEDIA_READ_FAILED"), ...sixNoFace()]).conclusion, "UNABLE_TO_DETERMINE");
  const absent = evaluate([avatar(.5), ...sixNoFace()], false); assert.equal(absent.conclusion, "UNABLE_TO_DETERMINE"); assert.equal(absent.reasonCode, "LIVE_ANCHOR_NOT_ACCEPTED");
});

test("Gate-3 result is bounded and does not serialize media references or biometric payloads", () => {
  const result = evaluate([avatar(.5), ...sixNoFace()]); const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("embedding"), false); assert.equal(serialized.includes("landmark"), false); assert.equal(serialized.includes("sourceReference"), false);
});
