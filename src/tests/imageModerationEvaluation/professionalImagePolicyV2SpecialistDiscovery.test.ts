import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("G5 preserves G4 authority and records only evidence-based discovery", async () => {
  const root = process.cwd();
  const report = JSON.parse(await readFile(path.join(root, "evaluation-output", "image-moderation", "i4-g5-specialist-model-discovery", "g5-specialist-model-discovery.json"), "utf8"));
  const source = await readFile(path.join(root, "src", "scripts", "analyzeProfessionalImagePolicyV2SpecialistDiscovery.ts"), "utf8");
  assert.equal(report.frozenAuthoritySha256.g4, "5b8fb1fa2762a71bc0d4d63a8d6370d9069fdfcb7ad610f9f299b4070dc107b7");
  assert.equal(report.g4Fingerprint, "4e1b964bf738055c4142808400130dc5ed3153df4e669fa4e3c8765291aaf63d");
  assert.deepEqual(report.g4Evidence.confusionMatrix, [[128, 20], [27, 150]]);
  assert.equal(report.candidates.length, 6);
  assert.ok(report.sources.every((item: { url: string }) => /^https:\/\//.test(item.url)));
  assert.deepEqual(report.conclusions.nudityExposureShortlist, []);
  assert.equal(report.conclusions.suggestiveStatus, "NO_VERIFIED_SUITABLE_CANDIDATE");
  assert.ok(report.candidates.every((item: { status: string }) => ["HOLD", "REJECT"].includes(item.status)));
  assert.doesNotMatch(source, /^import.*(?:onnxruntime|OwenElliott|sharp|child_process|https?)/m);
});
