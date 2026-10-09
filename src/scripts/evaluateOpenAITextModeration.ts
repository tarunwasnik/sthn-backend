import { randomUUID } from "node:crypto";
import path from "node:path";

import { evaluateTextModerationFixtures } from "../evaluation/textModeration/textModerationEvaluation.service";
import { TEXT_MODERATION_FIXTURE_VERSION, textModerationEvaluationFixtures } from "../evaluation/textModeration/textModerationFixtures";
import {
  openAIApiKeyFromEnvironment,
  OpenAITextModerationEvaluationProvider,
} from "../evaluation/textModeration/providers/openaiTextModerationEvaluationProvider";
import { writeTextModerationEvaluationReport } from "../evaluation/textModeration/textModerationReport.service";

if (process.env.NODE_ENV === "production") {
  throw new Error("OpenAI text moderation evaluation is development-only");
}

const outputFlag = process.argv.indexOf("--output");
const outputDirectory = outputFlag >= 0 && process.argv[outputFlag + 1]
  ? path.resolve(process.argv[outputFlag + 1])
  : path.resolve(process.cwd(), "evaluation-output", "text-moderation", "openai");

(async () => {
  const generatedAt = new Date().toISOString();
  const runId = `openai-${generatedAt.replace(/[^0-9]/g, "").slice(0, 17)}-${randomUUID().slice(0, 8)}`;
  const provider = new OpenAITextModerationEvaluationProvider({
    apiKey: openAIApiKeyFromEnvironment(),
  });
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
    `Requested model: ${provider.requestedModel}`,
    `Actual model(s): ${report.provider.actualModels.join(", ") || "none returned"}`,
    `Fixtures: ${metrics.total}; evaluated: ${metrics.evaluated}; unavailable/error: ${metrics.unavailableOrError}`,
    `Correct: ${metrics.correct}; false positives: ${metrics.falsePositive}; false negatives: ${metrics.falseNegative}`,
    `Evaluated accuracy: ${metrics.evaluatedAccuracy === null ? "n/a" : `${(metrics.evaluatedAccuracy * 100).toFixed(2)}%`}`,
    `Availability: ${metrics.availabilityRate === null ? "n/a" : `${(metrics.availabilityRate * 100).toFixed(2)}%`}`,
    `Latest JSON: ${paths.jsonPath}`,
    `Latest Markdown: ${paths.markdownPath}`,
    `Preserved JSON: ${paths.runJsonPath}`,
    `Preserved Markdown: ${paths.runMarkdownPath}`,
  ].join("\n"));
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
