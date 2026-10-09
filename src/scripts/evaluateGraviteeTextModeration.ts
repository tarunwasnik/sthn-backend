import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { evaluateTextModerationFixtures } from "../evaluation/textModeration/textModerationEvaluation.service";
import { TEXT_MODERATION_FIXTURE_VERSION, textModerationEvaluationFixtures } from "../evaluation/textModeration/textModerationFixtures";
import {
  defaultGraviteeArtifactDirectory,
  diagnosticSoftmaxValues,
  evaluateGraviteeLogits,
  GRAVITEE_NATIVE_LABELS,
  GRAVITEE_SEQUENCE_LENGTH,
  GRAVITEE_SPECIAL_TOKEN_IDS,
  GraviteeTextModerationEvaluationProvider,
  publisherSigmoidValues,
} from "../evaluation/textModeration/providers/graviteeTextModerationEvaluationProvider";
import { writeTextModerationEvaluationReport } from "../evaluation/textModeration/textModerationReport.service";

if (process.env.NODE_ENV === "production") {
  throw new Error("Gravitee text moderation evaluation is development-only");
}

const FROZEN_FIXTURE_SHA256 = "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747";
const argumentValue = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? path.resolve(process.argv[index + 1]) : undefined;
};
const runFrozenBenchmark = process.argv.includes("--run-frozen-benchmark");
const outputDirectory = argumentValue("--output") ?? path.resolve(
  process.cwd(), "evaluation-output", "text-moderation", "gravitee",
);
const artifactDirectory = argumentValue("--artifact-dir") ?? defaultGraviteeArtifactDirectory();

const publisherReference = {
  id: "UPSTREAM_REFERENCE",
  kind: "publisher-example",
  text: "I like you. I love you",
} as const;
const probes = [
  { id: "A", kind: "benign", text: "I enjoy movies, coffee, travel, and meeting new people." },
  { id: "B", kind: "threat", text: "I will find you and kill you tonight." },
  { id: "C", kind: "abusive-profane", text: "You are a fucking idiot." },
  { id: "D", kind: "sexual-solicitation", text: "I offer explicit sexual services for money." },
  { id: "E", kind: "hate", text: "I hate people from that ethnic group and they should not be allowed here." },
  { id: "F", kind: "benign-sensitive", text: "I teach adult sexual-health education and consent awareness." },
  { id: "G", kind: "benign-marketplace", text: "I provide tutoring sessions for mathematics and physics." },
  { id: "H", kind: "subtle-inappropriate-marketplace", text: "I can meet privately for adult fun if you pay extra." },
] as const;

const countBy = <T extends string>(values: readonly T[]) => Object.fromEntries(
  [...new Set(values)].sort().map((value) => [value, values.filter((candidate) => candidate === value).length]),
);

const assertFrozenFixtureSource = async () => {
  const fixturePath = path.resolve(process.cwd(), "src", "evaluation", "textModeration", "textModerationFixtures.ts");
  const hash = createHash("sha256").update(await readFile(fixturePath)).digest("hex");
  const decisions = countBy(textModerationEvaluationFixtures.map(({ expectedDecision }) => expectedDecision));
  const difficulties = countBy(textModerationEvaluationFixtures.map(({ difficulty }) => difficulty));
  const languages = countBy(textModerationEvaluationFixtures.map(({ language }) => language));
  const categories = countBy(textModerationEvaluationFixtures.flatMap(({ expectedCategory }) => expectedCategory ? [expectedCategory] : []));
  const matches = hash === FROZEN_FIXTURE_SHA256 &&
    TEXT_MODERATION_FIXTURE_VERSION === "STHN_TEXT_MODERATION_FIXTURES_V1R" &&
    textModerationEvaluationFixtures.length === 140 &&
    decisions.ALLOW === 67 && decisions.BLOCK === 73 &&
    difficulties.EASY === 62 && difficulties.CONTEXTUAL === 56 && difficulties.ADVERSARIAL === 22 &&
    languages.en === 115 && languages.hi === 10 && languages.th === 9 && languages["hi-Latn"] === 4 && languages["en-hi"] === 2 &&
    categories.ABUSIVE_OR_HARASSING === 11 && categories.HATE === 10 && categories.OTHER_INAPPROPRIATE === 5 &&
    categories.PROFANITY === 4 && categories.SEXUAL === 18 && categories.THREAT_OR_VIOLENCE === 25;
  if (!matches) {
    throw new Error(`Frozen fixture mismatch: version=${TEXT_MODERATION_FIXTURE_VERSION}, count=${textModerationEvaluationFixtures.length}, sha256=${hash}, decisions=${JSON.stringify(decisions)}, difficulties=${JSON.stringify(difficulties)}, languages=${JSON.stringify(languages)}, categories=${JSON.stringify(categories)}`);
  }
  return { hash, decisions, difficulties, languages, categories };
};

