import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DetectorEvaluationResult, ImageModerationEvaluationFixture } from "../../evaluation/imageModeration/imageModerationEvaluation.types";
import { Qwen3VlEvaluationRecord } from "../../evaluation/imageModeration/qwen3VlOfflineEvaluation";
import { buildQwen3VlPilotReport, loadQwen3VlPilotInputs, Qwen3VlPilotRuntimeFailure, runQwen3VlPilotInference, writeQwen3VlPilotReport } from "../../evaluation/imageModeration/qwen3VlPilot20";
import { QWEN3_VL_PILOT_20, QWEN3_VL_PILOT_20_REQUIREMENTS, QWEN3_VL_PILOT_20_STRATUM_COUNTS } from "../../evaluation/imageModeration/qwen3VlPilot20.manifest";

const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex");

class FakePilotAdapter {
  public readonly records: Qwen3VlEvaluationRecord[] = [];
  public async evaluate(input: Readonly<{ fixture: ImageModerationEvaluationFixture; bytes: Buffer }>): Promise<DetectorEvaluationResult> {
    assert.deepEqual(input.fixture.expectedBySurface, {});
    assert.doesNotMatch(input.fixture.description, /PASS|BLOCK|category|portrait|fashion/i);
    this.records.push({ fixtureId: input.fixture.id, surface: "CREATOR_SERVICE_MEDIA", runtimeStatus: "COMPLETED", rawOutput: '{"decision":"PASS","categories":[],"reason":"Synthetic local test response."}', parsed: { decision: "PASS", categories: [], reason: "Synthetic local test response." }, schemaValid: true, errorCode: null, performance: { inferenceLatencyMs: 1, processRssBytes: 2, freeSystemMemoryBytes: 3 }, imagePreparation: null });
    return { status: "COMPLETED" as const, decision: "PASS" as const, findings: [] };
  }
  public getEvaluationRecords() { return this.records; }
  public getCandidateMetadata() { return { modelId: "test", promptTemplateId: "test" }; }
}

const withBenchmark = async (callback: (input: Readonly<{ root: string; adamPath: string }>) => Promise<void>) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sthn-qwen-pilot-"));
  try {
    await mkdir(path.join(root, "assets"));
    const candidates: unknown[] = []; const reviews: unknown[] = []; const adam: unknown[] = [];
    for (const selection of QWEN3_VL_PILOT_20) {
      const bytes = Buffer.from(`pilot-${selection.fixtureId}`); const asset = `assets/${selection.fixtureId}.bin`;
      await writeFile(path.join(root, asset), bytes);
      const requirement = QWEN3_VL_PILOT_20_REQUIREMENTS[selection.stratum]; const expectedDecision = selection.expectedDecisionOverride ?? requirement.expectedDecision;
      candidates.push({ id: selection.fixtureId, state: "REVIEW_REQUIRED", localAsset: asset, sha256: digest(bytes) });
      reviews.push({ candidateId: selection.fixtureId, state: "APPROVED", expectedDecision, categories: expectedDecision === "PASS" ? [] : ["SUGGESTIVE"], surfaces: ["CREATOR_SERVICE_MEDIA"], contextTags: requirement.requiredContextTags, coverageClasses: requirement.requiredCoverage.length ? [requirement.requiredCoverage[0]] : ["FASHION_PASS"] });
      adam.push({ candidateId: selection.fixtureId, evaluationDecision: expectedDecision });
    }
    await writeFile(path.join(root, "inventory-manifest.json"), JSON.stringify({ candidates }));
    await writeFile(path.join(root, "review-manifest.json"), JSON.stringify({ reviews }));
    const adamPath = path.join(root, "adam.json"); await writeFile(adamPath, JSON.stringify({ rows: adam }));
    await callback({ root, adamPath });
  } finally { await rm(root, { recursive: true, force: true }); }
};

test("Qwen pilot fixes exactly twenty unique reviewed fixture IDs with the requested distribution", () => {
  assert.equal(QWEN3_VL_PILOT_20.length, 20);
  assert.equal(new Set(QWEN3_VL_PILOT_20.map((item) => item.fixtureId)).size, 20);
  for (const [stratum, count] of Object.entries(QWEN3_VL_PILOT_20_STRATUM_COUNTS)) assert.equal(QWEN3_VL_PILOT_20.filter((item) => item.stratum === stratum).length, count, stratum);
});

test("Qwen pilot validates hashes, withholds reviewed labels during inference, and writes a bounded report", async () => {
  await withBenchmark(async ({ root, adamPath }) => {
    const inputs = await loadQwen3VlPilotInputs({ benchmarkRoot: root });
    const adapter = new FakePilotAdapter();
    const inference = await runQwen3VlPilotInference(adapter, inputs);
    assert.equal(inference.length, 20);
    const report = await buildQwen3VlPilotReport({ benchmarkRoot: root, adamCoddResultsPath: adamPath, inferenceRows: inference, candidateMetadata: adapter.getCandidateMetadata() });
    assert.equal(report.attempted, 20); assert.equal(report.completed, 20); assert.equal(report.statusCounts.PASS, 20); assert.equal(report.rawOutputSchema.valid, 20);
    const output = path.join(process.cwd(), "evaluation-output", "image-moderation", `qwen-pilot-test-${Date.now()}`);
    try { const written = await writeQwen3VlPilotReport(report, output); assert.match(written.reportPath, /pilot-report\.json$/); } finally { await rm(output, { recursive: true, force: true }); }
    await writeFile(path.join(root, "assets", `${QWEN3_VL_PILOT_20[0].fixtureId}.bin`), "tampered");
    await assert.rejects(loadQwen3VlPilotInputs({ benchmarkRoot: root }), /hash mismatch/);
  });
});

test("Qwen pilot stops on the first unavailable runtime result without evaluating later fixtures", async () => {
  await withBenchmark(async ({ root }) => {
    const inputs = await loadQwen3VlPilotInputs({ benchmarkRoot: root });
    let calls = 0;
    const adapter = new FakePilotAdapter();
    adapter.evaluate = async (input) => {
      calls += 1;
      adapter.records.push({ fixtureId: input.fixture.id, surface: "CREATOR_SERVICE_MEDIA", runtimeStatus: "UNAVAILABLE", rawOutput: null, parsed: null, schemaValid: false, errorCode: "QWEN_RUNTIME_TIMEOUT", performance: null, imagePreparation: null });
      return { status: "UNAVAILABLE" as const, errorCode: "QWEN_RUNTIME_TIMEOUT" };
    };
    await assert.rejects(runQwen3VlPilotInference(adapter, inputs), (error: unknown) => error instanceof Qwen3VlPilotRuntimeFailure && error.rows.length === 1 && error.failedFixtureId === QWEN3_VL_PILOT_20[0].fixtureId);
    assert.equal(calls, 1);
  });
});
