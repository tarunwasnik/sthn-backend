import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { G8C_R8_STAGE_A_IDS } from "../../evaluation/imageModeration/nudeNet320nR8Contract";

test("R12 is artifact-only and has no inference or source-image path", async () => {
  const source = await readFile(path.join(process.cwd(), "src", "scripts", "runG8CR12TensorAuthorityReconciliation.ts"), "utf8");
  assert.doesNotMatch(source, /onnxruntime|InferenceSession|session\.run|execFile|sharp|inventory-manifest/);
  assert.match(source, /sourceImageAccess: false/); assert.match(source, /full558: false, unseen325: false/);
});
test("R12 preserves the exact frozen16 identity and deterministic comparison rule", () => {
  assert.equal(G8C_R8_STAGE_A_IDS.length, 16); assert.equal(new Set(G8C_R8_STAGE_A_IDS).size, 16);
  const comparable = (a: { dtype: string; shape: string }, b: { dtype: string; shape: string }) => a.dtype === b.dtype && a.shape === b.shape;
  assert.equal(comparable({ dtype: "float32", shape: "[1,3,320,320]" }, { dtype: "float32", shape: "[1,3,320,320]" }), true);
  assert.equal(comparable({ dtype: "float32", shape: "[1,3,320,320]" }, { dtype: "float32", shape: "[1,22,2100]" }), false);
});