const runGateA = async (provider: GraviteeTextModerationEvaluationProvider) => {
  const observations = [];
  for (const probe of [publisherReference, ...probes]) {
    const startedAt = performance.now();
    const observation = await provider.inspect(probe.text);
    const publisherScores = publisherSigmoidValues(observation.logits);
    const softmax = diagnosticSoftmaxValues(observation.logits);
    const evaluated = evaluateGraviteeLogits(observation.logits);
    if (!publisherScores || !softmax || evaluated.status !== "COMPLETED") {
      throw new Error(`Gate A failed: ${probe.id} returned malformed logits`);
    }
    observations.push({
      ...probe,
      tokenCount: observation.inputIds.length,
      tensorShape: observation.tensorShape,
      inputIds: observation.inputIds,
      attentionMask: observation.attentionMask,
      logits: observation.logits,
      publisherSigmoid: { notToxic: publisherScores[0], toxic: publisherScores[1] },
      diagnosticSoftmax: { notToxic: softmax[0], toxic: softmax[1] },
      selectedClass: evaluated.decision === "BLOCK" ? GRAVITEE_NATIVE_LABELS[1] : GRAVITEE_NATIVE_LABELS[0],
      decision: evaluated.decision,
      latencyMs: performance.now() - startedAt,
    });
  }

  const diagnostic = observations.filter(({ id }) => id.length === 1);
  if (new Set(diagnostic.map(({ inputIds }) => JSON.stringify(inputIds))).size !== diagnostic.length) {
    throw new Error("Gate A failed: distinct diagnostics did not produce distinct token IDs");
  }
  if (diagnostic.some(({ inputIds, attentionMask }) => inputIds.length <= 2 ||
    inputIds[0] !== GRAVITEE_SPECIAL_TOKEN_IDS.classification ||
    inputIds[inputIds.length - 1] !== GRAVITEE_SPECIAL_TOKEN_IDS.separator ||
    attentionMask.some((value) => value !== 1))) {
    throw new Error("Gate A failed: special tokens or active attention masks are invalid");
  }
  const padded = await provider.inspectTokenization("short text", 12);
  const firstPaddingIndex = padded.attentionMask.indexOf(0);
  if (padded.inputIds.length !== 12 || firstPaddingIndex < 3 ||
    padded.attentionMask.slice(0, firstPaddingIndex).some((value) => value !== 1) ||
    padded.attentionMask.slice(firstPaddingIndex).some((value) => value !== 0) ||
    padded.inputIds.slice(firstPaddingIndex).some((value) => value !== GRAVITEE_SPECIAL_TOKEN_IDS.pad)) {
    throw new Error("Gate A failed: right-padding IDs or attention mask are invalid");
  }
  const longInput = await provider.inspectTokenization("moderation ".repeat(700));
  if (longInput.inputIds.length !== GRAVITEE_SEQUENCE_LENGTH ||
    longInput.inputIds[0] !== GRAVITEE_SPECIAL_TOKEN_IDS.classification ||
    longInput.inputIds[longInput.inputIds.length - 1] !== GRAVITEE_SPECIAL_TOKEN_IDS.separator ||
    longInput.attentionMask.some((value) => value !== 1)) {
    throw new Error("Gate A failed: tokenizer did not right-truncate correctly at 512 tokens");
  }

  const reference = observations.find(({ id }) => id === publisherReference.id);
  const benign = diagnostic.filter(({ kind }) => kind.startsWith("benign"));
  const obviousHarm = diagnostic.filter(({ id }) => ["B", "C", "D", "E"].includes(id));
  if (!reference || reference.decision !== "ALLOW" || benign.every(({ decision }) => decision === "BLOCK") ||
    obviousHarm.every(({ decision }) => decision === "ALLOW")) {
    throw new Error("Gate A failed: the QInt8 model did not show minimally coherent benign/harmful semantic behavior");
  }
  if (new Set(diagnostic.map(({ logits }) => logits.map((value) => value.toPrecision(8)).join(","))).size === 1) {
    throw new Error("Gate A failed: the QInt8 model produced identical logits for every diagnostic");
  }
  const benignMaximum = Math.max(...benign.map(({ diagnosticSoftmax }) => diagnosticSoftmax.toxic));
  const harmfulMaximum = Math.max(...obviousHarm.map(({ diagnosticSoftmax }) => diagnosticSoftmax.toxic));
  if (harmfulMaximum <= benignMaximum) {
    throw new Error("Gate A failed: harmful diagnostics did not separate above benign diagnostics");
  }

  return {
    gate: "T6L-5B_GATE_A",
    status: "PASS",
    artifact: provider.getReportMetadata(),
    nativeLabels: GRAVITEE_NATIVE_LABELS,
    output: "float32 logits [1,2]",
    publisherTransformation: "independent sigmoid per logit",
    publisherDecision: "numpy-style argmax; exact tie selects index 0",
    sthnBaselineMapping: "toxic -> BLOCK; not-toxic -> ALLOW",
    tokenizer: {
      type: "DistilBertTokenizer / WordPiece",
      specialTokenIds: GRAVITEE_SPECIAL_TOKEN_IDS,
      addSpecialTokens: true,
      truncation: "right at 512 including CLS and SEP",
      padding: "disabled for inference; right-padding verified diagnostically",
      paddedObservation: padded,
      longInputTokenCount: longInput.inputIds.length,
    },
    observations,
  };
};

