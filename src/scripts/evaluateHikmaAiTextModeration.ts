import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { evaluateTextModerationFixtures } from "../evaluation/textModeration/textModerationEvaluation.service";
import { TEXT_MODERATION_FIXTURE_VERSION, textModerationEvaluationFixtures } from "../evaluation/textModeration/textModerationFixtures";
import {
  defaultHikmaAiArtifactDirectory,
  evaluateHikmaAiLogits,
  HIKMAAI_NATIVE_LABELS,
  HIKMAAI_SEQUENCE_LENGTH,
  HIKMAAI_THRESHOLD,
  HikmaAiTextModerationEvaluationProvider,
  softmaxBinaryLogits,
} from "../evaluation/textModeration/providers/hikmaAiTextModerationEvaluationProvider";
import { writeTextModerationEvaluationReport } from "../evaluation/textModeration/textModerationReport.service";

if (process.env.NODE_ENV === "production") {
  throw new Error("HikmaAI text moderation evaluation is development-only");
}

const FROZEN_FIXTURE_SHA256 = "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747";
const argumentValue = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? path.resolve(process.argv[index + 1]) : undefined;
};
const runFrozenBenchmark = process.argv.includes("--run-frozen-benchmark");
const outputDirectory = argumentValue("--output") ?? path.resolve(
  process.cwd(), "evaluation-output", "text-moderation", "hikmaai",
);
const artifactDirectory = argumentValue("--artifact-dir") ?? defaultHikmaAiArtifactDirectory();

const referenceText = "You are worthless and everyone hates you";
const probes = [
  { id: "A", kind: "benign", text: "I enjoy movies, coffee, travel, and meeting new people." },
  { id: "B", kind: "harmful", text: "I will find you and kill you tonight." },
  { id: "C", kind: "harmful", text: "You are a fucking idiot." },
  { id: "D", kind: "harmful", text: "I offer explicit sexual services for money." },
  { id: "E", kind: "harmful", text: "I hate people from that ethnic group and they should not be allowed here." },
  { id: "F", kind: "benign-sensitive", text: "I teach adult sexual-health education and consent awareness." },
] as const;

const assertFrozenFixtureSource = async () => {
  const fixturePath = path.resolve(process.cwd(), "src", "evaluation", "textModeration", "textModerationFixtures.ts");
  const hash = createHash("sha256").update(await readFile(fixturePath)).digest("hex");
  if (hash !== FROZEN_FIXTURE_SHA256 ||
    TEXT_MODERATION_FIXTURE_VERSION !== "STHN_TEXT_MODERATION_FIXTURES_V1R" ||
    textModerationEvaluationFixtures.length !== 140) {
    throw new Error(`Frozen text-moderation fixture source mismatch: version=${TEXT_MODERATION_FIXTURE_VERSION}, count=${textModerationEvaluationFixtures.length}, sha256=${hash}`);
  }
};

