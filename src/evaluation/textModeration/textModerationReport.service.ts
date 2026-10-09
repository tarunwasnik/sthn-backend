import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  EvaluationMetricSlice,
  FixtureEvaluationResult,
  TextModerationEvaluationReport,
} from "./textModerationEvaluation.types";

const percentage = (value: number | null) => value === null ? "n/a" : `${(value * 100).toFixed(2)}%`;
const tableCell = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
const isMissOrFailure = ({ outcome }: FixtureEvaluationResult) =>
  !["CORRECT_ALLOW", "CORRECT_BLOCK"].includes(outcome);

const providerHighlights = (result: FixtureEvaluationResult) => {
  const labels = result.raw?.labels ?? [];
  const flagged = result.raw?.metadata?.overallFlagged;
  const flaggedLabels = labels.filter((label) => label.flagged === true);
  const relevant = labels.filter((label) => typeof label.score === "number");
  const categories = flaggedLabels.map(({ name }) => name).join(", ") || "none";
  const scores = relevant.map(({ name, score }) => `${name}=${score?.toFixed(6) ?? "n/a"}`).join(", ") || "n/a";
  const summary = result.raw?.summary ? `; native=${result.raw.summary}` : "";
  return `flagged=${typeof flagged === "boolean" ? flagged : "n/a"}; categories=${categories}; scores=${scores}${summary}`;
};

const percentile = (values: readonly number[], quantile: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(quantile * sorted.length) - 1);
  return sorted[Math.max(0, index)];
};

const diagnosticScoreDistribution = (results: readonly FixtureEvaluationResult[]) => {
  const groups: readonly [string, readonly FixtureEvaluationResult[]][] = [
    ["EXPECTED_ALLOW", results.filter(({ fixture }) => fixture.expectedDecision === "ALLOW")],
    ["EXPECTED_BLOCK", results.filter(({ fixture }) => fixture.expectedDecision === "BLOCK")],
    ["ACTUAL_ALLOW", results.filter(({ providerDecision }) => providerDecision === "ALLOW")],
    ["ACTUAL_BLOCK", results.filter(({ providerDecision }) => providerDecision === "BLOCK")],
  ];
  const rows = groups.map(([name, values]) => {
    const scores = values.flatMap(({ raw }) => {
      const score = raw?.metadata?.diagnosticToxicProbability;
      return typeof score === "number" && Number.isFinite(score) ? [score] : [];
    });
    const average = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
    return `| ${name} | ${scores.length} | ${scores.length ? Math.min(...scores).toFixed(6) : "n/a"} | ${average?.toFixed(6) ?? "n/a"} | ${percentile(scores, 0.5)?.toFixed(6) ?? "n/a"} | ${percentile(scores, 0.95)?.toFixed(6) ?? "n/a"} | ${scores.length ? Math.max(...scores).toFixed(6) : "n/a"} |`;
  });
  if (rows.every((row) => row.includes("| 0 |"))) return "No diagnostic toxic-probability metadata was returned.";
  return [
    "Diagnostic only; the provider decision rule remains authoritative.",
    "",
    "| Group | Count | Minimum | Average | P50 | P95 | Maximum |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows,
  ].join("\n");
};

const breakdownTable = (values: Readonly<Record<string, EvaluationMetricSlice>>) => [
  "| Group | Total | Evaluated | Correct | FP | FN | Unavailable/Error | Accuracy |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...Object.entries(values).map(([name, metric]) =>
    `| ${tableCell(name)} | ${metric.total} | ${metric.evaluated} | ${metric.correct} | ${metric.falsePositive} | ${metric.falseNegative} | ${metric.unavailableOrError} | ${percentage(metric.evaluatedAccuracy)} |`,
  ),
].join("\n");

const findingsTable = (results: readonly FixtureEvaluationResult[]) => results.length
  ? [
      "| Fixture | Domain / target | Text | Expected / actual | STHN category | Difficulty | Language | Tags | Near pair | STHN reason | Latency ms | Provider highlights |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- |",
      ...results.map((result) => `| ${result.fixture.id} | ${result.fixture.domain} / ${result.fixture.target} | ${tableCell(result.fixture.text)} | ${result.fixture.expectedDecision} / ${result.providerDecision ?? result.providerStatus} | ${result.fixture.expectedCategory ?? "none"} | ${result.fixture.difficulty} | ${result.fixture.language} | ${result.fixture.tags.join(", ")} | ${result.fixture.nearPairGroup ?? "none"} | ${tableCell(result.fixture.policyReason)} | ${result.latencyMs.toFixed(3)} | ${tableCell(providerHighlights(result))} |`),
    ].join("\n")
  : "None.";

