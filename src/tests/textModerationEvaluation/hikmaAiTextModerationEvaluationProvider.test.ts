import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { evaluateTextModerationFixtures } from "../../evaluation/textModeration/textModerationEvaluation.service";
import { TEXT_MODERATION_FIXTURE_VERSION, textModerationEvaluationFixtures } from "../../evaluation/textModeration/textModerationFixtures";
import {
  classifyHikmaAiToxicProbability,
  evaluateHikmaAiLogits,
  HIKMAAI_ARTIFACT_SHA256,
  HIKMAAI_MODEL_ID,
  HIKMAAI_MODEL_REVISION,
  HIKMAAI_NATIVE_LABELS,
  HIKMAAI_THRESHOLD,
  HikmaAiInferenceObservation,
  HikmaAiInferenceRuntime,
  HikmaAiRuntimeMetadata,
  HikmaAiTextModerationEvaluationProvider,
  softmaxBinaryLogits,
} from "../../evaluation/textModeration/providers/hikmaAiTextModerationEvaluationProvider";
import { renderTextModerationMarkdownReport } from "../../evaluation/textModeration/textModerationReport.service";

const firstFixture = textModerationEvaluationFixtures[0];
const metadata: HikmaAiRuntimeMetadata = {
  artifactBytes: 562_892_985,
  artifactSha256: HIKMAAI_ARTIFACT_SHA256,
  tokenizerBytes: 17_098_251,
  tokenizerSha256: "b74659c780d49afad7a7b9799868f75cbd3014fb6c34956e85a793028d38094a",
  modelLoadTimeMs: 20,
  rssBeforeLoadBytes: 100,
  rssAfterLoadBytes: 200,
  peakRssBytes: 220,
  cpu: "synthetic CPU",
  nodeVersion: "v20-test",
  onnxRuntimeVersion: "1.27.0",
  tokenizerRuntimeVersion: "0.23.2",
};

const observation = (logits: readonly number[]): HikmaAiInferenceObservation => ({
  inputIds: [0, 42, 2],
  attentionMask: [1, 1, 1],
  tensorShape: [1, 3],
  logits,
});

class StubRuntime implements HikmaAiInferenceRuntime {
  constructor(
    private readonly logits: readonly number[],
    private readonly failure?: "INITIALIZE" | "INFER",
  ) {}

  async initialize() {
    if (this.failure === "INITIALIZE") throw new Error("synthetic initialization failure");
    return metadata;
  }

  async infer() {
    if (this.failure === "INFER") throw new Error("synthetic inference failure");
    return observation(this.logits);
  }

  getPeakRssBytes() { return metadata.peakRssBytes; }
}

test("publisher artifact, revision, binary label order, and threshold are pinned", () => {
  assert.equal(HIKMAAI_MODEL_ID, "HikmaAI/hikmaai-xlm-roberta-large-toxicity");
  assert.equal(HIKMAAI_MODEL_REVISION, "2c27bcd9a7df3e3a2453b8766f524341513dee37");
  assert.equal(HIKMAAI_ARTIFACT_SHA256, "b66e23667b483e8dc9f200586583753297ad65332d1fc3460bae91da6816dae6");
  assert.deepEqual(HIKMAAI_NATIVE_LABELS, ["benign", "toxic"]);
  assert.equal(HIKMAAI_THRESHOLD, 0.66);
});

test("two-class softmax preserves benign and toxic scores without double transformation", () => {
  const probabilities = softmaxBinaryLogits([0, Math.log(3)]);
  assert.ok(probabilities);
  assert.ok(Math.abs(probabilities[0] - 0.25) < 1e-12);
  assert.ok(Math.abs(probabilities[1] - 0.75) < 1e-12);
  assert.ok(Math.abs(probabilities[0] + probabilities[1] - 1) < 1e-12);
});

test("exact publisher threshold boundary blocks and the value below allows", () => {
  assert.equal(classifyHikmaAiToxicProbability(0.66), "BLOCK");
  assert.equal(classifyHikmaAiToxicProbability(0.659999999), "ALLOW");
});

test("binary logits map benign index zero to ALLOW and toxic index one to BLOCK", () => {
  const allowed = evaluateHikmaAiLogits([10, -10]);
  const blocked = evaluateHikmaAiLogits([-10, 10]);
  assert.equal(allowed.status, "COMPLETED");
  assert.equal(blocked.status, "COMPLETED");
  if (allowed.status === "COMPLETED") assert.equal(allowed.decision, "ALLOW");
  if (blocked.status === "COMPLETED") assert.equal(blocked.decision, "BLOCK");
});