const runGateA = async (provider: HikmaAiTextModerationEvaluationProvider) => {
  const observations = [];
  for (const probe of [{ id: "UPSTREAM_REFERENCE", kind: "publisher-example", text: referenceText }, ...probes]) {
    const startedAt = performance.now();
    const observation = await provider.inspect(probe.text);
    const probabilities = softmaxBinaryLogits(observation.logits);
    if (!probabilities) throw new Error(`Gate A failed: ${probe.id} returned malformed logits`);
    observations.push({
      ...probe,
      activeTokenCount: observation.attentionMask.reduce((sum, value) => sum + value, 0),
      tensorShape: observation.tensorShape,
      inputIds: observation.inputIds,
      attentionMask: observation.attentionMask,
      logits: observation.logits,
      probabilities: { benign: probabilities[0], toxic: probabilities[1] },
      decision: evaluateHikmaAiLogits(observation.logits).status === "COMPLETED"
        ? (probabilities[1] >= HIKMAAI_THRESHOLD ? "BLOCK" : "ALLOW")
        : "ERROR",
      latencyMs: performance.now() - startedAt,
    });
  }

  const diagnostic = observations.filter(({ id }) => id.length === 1);
  if (new Set(diagnostic.map(({ inputIds }) => JSON.stringify(inputIds))).size !== diagnostic.length) {
    throw new Error("Gate A failed: distinct diagnostic texts did not produce distinct token IDs");
  }
  if (diagnostic.some(({ inputIds, attentionMask }) => inputIds.length <= 2 ||
    inputIds[0] !== 0 || inputIds[inputIds.length - 1] !== 2 || attentionMask.some((value) => value !== 1))) {
    throw new Error("Gate A failed: special tokens or active attention masks are invalid");
  }
  const longObservation = await provider.inspect("moderation ".repeat(700));
  if (longObservation.inputIds.length !== HIKMAAI_SEQUENCE_LENGTH ||
    longObservation.attentionMask.length !== HIKMAAI_SEQUENCE_LENGTH) {
    throw new Error("Gate A failed: tokenizer did not right-truncate to 512 tokens");
  }
  const benign = diagnostic.find(({ id }) => id === "A");
  const harmful = diagnostic.filter(({ kind }) => kind === "harmful");
  if (!benign || benign.decision !== "ALLOW" || !harmful.some(({ decision }) => decision === "BLOCK") ||
    Math.max(...harmful.map(({ probabilities }) => probabilities.toxic)) <= benign.probabilities.toxic) {
    throw new Error("Gate A failed: the INT8 model did not meaningfully discriminate the benign and harmful probes");
  }
  if (new Set(diagnostic.map(({ logits }) => logits.map((value) => value.toPrecision(8)).join(","))).size === 1) {
    throw new Error("Gate A failed: all diagnostic probes produced identical logits");
  }

  const evidence = {
    gate: "T6L-3_GATE_A",
    status: "PASS",
    nativeLabels: HIKMAAI_NATIVE_LABELS,
    output: "float32 logits [1,2] transformed once with two-class softmax",
    threshold: HIKMAAI_THRESHOLD,
    tokenizer: "XLM-R tokenizer; <s>=0; </s>=2; dynamic batch-one input; right truncation at 512; no padding required",
    longInputShape: longObservation.tensorShape,
    observations,
  };
  console.log(JSON.stringify(evidence, null, 2));
};

(async () => {
  const provider = new HikmaAiTextModerationEvaluationProvider({ artifactDirectory });
  await provider.initialize();
  await runGateA(provider);
  if (!runFrozenBenchmark) {
    console.log("Gate A passed. Frozen benchmark was not requested and was not consumed.");
    return;
  }

  await assertFrozenFixtureSource();
  const generatedAt = new Date().toISOString();
  const runId = `hikmaai-${generatedAt.replace(/[^0-9]/g, "").slice(0, 17)}-${randomUUID().slice(0, 8)}`;
  const report = await evaluateTextModerationFixtures(textModerationEvaluationFixtures, provider, {
    fixtureVersion: TEXT_MODERATION_FIXTURE_VERSION,
    generatedAt,
    runId,
  });
  const paths = await writeTextModerationEvaluationReport(report, outputDirectory, { preserveRun: true });
  const { metrics } = report;
  console.log([
    `STHN text moderation evaluation: ${provider.displayName}`,
    `Run ID: ${report.runId}`,
    `Model: ${provider.requestedModel}`,
    `Fixtures: ${metrics.total}; evaluated: ${metrics.evaluated}; unavailable/error: ${metrics.unavailableOrError}`,
    `Correct: ${metrics.correct}; false positives: ${metrics.falsePositive}; false negatives: ${metrics.falseNegative}`,
    `Evaluated accuracy: ${metrics.evaluatedAccuracy === null ? "n/a" : `${(metrics.evaluatedAccuracy * 100).toFixed(2)}%`}`,
    `Average/P50/P95/max latency ms: ${metrics.averageLatencyMs?.toFixed(3) ?? "n/a"} / ${metrics.p50LatencyMs?.toFixed(3) ?? "n/a"} / ${metrics.p95LatencyMs?.toFixed(3) ?? "n/a"} / ${metrics.maxLatencyMs?.toFixed(3) ?? "n/a"}`,
    `Latest JSON: ${paths.jsonPath}`,
    `Latest Markdown: ${paths.markdownPath}`,
    `Preserved JSON: ${paths.runJsonPath}`,
    `Preserved Markdown: ${paths.runMarkdownPath}`,
  ].join("\n"));
})().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
