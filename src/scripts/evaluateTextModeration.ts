import path from "node:path";

import { evaluateTextModerationFixtures } from "../evaluation/textModeration/textModerationEvaluation.service";
import { TEXT_MODERATION_FIXTURE_VERSION, textModerationEvaluationFixtures } from "../evaluation/textModeration/textModerationFixtures";
import { DeterministicMockTextModerationProvider } from "../evaluation/textModeration/textModerationMockProvider";
import { writeTextModerationEvaluationReport } from "../evaluation/textModeration/textModerationReport.service";

if (process.env.NODE_ENV === "production") {
  throw new Error("Text moderation evaluation is development-only");
}

const outputFlag = process.argv.indexOf("--output");
const outputDirectory = outputFlag >= 0 && process.argv[outputFlag + 1]
  ? path.resolve(process.argv[outputFlag + 1])
  : path.resolve(process.cwd(), "evaluation-output", "text-moderation");

(async () => {
  const provider = new DeterministicMockTextModerationProvider();
  const report = await evaluateTextModerationFixtures(textModerationEvaluationFixtures, provider, {
    fixtureVersion: TEXT_MODERATION_FIXTURE_VERSION,
  });
  const paths = await writeTextModerationEvaluationReport(report, outputDirectory);
  const { metrics } = report;
  console.log([
    `STHN text moderation evaluation: ${provider.displayName}`,
    `Fixtures: ${metrics.total}; evaluated: ${metrics.evaluated}; unavailable/error: ${metrics.unavailableOrError}`,
    `Correct: ${metrics.correct}; false positives: ${metrics.falsePositive}; false negatives: ${metrics.falseNegative}`,
    `Evaluated accuracy: ${metrics.evaluatedAccuracy === null ? "n/a" : `${(metrics.evaluatedAccuracy * 100).toFixed(2)}%`}`,
    `Availability: ${metrics.availabilityRate === null ? "n/a" : `${(metrics.availabilityRate * 100).toFixed(2)}%`}`,
    `JSON: ${paths.jsonPath}`,
    `Markdown: ${paths.markdownPath}`,
  ].join("\n"));
})().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
