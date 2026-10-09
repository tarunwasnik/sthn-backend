import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { analyzeNudeNetOutput } from "../../evaluation/imageModeration/nudeNet320nStageAComparison";
import { NUDENET_320N } from "../../evaluation/imageModeration/specialistRuntimeFeasibility";

test("R11-D diagnostic runner is read-only and contains no inference runtime", async () => {
  const source = await readFile(path.join(process.cwd(), "src", "scripts", "runG8CR11DPostprocessingDivergence.ts"), "utf8");
  assert.doesNotMatch(source, /onnxruntime|InferenceSession|session\.run|writeFile\(path\.join\(r11, "raw-f32"/);
  assert.match(source, /noInference: true/); assert.match(source, /sourceImages: false/); assert.match(source, /full558: false, unseen325: false/);
});
test("R11-D stage extraction preserves frozen output shape and detector class contract", () => {
  const values = new Float32Array(22 * 2100); const result = analyzeNudeNetOutput(values, 320, 320);
  assert.equal(result.anchors, 2100); assert.equal(result.raw.count, 46200); assert.equal(NUDENET_320N.classes.length, 18); assert.equal(result.nmsOutputCount, 0);
});
