import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("G4 consumes frozen G3 evidence without runtime or training dependencies", async () => {
  const root = process.cwd();
  const report = JSON.parse(await readFile(path.join(root, "evaluation-output", "image-moderation", "i4-g4-architecture-analysis", "g4-architecture-analysis.json"), "utf8"));
  const source = await readFile(path.join(root, "src", "scripts", "analyzeProfessionalImagePolicyV2Architecture.ts"), "utf8");
  assert.deepEqual(report.evidence.population, { total: 325, unresolved: 0, pass: 148, block: 177, g2Unchanged: 309, g2Changed: 3, g3HumanReviewed: 13 });
  assert.deepEqual(report.evidence.metrics.confusionMatrix, [[128, 20], [27, 150]]);
  assert.deepEqual(report.evidence.finalFalsePasses, { suggestive: 18, nudity: 2, explicitSexual: 1, pornography: 0, professionalPolicy: 6 });
  assert.equal(report.evidence.hashes.g3, "dd5cd6113c7aa5d789377bd0a7496ca3b5631913b6f9a40ff97a105ceee43be6");
  assert.doesNotMatch(source, /^import.*(?:onnxruntime|OwenElliott|sharp|child_process)/m);
});
