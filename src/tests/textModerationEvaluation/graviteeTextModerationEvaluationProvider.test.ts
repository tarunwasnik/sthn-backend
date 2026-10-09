import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { evaluateTextModerationFixtures } from "../../evaluation/textModeration/textModerationEvaluation.service";
import { TEXT_MODERATION_FIXTURE_VERSION, textModerationEvaluationFixtures } from "../../evaluation/textModeration/textModerationFixtures";
import {
  defaultGraviteeArtifactDirectory,
  diagnosticSoftmaxValues,
  evaluateGraviteeLogits,
  GRAVITEE_ARTIFACT_BYTES,
  GRAVITEE_ARTIFACT_SHA256,
  GRAVITEE_MODEL_ID,
  GRAVITEE_MODEL_REVISION,
  GRAVITEE_NATIVE_LABELS,
  GRAVITEE_POLICY_NAME,
  GRAVITEE_SEQUENCE_LENGTH,
  GRAVITEE_SPECIAL_TOKEN_IDS,
  GraviteeInferenceObservation,
  GraviteeInferenceRuntime,
  GraviteeRuntimeMetadata,
  GraviteeTextModerationEvaluationProvider,
  GraviteeTokenizationObservation,
  LocalGraviteeInferenceRuntime,
  publisherSigmoidValues,
} from "../../evaluation/textModeration/providers/graviteeTextModerationEvaluationProvider";
import { renderTextModerationMarkdownReport } from "../../evaluation/textModeration/textModerationReport.service";

const firstFixture = textModerationEvaluationFixtures[0];
const runtimeMetadata: GraviteeRuntimeMetadata = {
  artifactBytes: GRAVITEE_ARTIFACT_BYTES,
  artifactSha256: GRAVITEE_ARTIFACT_SHA256,
  tokenizerBytes: 2_919_627,
  tokenizerSha256: "c2c0e4d392f08c2c2eb950156eb26e4e5ddd15b557faa45ed6a0decaf45b5f98",
  configBytes: 711,
  configSha256: "7e96ac0dba63fb0bfe1f65fa533e7e0720b609fe88ed658050f01a9a13e4bccf",
  modelLoadTimeMs: 30,
  rssBeforeLoadBytes: 100,
  rssAfterLoadBytes: 200,
  peakRssBytes: 220,
  cpu: "synthetic CPU",
  nodeVersion: "v20-test",
  onnxRuntimeVersion: "1.27.0",
  tokenizerRuntimeVersion: "0.23.2",
  inputContract: "input_ids:int64[batch_size,sequence_length],attention_mask:int64[batch_size,sequence_length]",
  outputContract: "logits:float32[1,2]",
};

const tokenization: GraviteeTokenizationObservation = {
  inputIds: [101, 42, 102],
  attentionMask: [1, 1, 1],
  typeIds: [0, 0, 0],
  specialTokensMask: [1, 0, 1],
  tokens: ["[CLS]", "text", "[SEP]"],
};

const observation = (logits: readonly number[]): GraviteeInferenceObservation => ({
  ...tokenization,
  tensorShape: [1, 3],
  logits,
});

class StubRuntime implements GraviteeInferenceRuntime {
  constructor(
    private readonly logits: readonly number[],
    private readonly failure?: "INITIALIZE" | "INFER",
  ) {}

  async initialize() {
    if (this.failure === "INITIALIZE") throw new Error("synthetic initialization failure");
    return runtimeMetadata;
  }

  async tokenize() { return tokenization; }

  async infer() {
    if (this.failure === "INFER") throw new Error("synthetic inference failure");
    return observation(this.logits);
  }

  getPeakRssBytes() { return runtimeMetadata.peakRssBytes; }
}