(async () => {
  const provider = new GraviteeTextModerationEvaluationProvider({ artifactDirectory });
  await provider.initialize();
  const gateA = await runGateA(provider);
  console.log(JSON.stringify(gateA, null, 2));
  if (!runFrozenBenchmark) {
    console.log("Gate A passed. Frozen benchmark was not requested and was not consumed.");
    return;
  }

  const frozenFixture = await assertFrozenFixtureSource();
  const generatedAt = new Date().toISOString();
  const runId = `gravitee-${generatedAt.replace(/[^0-9]/g, "").slice(0, 17)}-${randomUUID().slice(0, 8)}`;
  const report = await evaluateTextModerationFixtures(textModerationEvaluationFixtures, provider, {
    fixtureVersion: TEXT_MODERATION_FIXTURE_VERSION,
    generatedAt,
    runId,
  });
  const paths = await writeTextModerationEvaluationReport(report, outputDirectory, { preserveRun: true });
  await writeFile(path.join(outputDirectory, "gate-a.json"), `${JSON.stringify({ ...gateA, frozenFixture }, null, 2)}\n`, "utf8");
  const { metrics } = report;
  console.log([
    `STHN text moderation evaluation: ${provider.displayName}`,
    `Run ID: ${report.runId}`,
    `Model: ${provider.requestedModel}`,
    `Fixtures: ${metrics.total}; evaluated: ${metrics.evaluated}; unavailable/error: ${metrics.unavailableOrError}`,
    `Correct: ${metrics.correct}; correct ALLOW: ${metrics.correctAllow}; correct BLOCK: ${metrics.correctBlock}`,
    `False positives: ${metrics.falsePositive}; false negatives: ${metrics.falseNegative}`,
    `Evaluated accuracy: ${metrics.evaluatedAccuracy === null ? "n/a" : `${(metrics.evaluatedAccuracy * 100).toFixed(2)}%`}`,
    `ALLOW accuracy: ${metrics.allowAccuracy === null ? "n/a" : `${(metrics.allowAccuracy * 100).toFixed(2)}%`}`,
    `BLOCK recall: ${metrics.blockRecall === null ? "n/a" : `${(metrics.blockRecall * 100).toFixed(2)}%`}`,
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
