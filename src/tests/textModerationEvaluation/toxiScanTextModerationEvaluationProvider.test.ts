import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { evaluateTextModerationFixtures } from "../../evaluation/textModeration/textModerationEvaluation.service";
import { TEXT_MODERATION_FIXTURE_VERSION, textModerationEvaluationFixtures } from "../../evaluation/textModeration/textModerationFixtures";
import {
  evaluateToxiScanLogits,
  TOXISCAN_DECISION_LABELS,
  TOXISCAN_NATIVE_LABELS,
  TOXISCAN_POLICY_NAME,
  TOXISCAN_THRESHOLD,
  ToxiScanInferenceRuntime,
  ToxiScanRuntimeMetadata,
  ToxiScanTextModerationEvaluationProvider,
} from "../../evaluation/textModeration/providers/toxiScanTextModerationEvaluationProvider";
import { renderTextModerationMarkdownReport } from "../../evaluation/textModeration/textModerationReport.service";

const LOW = -10;
const HIGH = 10;
const firstFixture = textModerationEvaluationFixtures[0];

const runtimeMetadata: ToxiScanRuntimeMetadata = {
  artifactBytes: 135_956_609,
  artifactSha256: "5683dd7ea12a3a6d811610c8d7562427f5b4e8a0d586def8df70e7de603e4509",
  tokenizerBytes: 2_919_627,
  tokenizerSha256: "synthetic-tokenizer-hash",
  modelLoadTimeMs: 12,
  rssBeforeLoadBytes: 100,
  rssAfterLoadBytes: 200,
  peakRssBytes: 220,
  cpu: "synthetic CPU",
  nodeVersion: "v20-test",
  onnxRuntimeVersion: "1.27.0",
  tokenizerRuntimeVersion: "0.23.2",
};

class StubRuntime implements ToxiScanInferenceRuntime {
  constructor(
    private readonly logits: readonly number[],
    private readonly failure?: "INITIALIZE" | "INFER",
  ) {}

  async initialize() {
    if (this.failure === "INITIALIZE") throw new Error("synthetic initialization failure");
    return runtimeMetadata;
  }

  async infer() {
    if (this.failure === "INFER") throw new Error("synthetic inference failure");
    return this.logits;
  }

  getPeakRssBytes() {
    return runtimeMetadata.peakRssBytes;
  }
}

const logitsWith = (values: Partial<Record<typeof TOXISCAN_NATIVE_LABELS[number], number>> = {}) =>
  TOXISCAN_NATIVE_LABELS.map((label) => values[label] ?? LOW);

test("native label order and neutral baseline constants are frozen", () => {
  assert.deepEqual(TOXISCAN_NATIVE_LABELS, [
    "insult", "threat", "identity_hate", "sexual", "self_harm", "harassment", "profanity", "spam",
  ]);
  assert.deepEqual(TOXISCAN_DECISION_LABELS, [
    "insult", "threat", "identity_hate", "sexual", "harassment", "profanity",
  ]);
  assert.equal(TOXISCAN_THRESHOLD, 0.5);
  assert.equal(TOXISCAN_POLICY_NAME, "STHN_TOXISCAN_NEUTRAL_BASELINE_V1");
});

test("sigmoid extraction preserves all native scores and blocks at the exact 0.50 boundary", () => {
  const result = evaluateToxiScanLogits(logitsWith({ threat: 0 }));
  assert.equal(result.status, "COMPLETED");
  if (result.status !== "COMPLETED") return;
  assert.equal(result.decision, "BLOCK");
  assert.equal(result.raw?.labels?.length, 8);
  assert.equal(result.raw?.labels?.find(({ name }) => name === "threat")?.score, 0.5);
  assert.equal(result.raw?.labels?.find(({ name }) => name === "threat")?.flagged, true);
  assert.deepEqual(result.categories, ["THREAT_OR_VIOLENCE"]);
});

test("all six participating labels below threshold allow", () => {
  const result = evaluateToxiScanLogits(logitsWith());
  assert.equal(result.status, "COMPLETED");
  if (result.status === "COMPLETED") assert.equal(result.decision, "ALLOW");
});

