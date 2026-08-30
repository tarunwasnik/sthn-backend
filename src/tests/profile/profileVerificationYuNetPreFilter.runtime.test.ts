import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeYuNetOutput, summarizeYuNetPreFilterScores } from "../../services/profile/profileVerificationYuNetRunner";

const outputForScores = (scores: number[]) => {
  const output: Record<string, { data: Float32Array }> = {};
  let offset = 0;
  for (const [stride, count] of [[8, 16], [16, 4], [32, 1]] as const) {
    const cls = new Float32Array(count); const obj = new Float32Array(count);
    for (let index = 0; index < count; index += 1) { cls[index] = scores[offset + index] ?? 0; obj[index] = scores[offset + index] ?? 0; }
    output[`cls_${stride}`] = { data: cls }; output[`obj_${stride}`] = { data: obj };
    const bbox = new Float32Array(count * 4);
    for (let index = 0; index < count; index += 1) { bbox[index * 4 + 2] = Math.log(20 / stride); bbox[index * 4 + 3] = Math.log(20 / stride); }
    output[`bbox_${stride}`] = { data: bbox }; output[`kps_${stride}`] = { data: new Float32Array(count * 10) };
    offset += count;
  }
  return output;
};

test("YuNet bounded pre-filter summary observes shared scores before the frozen 0.65 filter without exposing tensors", () => {
  const output = outputForScores([0.95, 0.70, 0.64, 0.60, 0.55, 0.50, 0.40, 0.30, 0.20, 0.10, 0.80, 0.75, 0.66, 0.62, 0.58, 0.45, 0.35, 0.25, 0.15, 0.05, Number.NaN]);
  const summary = summarizeYuNetPreFilterScores(output, 32, 32);
  assert.equal(summary.finiteScoreCount, 20);
  assert.equal(summary.nonFiniteScoreCount, 1);
  assert.deepEqual(summary.topScores.map((score) => Number(score.toFixed(2))), [0.95, 0.80, 0.75, 0.70, 0.66, 0.64, 0.62, 0.60, 0.58, 0.55]);
  assert.equal(summary.topScores.length, 10);
  assert.equal(summary.thresholdCounts["0.30"], 15);
  assert.equal(summary.thresholdCounts["0.50"], 11);
  assert.equal(summary.thresholdCounts["0.65"], 5);
  assert.equal(summary.thresholdCounts["0.90"], 1);
  assert.deepEqual(Object.keys(summary).sort(), ["finiteScoreCount", "nonFiniteScoreCount", "thresholdCounts", "topScores"]);
  assert.equal(Object.values(summary).some((value) => value instanceof Float32Array), false);
});

test("YuNet production decoding retains 0.65 filtering and normal NMS while the summary retains pre-filter observations", () => {
  const output = outputForScores([0.90, 0.90, 0.64]);
  const faces = decodeYuNetOutput(output, 32, 32, 32, 32);
  const summary = summarizeYuNetPreFilterScores(output, 32, 32);
  assert.equal(faces.length, 1); // The two qualifying zero-offset boxes overlap completely and production NMS remains active.
  assert.equal(summary.thresholdCounts["0.65"], 2);
  assert.equal(summary.thresholdCounts["0.60"], 3);
  assert.equal(summary.topScores.some((score) => Math.abs(score - 0.64) < 0.001), true);
});