const nearPairTable = (results: readonly FixtureEvaluationResult[]) => {
  const groups = new Map<string, FixtureEvaluationResult[]>();
  for (const result of results) {
    const group = result.fixture.nearPairGroup;
    if (group) groups.set(group, [...(groups.get(group) ?? []), result]);
  }
  return [
    "| Group | ALLOW fixture / result / scores | BLOCK fixture / result / scores | Pair outcome |",
    "| --- | --- | --- | --- |",
    ...[...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([group, values]) => {
      const allow = values.find(({ fixture }) => fixture.expectedDecision === "ALLOW");
      const block = values.find(({ fixture }) => fixture.expectedDecision === "BLOCK");
      const allowDecision = allow?.providerDecision ?? allow?.providerStatus ?? "MISSING";
      const blockDecision = block?.providerDecision ?? block?.providerStatus ?? "MISSING";
      const outcome = allowDecision === "ALLOW" && blockDecision === "BLOCK" ? "BOTH_CORRECT"
        : allowDecision === "BLOCK" && blockDecision === "BLOCK" ? "BLOCKED_BOTH"
        : allowDecision === "ALLOW" && blockDecision === "ALLOW" ? "ALLOWED_BOTH"
        : "MIXED_OR_UNAVAILABLE";
      return `| ${group} | ${allow?.fixture.id ?? "missing"} / ${allowDecision} / ${allow ? tableCell(providerHighlights(allow)) : "n/a"} | ${block?.fixture.id ?? "missing"} / ${blockDecision} / ${block ? tableCell(providerHighlights(block)) : "n/a"} | ${outcome} |`;
    }),
  ].join("\n");
};

const profanitySummary = (results: readonly FixtureEvaluationResult[]) => {
  const profanity = results.filter(({ fixture }) => fixture.tags.includes("profanity"));
  const correctAllow = profanity.filter(({ outcome }) => outcome === "CORRECT_ALLOW").length;
  const correctBlock = profanity.filter(({ outcome }) => outcome === "CORRECT_BLOCK").length;
  const falsePositive = profanity.filter(({ outcome }) => outcome === "FALSE_POSITIVE").length;
  const falseNegative = profanity.filter(({ outcome }) => outcome === "FALSE_NEGATIVE").length;
  const misses = profanity.filter(isMissOrFailure).map(({ fixture }) => fixture.id);
  return `- Total profanity-tagged: ${profanity.length}\n- ALLOW correct: ${correctAllow}\n- BLOCK correct: ${correctBlock}\n- False positives: ${falsePositive}\n- False negatives: ${falseNegative}\n- Misses/failures: ${misses.join(", ") || "none"}`;
};

const nativeLabelTable = (results: readonly FixtureEvaluationResult[]) => {
  const names = [...new Set(results.flatMap(({ raw }) => (raw?.labels ?? []).map(({ name }) => name)))];
  if (!names.length) return "No native label scores were returned.";
  return [
    "| Native label | Scored fixtures | Average | Minimum | Maximum | Decision crossings | Scores >= 0.50 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...names.map((name) => {
      const labels = results.flatMap(({ raw }) => (raw?.labels ?? []).filter((label) => label.name === name));
      const scores = labels.flatMap(({ score }) => typeof score === "number" ? [score] : []);
      const average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
      return `| ${tableCell(name)} | ${scores.length} | ${average?.toFixed(6) ?? "n/a"} | ${scores.length ? Math.min(...scores).toFixed(6) : "n/a"} | ${scores.length ? Math.max(...scores).toFixed(6) : "n/a"} | ${labels.filter(({ flagged }) => flagged === true).length} | ${scores.filter((score) => score >= 0.5).length} |`;
    }),
  ].join("\n");
};

