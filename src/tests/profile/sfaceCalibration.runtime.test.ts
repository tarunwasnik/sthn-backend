import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateThresholds, parseCalibrationManifest, scoreSummary } from "../../evaluation/sfaceCalibration.service";
import { medianSFaceSimilarity } from "../../services/profile/profileVerificationSFaceShadowAnalysis.service";
import { readFile } from "node:fs/promises";

test("calibration manifest is bounded, labelled, and rejects duplicate opaque sample identifiers", () => {
  const valid = parseCalibrationManifest({ schemaVersion: "STHN_SFACE_CALIBRATION_MANIFEST_V1", samples: [{ sampleId: "sample_a", expectedLabel: "MATCH", reference: "reference.png", captures: ["0.png", "1.png", "2.png", "3.png", "4.png"] }] });
  assert.equal(valid.samples[0].expectedLabel, "MATCH");
  assert.throws(() => parseCalibrationManifest({ schemaVersion: "STHN_SFACE_CALIBRATION_MANIFEST_V1", samples: [valid.samples[0], valid.samples[0]] }));
  assert.throws(() => parseCalibrationManifest({ schemaVersion: "STHN_SFACE_CALIBRATION_MANIFEST_V1", samples: [{ ...valid.samples[0], reference: "https://example.test/image.jpg" }] }));
});
test("calibration threshold metrics preserve Admin fallback semantics and exclude invalid samples", () => {
  const results = [
    { sampleId: "match", expectedLabel: "MATCH" as const, scenario: null, status: "COMPLETED" as const, usableCaptureCount: 5, captureSimilarities: [0.91], medianSimilarity: 0.91 },
    { sampleId: "non-match", expectedLabel: "NON_MATCH" as const, scenario: null, status: "COMPLETED" as const, usableCaptureCount: 5, captureSimilarities: [0.87], medianSimilarity: 0.87 },
    { sampleId: "invalid", expectedLabel: "MATCH" as const, scenario: null, status: "REFERENCE_UNUSABLE" as const, usableCaptureCount: 0, captureSimilarities: [], medianSimilarity: null },
  ];
  const metric = evaluateThresholds(results, [0.9])[0];
  assert.deepEqual(metric, { threshold: 0.9, truePositive: 1, falsePositive: 0, trueNegative: 1, falseNegative: 0, genuineAutoApprovalRate: 1, genuineAdminReviewRate: 0, falseAutomaticApprovalRate: 0, nonMatchSafeFallbackRate: 1 });
  assert.deepEqual(scoreSummary([]), { count: 0, min: null, max: null, mean: null, median: null, standardDeviation: null });
});
test("threshold equality is automatic-approval side and canonical median keeps even-count averaging", async () => {
  assert.equal(medianSFaceSimilarity([0.4, 0.6, 0.9]), 0.6);
  assert.equal(medianSFaceSimilarity([0.4, 0.6, 0.8, 1]), 0.7);
  const equal = evaluateThresholds([{ sampleId: "equal", expectedLabel: "MATCH", scenario: null, status: "COMPLETED" as const, usableCaptureCount: 3, captureSimilarities: [0.9], medianSimilarity: 0.9 }], [0.9])[0];
  assert.equal(equal.truePositive, 1);
  const serialized = JSON.stringify(equal);
  assert.equal(/embedding|landmark|path|buffer|base64/i.test(serialized), false);
  const runner = await readFile(require.resolve("../../evaluation/sfaceCalibrationRunner.service"), "utf8");
  assert.equal(/ProfileVerificationRequest|ProfileVerificationJob|applyProfileVerificationAiDecision|decideProfileVerificationRequest|mongoose/i.test(runner), false);
});
