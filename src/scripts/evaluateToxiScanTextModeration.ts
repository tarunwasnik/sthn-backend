import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { evaluateTextModerationFixtures } from "../evaluation/textModeration/textModerationEvaluation.service";
import { TEXT_MODERATION_FIXTURE_VERSION, textModerationEvaluationFixtures } from "../evaluation/textModeration/textModerationFixtures";
import {
  defaultToxiScanArtifactDirectory,
  TOXISCAN_POLICY_NAME,
  ToxiScanTextModerationEvaluationProvider,
} from "../evaluation/textModeration/providers/toxiScanTextModerationEvaluationProvider";
import { writeTextModerationEvaluationReport } from "../evaluation/textModeration/textModerationReport.service";

if (process.env.NODE_ENV === "production") {
  throw new Error("ToxiScan text moderation evaluation is development-only");
}

const FROZEN_FIXTURE_SHA256 = "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747";
const argumentValue = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? path.resolve(process.argv[index + 1]) : undefined;
};

const outputDirectory = argumentValue("--output") ?? path.resolve(
  process.cwd(), "evaluation-output", "text-moderation", "toxiscan",
);
const artifactDirectory = argumentValue("--artifact-dir") ?? defaultToxiScanArtifactDirectory();

const assertFrozenFixtureSource = async () => {
  const fixturePath = path.resolve(process.cwd(), "src", "evaluation", "textModeration", "textModerationFixtures.ts");
  const hash = createHash("sha256").update(await readFile(fixturePath)).digest("hex");
  if (hash !== FROZEN_FIXTURE_SHA256 ||
    TEXT_MODERATION_FIXTURE_VERSION !== "STHN_TEXT_MODERATION_FIXTURES_V1R" ||
    textModerationEvaluationFixtures.length !== 140) {
    throw new Error(`Frozen text-moderation fixture source mismatch: version=${TEXT_MODERATION_FIXTURE_VERSION}, count=${textModerationEvaluationFixtures.length}, sha256=${hash}`);
  }
};

(async () => {
  await assertFrozenFixtureSource();
  const provider = new ToxiScanTextModerationEvaluationProvider({ artifactDirectory });
  await provider.initialize();
  const generatedAt = new Date().toISOString();
  const runId = `toxiscan-${generatedAt.replace(/[^0-9]/g, "").slice(0, 17)}-${randomUUID().slice(0, 8)}`;
  const report = await evaluateTextModerationFixtures(textModerationEvaluationFixtures, provider, {
    fixtureVersion: TEXT_MODERATION_FIXTURE_VERSION,
    generatedAt,
    runId,
  });
  const paths = await writeTextModerationEvaluationReport(report, outputDirectory, { preserveRun: true });
  const { metrics } = report;
  console.log([
    `STHN text moderation evaluation: ${provider.displayName}`,
    `Evaluation policy: ${TOXISCAN_POLICY_NAME}`,
    `Run ID: ${report.runId}`,
    `Model: ${provider.requestedModel}`,
    `Fixtures: ${metrics.total}; evaluated: ${metrics.evaluated}; unavailable/error: ${metrics.unavailableOrError}`,
    `Correct: ${metrics.correct}; false positives: ${metrics.falsePositive}; false negatives: ${metrics.falseNegative}`,
    `Evaluated accuracy: ${metrics.evaluatedAccuracy === null ? "n/a" : `${(metrics.evaluatedAccuracy * 100).toFixed(2)}%`}`,
    `Availability: ${metrics.availabilityRate === null ? "n/a" : `${(metrics.availabilityRate * 100).toFixed(2)}%`}`,
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
