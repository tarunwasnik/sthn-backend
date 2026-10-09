import assert from "node:assert/strict";
import test from "node:test";
import { compareStageADetections, rawOutputRelativeDelta } from "../../evaluation/imageModeration/nudeNet320nStageAComparison";

test("Stage-A comparison accepts only class, confidence, and box matches within preregistered tolerances", () => {
  const expected = [{ class: "FACE_FEMALE", score: 0.8, box: [10, 20, 30, 40] as const }];
  assert.equal(compareStageADetections(expected, [{ class: "FACE_FEMALE", score: 0.81, box: [12, 20, 30, 38] }], { confidenceAbsolute: 0.02, boxPixelsAbsolute: 3 }).passed, true);
  assert.equal(compareStageADetections(expected, [{ class: "FACE_MALE", score: 0.8, box: [10, 20, 30, 40] }], { confidenceAbsolute: 0.02, boxPixelsAbsolute: 3 }).passed, false);
});

test("Stage-A raw statistic comparison is deterministic and scale-relative", () => {
  assert.equal(rawOutputRelativeDelta({ min: 0, max: 100, mean: 10 }, { min: 0, max: 101, mean: 10.1 }), 0.01);
});