export const renderTextModerationMarkdownReport = (report: TextModerationEvaluationReport) => {
  const { metrics } = report;
  const providerMetadata = report.provider.metadata
    ? Object.entries(report.provider.metadata).map(([key, value]) => `- ${key}: ${value}`).join("\n")
    : "- none";
  return `# STHN Text Moderation Evaluation

- Schema: ${report.schemaVersion}
- Run ID: ${report.runId}
- Generated: ${report.generatedAt}
- Provider: ${report.provider.displayName} (${report.provider.id})
- Requested model: ${report.provider.requestedModel ?? "n/a"}
- Actual model(s): ${report.provider.actualModels.join(", ") || "n/a"}
- Fixture version: ${report.fixture.version}
- Total fixtures: ${metrics.total}
- Evaluated: ${metrics.evaluated}
- Correct: ${metrics.correct} (${percentage(metrics.evaluatedAccuracy)} evaluated accuracy)
- Availability: ${percentage(metrics.availabilityRate)}
- Correct ALLOW: ${metrics.correctAllow}; false positives: ${metrics.falsePositive} (${percentage(metrics.falsePositiveRate)})
- Correct BLOCK: ${metrics.correctBlock}; false negatives: ${metrics.falseNegative} (${percentage(metrics.falseNegativeRate)})
- Unavailable: ${metrics.unavailable}; errors: ${metrics.error}
- Average latency: ${metrics.averageLatencyMs?.toFixed(3) ?? "n/a"} ms
- P50 latency: ${metrics.p50LatencyMs?.toFixed(3) ?? "n/a"} ms
- P95 latency: ${metrics.p95LatencyMs?.toFixed(3) ?? "n/a"} ms
- Maximum latency: ${metrics.maxLatencyMs?.toFixed(3) ?? "n/a"} ms
- Total fixture run time: ${metrics.totalRunTimeMs.toFixed(3)} ms

## Provider and runtime metadata

${providerMetadata}

## False positives

${findingsTable(report.falsePositives)}

## False negatives

${findingsTable(report.falseNegatives)}

## Unavailable and errors

${findingsTable(report.unavailableOrErrors)}

## Near-pair results

${nearPairTable(report.results)}

## Profanity-focused results

${profanitySummary(report.results)}

### All profanity-tagged fixtures

${findingsTable(report.results.filter(({ fixture }) => fixture.tags.includes("profanity")))}

## Native label behavior

${nativeLabelTable(report.results)}

## Diagnostic toxic-score distributions

${diagnosticScoreDistribution(report.results)}

## Multilingual misses and failures

${findingsTable(report.results.filter((result) => result.fixture.language !== "en" && isMissOrFailure(result)))}

## Adversarial summary

${metrics.byDifficulty.ADVERSARIAL ? breakdownTable({ ADVERSARIAL: metrics.byDifficulty.ADVERSARIAL }) : "No adversarial fixtures in this run."}

### Adversarial misses and failures

${findingsTable(report.results.filter((result) => result.fixture.difficulty === "ADVERSARIAL" && isMissOrFailure(result)))}

## By difficulty

${breakdownTable(metrics.byDifficulty)}

## By language

${breakdownTable(metrics.byLanguage)}

## By tag

${breakdownTable(metrics.byTag)}

## By expected policy category

${breakdownTable(metrics.byExpectedCategory)}
`;
};

export const writeTextModerationEvaluationReport = async (
  report: TextModerationEvaluationReport,
  outputDirectory: string,
  options: Readonly<{ preserveRun?: boolean }> = {},
) => {
  const resolvedDirectory = path.resolve(outputDirectory);
  await mkdir(resolvedDirectory, { recursive: true });
  const jsonPath = path.join(resolvedDirectory, "latest.json");
  const markdownPath = path.join(resolvedDirectory, "latest.md");
  const writes = [
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, renderTextModerationMarkdownReport(report), "utf8"),
  ];
  let runJsonPath: string | undefined;
  let runMarkdownPath: string | undefined;
  if (options.preserveRun) {
    const safeRunId = report.runId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 120);
    const runsDirectory = path.join(resolvedDirectory, "runs");
    await mkdir(runsDirectory, { recursive: true });
    runJsonPath = path.join(runsDirectory, `${safeRunId}.json`);
    runMarkdownPath = path.join(runsDirectory, `${safeRunId}.md`);
    writes.push(
      writeFile(runJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
      writeFile(runMarkdownPath, renderTextModerationMarkdownReport(report), "utf8"),
    );
  }
  await Promise.all(writes);
  return { jsonPath, markdownPath, runJsonPath, runMarkdownPath };
};