test("publisher artifact identity, revision, native label order, and tokenizer constants are pinned", () => {
  assert.equal(GRAVITEE_MODEL_ID, "gravitee-io/distilbert-multilingual-toxicity-classifier");
  assert.equal(GRAVITEE_MODEL_REVISION, "865ad1b453a49e4a7f2471fc40b727ececd28314");
  assert.equal(GRAVITEE_ARTIFACT_SHA256, "c8169782758fe097c6cf036ddc48f6ff7b3c861764d6124c20d8b31bc0ba93d7");
  assert.equal(GRAVITEE_ARTIFACT_BYTES, 135_582_999);
  assert.deepEqual(GRAVITEE_NATIVE_LABELS, ["not-toxic", "toxic"]);
  assert.equal(GRAVITEE_SEQUENCE_LENGTH, 512);
  assert.deepEqual(GRAVITEE_SPECIAL_TOKEN_IDS, { pad: 0, unknown: 100, classification: 101, separator: 102, mask: 103 });
});

test("publisher-style independent sigmoid values are preserved", () => {
  const scores = publisherSigmoidValues([0, Math.log(3)]);
  assert.ok(scores);
  assert.equal(scores[0], 0.5);
  assert.ok(Math.abs(scores[1] - 0.75) < 1e-12);
  assert.ok(Math.abs(scores[0] + scores[1] - 1) > 0.1, "independent sigmoid must not be presented as normalized");
});

test("diagnostic softmax is normalized but never changes publisher argmax", () => {
  const probabilities = diagnosticSoftmaxValues([-2, 2]);
  assert.ok(probabilities);
  assert.ok(Math.abs(probabilities[0] + probabilities[1] - 1) < 1e-12);
  assert.equal(evaluateGraviteeLogits([-2, 2]).status, "COMPLETED");
});

test("native argmax maps not-toxic to ALLOW, toxic to BLOCK, and exact ties to index zero", () => {
  const allowed = evaluateGraviteeLogits([3, -3]);
  const blocked = evaluateGraviteeLogits([-3, 3]);
  const tied = evaluateGraviteeLogits([0, 0]);
  assert.equal(allowed.status === "COMPLETED" ? allowed.decision : "ERROR", "ALLOW");
  assert.equal(blocked.status === "COMPLETED" ? blocked.decision : "ERROR", "BLOCK");
  assert.equal(tied.status === "COMPLETED" ? tied.decision : "ERROR", "ALLOW");
});

test("raw logits, publisher scores, diagnostic probability, and selected class serialize without fabricated categories", () => {
  const result = evaluateGraviteeLogits([-2, 2]);
  assert.equal(result.status, "COMPLETED");
  if (result.status !== "COMPLETED") return;
  assert.equal(result.categories, undefined);
  assert.equal(result.raw?.metadata?.notToxicLogit, -2);
  assert.equal(result.raw?.metadata?.toxicLogit, 2);
  assert.equal(result.raw?.metadata?.selectedClass, "toxic");
  assert.equal(typeof result.raw?.metadata?.diagnosticToxicProbability, "number");
  assert.deepEqual(result.raw?.labels?.map(({ name }) => name), ["not-toxic", "toxic"]);
});

test("malformed and non-finite logits return bounded errors", () => {
  for (const logits of [[1], [1, 2, 3], [Number.NaN, 1], [1, Number.NEGATIVE_INFINITY]]) {
    const result = evaluateGraviteeLogits(logits);
    assert.equal(result.status, "ERROR");
    if (result.status === "ERROR") assert.equal(result.errorCode, "GRAVITEE_MALFORMED_OUTPUT");
  }
});

test("runtime inspection retains token IDs, attention mask, tensor shape, and logits", async () => {
  const provider = new GraviteeTextModerationEvaluationProvider({ runtime: new StubRuntime([-1, 1]) });
  const inspected = await provider.inspect("distinct text");
  assert.deepEqual(inspected.inputIds, [101, 42, 102]);
  assert.deepEqual(inspected.attentionMask, [1, 1, 1]);
  assert.deepEqual(inspected.tensorShape, [1, 3]);
  assert.deepEqual(inspected.logits, [-1, 1]);
});

