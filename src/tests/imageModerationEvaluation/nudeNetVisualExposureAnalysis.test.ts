import test from "node:test";
import assert from "node:assert/strict";
import { descriptiveStats, rectangleUnionArea } from "../../evaluation/imageModeration/nudeNetVisualExposureAnalysis";

test("exact rectangle union covers empty, overlap, nesting, identical, edge contact, and clipping", () => {
  assert.equal(rectangleUnionArea([], 10, 10), 0);
  assert.equal(rectangleUnionArea([[1, 1, 2, 3]], 10, 10), 6);
  assert.equal(rectangleUnionArea([[0, 0, 2, 2], [3, 0, 2, 2]], 10, 10), 8);
  assert.equal(rectangleUnionArea([[0, 0, 4, 4], [2, 2, 4, 4]], 10, 10), 28);
  assert.equal(rectangleUnionArea([[0, 0, 6, 6], [1, 1, 2, 2]], 10, 10), 36);
  assert.equal(rectangleUnionArea([[0, 0, 2, 2], [0, 0, 2, 2]], 10, 10), 4);
  assert.equal(rectangleUnionArea([[0, 0, 2, 2], [2, 0, 2, 2]], 10, 10), 8);
  assert.equal(rectangleUnionArea([[-2, -2, 5, 5], [9, 9, 4, 4]], 10, 10), 10);
});
test("descriptive statistics preserve zero-inclusive and non-zero cohorts", () => {
  assert.deepEqual(descriptiveStats([0, 0, 2, 6]), { count: 4, zeroCount: 2, min: 0, p25: 0, median: 0, p75: 2, max: 6, mean: 2 });
  assert.equal(descriptiveStats([]).median, null);
});
