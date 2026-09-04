import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyY4EMedia, evaluateY4EPolicy, summarizeY4EProfile } from "../../evaluation/y4ProfileMediaPolicy.service";

test("Y4E excludes no-face and technical media from the identity denominator", () => {
  const evidence = summarizeY4EProfile([classifyY4EMedia({ status: "NO_FACE", candidateCount: 0 }), classifyY4EMedia({ status: "MEDIA_READ_FAILED", candidateCount: 0 }), classifyY4EMedia({ status: "FACE_CANDIDATES_AVAILABLE", candidateCount: 1, bestScore: .8 })]);
  assert.equal(evidence.matchCount, 1); assert.equal(evidence.mismatchCount, 0); assert.equal(evidence.usableIdentityEvidenceCount, 1); assert.equal(evidence.matchRatio, 1);
});
test("Y4E classifies usable negative and multi-face evidence without treating exclusion as mismatch", () => {
  assert.equal(classifyY4EMedia({ status: "FACE_CANDIDATES_AVAILABLE", candidateCount: 1, bestScore: .2 }).state, "IDENTITY_MISMATCH");
  assert.equal(classifyY4EMedia({ status: "FACE_CANDIDATES_AVAILABLE", candidateCount: 2, bestScore: .7, margin: .05 }).state, "IDENTITY_MATCH");
  assert.equal(classifyY4EMedia({ status: "FACE_CANDIDATES_AVAILABLE", candidateCount: 2, bestScore: .7, margin: .03 }).state, "IDENTITY_AMBIGUOUS");
  assert.equal(classifyY4EMedia({ status: "FACE_CANDIDATES_AVAILABLE", candidateCount: 2, bestScore: .2, margin: .9 }).state, "IDENTITY_MISMATCH");
});
test("Y4E conflicting profiles review while pure repeated negatives can be likely mismatch", () => {
  const conflicting = summarizeY4EProfile([{ state: "IDENTITY_MATCH" }, { state: "IDENTITY_MATCH" }, { state: "IDENTITY_MISMATCH" }]);
  const negative = summarizeY4EProfile([{ state: "IDENTITY_MISMATCH" }, { state: "IDENTITY_MISMATCH" }]);
  const policy = { minimumUsable: 2, minimumMatches: 2, matchRatio: .67, mismatchRatioForLikelyMismatch: 1, requireNoMismatch: true };
  assert.equal(evaluateY4EPolicy(conflicting, policy), "AMBIGUOUS_OR_INSUFFICIENT"); assert.equal(evaluateY4EPolicy(negative, policy), "LIKELY_MISMATCH");
});