test("native binary scores and raw logits are preserved without fabricated categories", () => {
  const result = evaluateHikmaAiLogits([-2, 2]);
  assert.equal(result.status, "COMPLETED");
  if (result.status !== "COMPLETED") return;
  assert.deepEqual(result.categories, undefined);
  assert.deepEqual(result.raw?.labels?.map(({ name }) => name), ["benign", "toxic"]);
  assert.equal(result.raw?.metadata?.benignLogit, -2);
  assert.equal(result.raw?.metadata?.toxicLogit, 2);
});

test("missing, extra, and non-finite outputs are bounded malformed-output errors", () => {
  for (const logits of [[1], [1, 2, 3], [Number.NaN, 1], [0, Number.POSITIVE_INFINITY]]) {
    const result = evaluateHikmaAiLogits(logits);
    assert.equal(result.status, "ERROR");
    if (result.status === "ERROR") assert.equal(result.errorCode, "HIKMAAI_MALFORMED_OUTPUT");
  }
});

test("runtime tokenizer/tensor observations are retained by the inspection contract", async () => {
  const provider = new HikmaAiTextModerationEvaluationProvider({ runtime: new StubRuntime([-1, 1]) });
  const inspected = await provider.inspect("distinct text");
  assert.deepEqual(inspected.inputIds, [0, 42, 2]);
  assert.deepEqual(inspected.attentionMask, [1, 1, 1]);
  assert.deepEqual(inspected.tensorShape, [1, 3]);
});

test("initialization and inference failures are distinct and never become ALLOW", async () => {
  const unavailable = await new HikmaAiTextModerationEvaluationProvider({
    runtime: new StubRuntime([1, -1], "INITIALIZE"),
  }).evaluate(firstFixture);
  const failed = await new HikmaAiTextModerationEvaluationProvider({
    runtime: new StubRuntime([1, -1], "INFER"),
  }).evaluate(firstFixture);
  assert.equal(unavailable.status, "UNAVAILABLE");
  assert.equal(failed.status, "ERROR");
});

test("report serialization includes binary/runtime metadata and does not mutate frozen fixtures", async () => {
  const before = JSON.stringify(textModerationEvaluationFixtures);
  const provider = new HikmaAiTextModerationEvaluationProvider({ runtime: new StubRuntime([-10, 10]) });
  await provider.initialize();
  let clock = 0;
  const report = await evaluateTextModerationFixtures([firstFixture], provider, {
    now: () => clock++,
    runId: "hikmaai-test-run",
    generatedAt: "2026-09-07T00:00:00.000Z",
    fixtureVersion: TEXT_MODERATION_FIXTURE_VERSION,
  });
  assert.equal(JSON.stringify(textModerationEvaluationFixtures), before);
  assert.equal(report.provider.metadata?.nativeLabels, "benign,toxic");
  assert.equal(report.provider.metadata?.artifactBytes, 562_892_985);
  assert.equal(report.results[0].raw?.metadata?.tensorShape, "1x3");
  assert.equal(report.results[0].raw?.labels?.length, 2);
  const markdown = renderTextModerationMarkdownReport(report);
  assert.match(markdown, /HIKMAAI_PUBLISHER_BINARY_BASELINE_V1/);
  assert.match(markdown, /benign=/);
  assert.match(markdown, /toxic=/);
});

test("HikmaAI evaluation source remains isolated from production Text AI", async () => {
  const providerSource = await readFile(path.resolve(
    __dirname, "../../evaluation/textModeration/providers/hikmaAiTextModerationEvaluationProvider.ts",
  ), "utf8");
  assert.doesNotMatch(providerSource, /services[\\/]textModeration|textModerationAdmission|moderateText\s*\(/);
  for (const relative of [
    "../../services/textModeration/textModerationProviderAdapter.ts",
    "../../services/textModeration/textModeration.service.ts",
    "../../services/textModeration/textModerationAdmission.service.ts",
    "../../controllers/textModeration.controller.ts",
    "../../routes/v1/textModeration.routes.ts",
  ]) {
    const productionSource = await readFile(path.resolve(__dirname, relative), "utf8");
    assert.doesNotMatch(productionSource, /HikmaAI|HIKMAAI/);
  }
});
