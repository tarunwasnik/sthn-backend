import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("G6 preserves G5 and separates artifact, legal, and runtime evidence", async () => {
  const root = process.cwd();
  const report = JSON.parse(await readFile(path.join(root, "evaluation-output", "image-moderation", "i4-g6-specialist-due-diligence", "g6-specialist-due-diligence.json"), "utf8"));
  const source = await readFile(path.join(root, "src", "scripts", "analyzeProfessionalImagePolicyV2SpecialistDueDiligence.ts"), "utf8");
  assert.equal(report.frozenAuthoritySha256.g5, "7783faf8ed2d4f56c9a5e105a472e4ad0067a9247177c0b157d231a00ffd3b96");
  assert.equal(report.g5Fingerprint, "51aab526a51ea31164d4c53f89b22a4fbf3801a6d90cf8eaf9e68fca85837b27");
  assert.deepEqual(Object.keys(report.tracks).sort(), ["nsfwjs", "nudeNet"].sort());
  assert.equal(report.tracks.nudeNet.finalDecision, "HOLD");
  assert.equal(report.tracks.nudeNet.controlledEvaluationEligibility, "NOT_ELIGIBLE");
  assert.equal(report.tracks.nudeNet.weightLicense.quality, "UNKNOWN");
  assert.equal(report.tracks.nsfwjs.finalDecision, "ELIGIBLE_FOR_CONTROLLED_ACQUISITION");
  assert.notEqual(report.tracks.nsfwjs.controlledEvaluationEligibility, report.tracks.nsfwjs.productionDeploymentStatus);
  assert.ok(report.sources.every((item: { url: string }) => /^https:\/\//.test(item.url)));
  assert.doesNotMatch(source, /^import.*(?:onnxruntime|sharp|child_process|tensorflow)/m);
});
