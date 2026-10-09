import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertG8AOutputDirectoryAbsent, canonicalJson, G8A_CURRENT_BYTES, sha256, validateCurrentG8AEvidence } from "../../evaluation/imageModeration/nudeNet320nEvidenceAuthorityRecovery";

test("G8-A-R1 validates all current evidence rows against frozen V1 authority without rewriting evidence", async () => {
  const root = process.cwd(), output = path.join(root, "evaluation-output", "image-moderation", "i4-g8a-nudenet-development-evaluation");
  const before = await Promise.all(["g8a-nudenet-development-evaluation.json", "g8a-nudenet-per-image-results.json", "g8a-nudenet-class-summary.json", "g8a-nudenet-development-evaluation.md"].map(async (name) => sha256(await readFile(path.join(output, name)))));
  assert.deepEqual(before, [G8A_CURRENT_BYTES.report, G8A_CURRENT_BYTES.perImage, G8A_CURRENT_BYTES.classSummary, G8A_CURRENT_BYTES.markdown]);
  const validated = await validateCurrentG8AEvidence(root);
  assert.equal(validated.rows.length, 558); assert.equal(new Set(validated.rows.map((row) => row.candidateId)).size, 558);
  assert.equal(validated.rows.filter((row) => row.humanDecision === "PASS").length, 260); assert.equal(validated.rows.filter((row) => row.humanDecision === "BLOCK").length, 298);
  assert.equal(validated.rows.filter((row) => row.detections.length > 0).length, 0);
  assert.equal(validated.report.execution.successful, 558); assert.equal(validated.report.execution.failed, 0);
  assert.equal(validated.report.g7Sha256, "c007c6b47c4a31e3344c0fe0c55043ab051d6a0fe4352185d25d64ffbfcd2794");
  assert.equal(validated.report.modelSha256, "c15d8273adad2d0a92f014cc69ab2d6c311a06777a55545f2c4eb46f51911f0f");
  assert.equal(validated.report.crossCorpusAuthorityBoundary.exactCandidateIdOverlap, 0);
  const after = await Promise.all(["g8a-nudenet-development-evaluation.json", "g8a-nudenet-per-image-results.json", "g8a-nudenet-class-summary.json", "g8a-nudenet-development-evaluation.md"].map(async (name) => sha256(await readFile(path.join(output, name)))));
  assert.deepEqual(after, before);
});

test("G8-A-R1 semantic identity excludes timing but covers detections and canonical order", async () => {
  const validated = await validateCurrentG8AEvidence();
  const timingOnly = JSON.parse(JSON.stringify(validated.semanticPayload)) as Record<string, unknown>;
  assert.equal(sha256(canonicalJson(timingOnly)), validated.semanticFingerprint);
  const changed = JSON.parse(JSON.stringify(validated.semanticPayload)) as { candidates: Array<{ runtime: { retainedDetectionCount: number } }> };
  changed.candidates[0].runtime.retainedDetectionCount = 1;
  assert.notEqual(sha256(canonicalJson(changed)), validated.semanticFingerprint);
  const reordered = JSON.parse(JSON.stringify(validated.semanticPayload)) as { candidates: unknown[] };
  reordered.candidates.reverse();
  assert.notEqual(sha256(canonicalJson(reordered)), validated.semanticFingerprint);
});

test("G8-A evaluator guard refuses any existing output directory", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sthn-g8a-r1-")); const target = path.join(temp, "frozen");
  try { await assertG8AOutputDirectoryAbsent(target); await mkdir(target); await writeFile(path.join(target, "artifact.json"), "frozen"); await assert.rejects(assertG8AOutputDirectoryAbsent(target), /Refusing to overwrite frozen G8-A evidence directory/); }
  finally { await rm(temp, { recursive: true, force: true }); }
});
