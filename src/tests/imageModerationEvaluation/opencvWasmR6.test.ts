import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  assertR6RgbSquare,
  compareR6Bytes,
  G8C_R6_CANDIDATE_IDS,
  G8C_R6_OPENCV_SHA256,
  G8C_R6_OUTPUT_BYTES,
  G8C_R6_PACKAGE,
  G8C_R6_PACKAGE_VERSION,
} from "../../evaluation/imageModeration/opencvWasmR6Contract";

test("R6 fixes the authorized control set and frozen OpenCV.js identity", () => {
  assert.deepEqual(G8C_R6_CANDIDATE_IDS, ["candidate-06e0fcca6c4fdfc9", "candidate-01ef942c2c69fa88", "candidate-03e83650ace99466", "candidate-05453abafb9dc346"]);
  assert.equal(G8C_R6_PACKAGE, "@techstark/opencv-js");
  assert.equal(G8C_R6_PACKAGE_VERSION, "5.0.0-release.1");
  assert.equal(G8C_R6_OPENCV_SHA256, "b873c8211421da7b9bf41ae157a923f05a46a0b8d3e5904c44c6f3ad6d39a1bd");
});

test("R6 accepts only square RGB input and reports exact 320x320x3 comparison metrics", () => {
  assert.doesNotThrow(() => assertR6RgbSquare(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), 2, 2, 3));
  assert.throws(() => assertR6RgbSquare(Uint8Array.from([1, 2, 3]), 1, 3, 3));
  const canonical = new Uint8Array(G8C_R6_OUTPUT_BYTES);
  const exact = compareR6Bytes(canonical, Uint8Array.from(canonical));
  assert.deepEqual({ exact: exact.exactEquality, differing: exact.differingBytes, mae: exact.meanAbsoluteDifference, max: exact.maxAbsoluteDifference }, { exact: true, differing: 0, mae: 0, max: 0 });
  const changed = Uint8Array.from(canonical); changed[0] = 7;
  const mismatch = compareR6Bytes(canonical, changed);
  assert.deepEqual({ exact: mismatch.exactEquality, differing: mismatch.differingBytes, max: mismatch.maxAbsoluteDifference }, { exact: false, differing: 1, max: 7 });
  assert.throws(() => compareR6Bytes(new Uint8Array(1), new Uint8Array(1)));
});

test("R6 recorded only the preregistered controls, exact parity, and no persisted image payload", async () => {
  const root = process.cwd();
  const output = path.join(root, "evaluation-output", "image-moderation", "i4-g8c-r6-opencv-wasm-real-resize-parity");
  const [preregistrationBytes, resultBytes] = await Promise.all([
    readFile(path.join(output, "g8c-r6-preregistration.json")),
    readFile(path.join(output, "g8c-r6-real-resize-parity.json")),
  ]);
  const preregistration = JSON.parse(preregistrationBytes.toString("utf8"));
  const result = JSON.parse(resultBytes.toString("utf8"));
  assert.deepEqual(preregistration.candidateIds, G8C_R6_CANDIDATE_IDS);
  assert.equal(result.preregistrationFingerprint, preregistration.preregistrationFingerprint);
  assert.equal(result.status, "OPENCV_WASM_REAL_RESIZE_PARITY_CONFIRMED");
  assert.equal(result.rows.length, 4);
  for (const row of result.rows) {
    assert.equal(row.exactEquality, true);
    assert.equal(row.differingBytes, 0);
    assert.equal(row.meanAbsoluteDifference, 0);
    assert.equal(row.maxAbsoluteDifference, 0);
    assert.equal(row.output.byteLength, G8C_R6_OUTPUT_BYTES);
  }
  assert.equal(result.prohibitions.modelInference, false);
  assert.equal(result.prohibitions.full558, false);
  assert.equal(result.prohibitions.productionWiring, false);
  assert.equal(resultBytes.toString("utf8").includes("base64"), false);
});
