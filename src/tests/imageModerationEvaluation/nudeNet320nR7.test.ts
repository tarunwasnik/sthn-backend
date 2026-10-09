import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { compareStageADetections } from "../../evaluation/imageModeration/nudeNet320nStageAComparison";
import { NUDENET_320N } from "../../evaluation/imageModeration/specialistRuntimeFeasibility";

const root = process.cwd(); const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");
test("R7 binds frozen R5/R6, model, Python authority, and exactly the G8-B sixteen", async () => {
  const [g8b, python, r5, r6, model] = await Promise.all([
    readFile(path.join(root, "evaluation-output/image-moderation/i4-g8b-nudenet-reference-parity/g8b-preregistration.json")), readFile(path.join(root, "evaluation-output/image-moderation/i4-g8b-nudenet-reference-parity/g8b-python-reference.json")), readFile(path.join(root, "evaluation-output/image-moderation/i4-g8c-r5-opencv-wasm-evaluation/g8c-r5-opencv-wasm-evaluation.json")), readFile(path.join(root, "evaluation-output/image-moderation/i4-g8c-r6-opencv-wasm-real-resize-parity/g8c-r6-opencv-wasm-real-resize-parity.json")), readFile(path.join(root, "evaluation-cache/image-moderation/specialists/nudenet-320n/320n.onnx")),
  ]);
  assert.equal(sha256(g8b), "b7002420157e3b9f05d6e82d8703bccef05bd34ac6d2ec241e6937413c9a5623"); assert.equal(sha256(python), "075cdae4e00290ce9da50c628f434e20e9c5582d237c48f224d7ba901d69a0db"); assert.equal(sha256(r5), "a76779e4ee85d9c8ba91cb90110dd3ffba0a0c0771d84c42aa064f738b1c1f41"); assert.equal(sha256(r6), "3cabb140d1dcf26f98fc44a58cb8461cbdda5c833b4c521f1c1fdb2dc1358e8b"); assert.equal(sha256(model), NUDENET_320N.modelSha256);
  const selected = JSON.parse(g8b.toString("utf8")).selection.selected; assert.equal(selected.length, 16); assert.equal(new Set(selected.map((row: { candidateId: string }) => row.candidateId)).size, 16); assert.equal(JSON.parse(python.toString("utf8")).rows.length, 16);
});
test("R7 preserves frozen native detector mechanics and tolerance-bounded class/box matching", () => {
  assert.equal(NUDENET_320N.classes.length, 18); assert.deepEqual(NUDENET_320N.classes.slice(0, 3), ["FEMALE_GENITALIA_COVERED", "FACE_FEMALE", "BUTTOCKS_EXPOSED"]);
  const expected = [{ class: "FACE_FEMALE", score: .5, box: [1, 2, 3, 4] as const }]; const actual = [{ class: "FACE_FEMALE", score: .51, box: [3, 3, 4, 5] as const }];
  assert.equal(compareStageADetections(expected, actual, { confidenceAbsolute: .02, boxPixelsAbsolute: 3 }).passed, true); assert.equal(compareStageADetections(expected, [{ ...actual[0], class: "FACE_MALE" }], { confidenceAbsolute: .02, boxPixelsAbsolute: 3 }).passed, false);
});