test("self_harm and spam are recorded but never participate in ALLOW/BLOCK", () => {
  for (const observationOnly of ["self_harm", "spam"] as const) {
    const result = evaluateToxiScanLogits(logitsWith({ [observationOnly]: HIGH }));
    assert.equal(result.status, "COMPLETED");
    if (result.status !== "COMPLETED") continue;
    assert.equal(result.decision, "ALLOW");
    const label = result.raw?.labels?.find(({ name }) => name === observationOnly);
    assert.ok((label?.score ?? 0) > 0.99);
    assert.equal(label?.flagged, null);
  }
});

test("multiple crossed labels preserve native outputs and analytical STHN categories", () => {
  const result = evaluateToxiScanLogits(logitsWith({ insult: HIGH, harassment: HIGH, profanity: HIGH }));
  assert.equal(result.status, "COMPLETED");
  if (result.status !== "COMPLETED") return;
  assert.equal(result.decision, "BLOCK");
  assert.deepEqual(result.categories, ["ABUSIVE_OR_HARASSING", "PROFANITY"]);
  assert.equal(result.raw?.metadata?.crossedDecisionLabels, "insult,harassment,profanity");
});

test("missing, extra, and non-finite logits are bounded errors", () => {
  for (const logits of [
    [LOW],
    [...logitsWith(), LOW],
    logitsWith({ sexual: Number.NaN }),
    logitsWith({ threat: Number.POSITIVE_INFINITY }),
  ]) {
    const result = evaluateToxiScanLogits(logits);
    assert.equal(result.status, "ERROR");
    if (result.status === "ERROR") assert.equal(result.errorCode, "TOXISCAN_MALFORMED_OUTPUT");
  }
});

test("runtime availability and inference failures remain distinct and never allow", async () => {
  const unavailable = await new ToxiScanTextModerationEvaluationProvider({
    runtime: new StubRuntime(logitsWith(), "INITIALIZE"),
  }).evaluate(firstFixture);
  assert.equal(unavailable.status, "UNAVAILABLE");
  const failed = await new ToxiScanTextModerationEvaluationProvider({
    runtime: new StubRuntime(logitsWith(), "INFER"),
  }).evaluate(firstFixture);
  assert.equal(failed.status, "ERROR");
});

test("report serializes policy, runtime, latency, and raw scores without mutating fixtures", async () => {
  const before = JSON.stringify(textModerationEvaluationFixtures);
  const provider = new ToxiScanTextModerationEvaluationProvider({
    runtime: new StubRuntime(logitsWith({ sexual: HIGH })),
  });
  await provider.initialize();
  let clock = 0;
  const report = await evaluateTextModerationFixtures([firstFixture], provider, {
    now: () => clock++,
    runId: "toxiscan-test-run",
    generatedAt: "2026-09-07T00:00:00.000Z",
    fixtureVersion: TEXT_MODERATION_FIXTURE_VERSION,
  });
  assert.equal(JSON.stringify(textModerationEvaluationFixtures), before);
  assert.equal(report.provider.metadata?.evaluationPolicy, TOXISCAN_POLICY_NAME);
  assert.equal(report.provider.metadata?.peakRssBytes, 220);
  assert.equal(report.metrics.p50LatencyMs, 1);
  assert.equal(report.metrics.p95LatencyMs, 1);
  assert.equal(report.metrics.maxLatencyMs, 1);
  assert.equal(report.results[0].raw?.labels?.length, 8);
  const markdown = renderTextModerationMarkdownReport(report);
  assert.match(markdown, /STHN_TOXISCAN_NEUTRAL_BASELINE_V1/);
  assert.match(markdown, /P95 latency/);
  assert.match(markdown, /insult=/);
  assert.match(markdown, /spam=/);
});

test("ToxiScan evaluation source is not imported by production Text AI", async () => {
  const providerSource = await readFile(path.resolve(
    __dirname, "../../evaluation/textModeration/providers/toxiScanTextModerationEvaluationProvider.ts",
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
    assert.doesNotMatch(productionSource, /ToxiScan|TOXISCAN/);
  }
});