test("initialization and inference failures remain distinct and never become ALLOW", async () => {
  const unavailable = await new GraviteeTextModerationEvaluationProvider({
    runtime: new StubRuntime([1, -1], "INITIALIZE"),
  }).evaluate(firstFixture);
  const failed = await new GraviteeTextModerationEvaluationProvider({
    runtime: new StubRuntime([1, -1], "INFER"),
  }).evaluate(firstFixture);
  assert.equal(unavailable.status, "UNAVAILABLE");
  assert.equal(failed.status, "ERROR");
});

test("report preserves native metadata, diagnostic distribution, operational metadata, and fixture immutability", async () => {
  const before = JSON.stringify(textModerationEvaluationFixtures);
  const provider = new GraviteeTextModerationEvaluationProvider({ runtime: new StubRuntime([-10, 10]) });
  await provider.initialize();
  let clock = 0;
  const report = await evaluateTextModerationFixtures([firstFixture], provider, {
    now: () => clock++,
    runId: "gravitee-test-run",
    generatedAt: "2026-09-08T00:00:00.000Z",
    fixtureVersion: TEXT_MODERATION_FIXTURE_VERSION,
  });
  assert.equal(JSON.stringify(textModerationEvaluationFixtures), before);
  assert.equal(report.provider.metadata?.nativeLabels, "not-toxic,toxic");
  assert.equal(report.provider.metadata?.artifactBytes, GRAVITEE_ARTIFACT_BYTES);
  assert.equal(report.provider.metadata?.productionLicenseStatus, "NOT YET ACCEPTED / REQUIRES LATER REVIEW");
  assert.equal(report.results[0].raw?.metadata?.tensorShape, "1x3");
  const markdown = renderTextModerationMarkdownReport(report);
  assert.match(markdown, new RegExp(GRAVITEE_POLICY_NAME));
  assert.match(markdown, /publisherSigmoid/);
  assert.match(markdown, /Diagnostic toxic-score distributions/);
  assert.match(markdown, /EXPECTED_ALLOW/);
});

const realArtifactDirectory = defaultGraviteeArtifactDirectory();
test("cached publisher tokenizer and ONNX artifact satisfy loading, special-token, truncation, input, dtype, and output contracts", {
  skip: !existsSync(path.join(realArtifactDirectory, "model.quant.onnx")),
}, async () => {
  const runtime = new LocalGraviteeInferenceRuntime(realArtifactDirectory);
  const metadata = await runtime.initialize();
  assert.equal(metadata.artifactSha256, GRAVITEE_ARTIFACT_SHA256);
  assert.match(metadata.inputContract, /input_ids:int64/);
  assert.match(metadata.inputContract, /attention_mask:int64/);
  assert.equal(metadata.outputContract, "logits:float32[1,2]");
  const ordinary = await runtime.tokenize("A simple tokenizer test.");
  assert.equal(ordinary.inputIds[0], GRAVITEE_SPECIAL_TOKEN_IDS.classification);
  assert.equal(ordinary.inputIds[ordinary.inputIds.length - 1], GRAVITEE_SPECIAL_TOKEN_IDS.separator);
  assert.ok(ordinary.attentionMask.every((value) => value === 1));
  const padded = await runtime.tokenize("short", 10);
  assert.equal(padded.inputIds.length, 10);
  assert.ok(padded.attentionMask.includes(0));
  const long = await runtime.tokenize("moderation ".repeat(700));
  assert.equal(long.inputIds.length, 512);
  assert.equal(long.inputIds[long.inputIds.length - 1], GRAVITEE_SPECIAL_TOKEN_IDS.separator);
  const inference = await runtime.infer("You are a fucking idiot.");
  assert.deepEqual(inference.tensorShape, [1, inference.inputIds.length]);
  assert.equal(inference.logits.length, 2);
  assert.ok(inference.logits.every(Number.isFinite));
});

test("Gravitee evaluation source remains isolated from production Text AI", async () => {
  const providerSource = await readFile(path.resolve(
    __dirname, "../../evaluation/textModeration/providers/graviteeTextModerationEvaluationProvider.ts",
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
    assert.doesNotMatch(productionSource, /Gravitee|GRAVITEE/);
  }
});
