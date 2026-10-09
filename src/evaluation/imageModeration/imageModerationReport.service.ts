import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ImageModerationEvaluationReport, MetricSlice } from "./imageModerationEvaluation.types";
const pct = (value: number | null) => value === null ? "n/a" : `${(value * 100).toFixed(2)}%`;
const table = (values: Readonly<Record<string, MetricSlice>>) => ["| Group | Total | Supported | Correct | Incorrect | Unsupported | FP | FN | Accuracy |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |", ...Object.entries(values).map(([name, metric]) => `| ${name} | ${metric.total} | ${metric.supported} | ${metric.correct} | ${metric.incorrect} | ${metric.unsupported} | ${metric.falsePositive} | ${metric.falseNegative} | ${pct(metric.accuracy)} |`)].join("\n");
export const renderImageModerationMarkdownReport = (report: ImageModerationEvaluationReport) => {
  const m = report.metrics; return `# STHN Image Moderation Evaluation

- Schema: ${report.schemaVersion}
- Run ID: ${report.runId}
- Generated: ${report.generatedAt}
- Fixture version: ${report.fixture.version}
- Detector: ${report.detector.displayName} (${report.detector.id}@${report.detector.version})
- Capabilities: ${report.detector.capabilities.join(", ")}
- Cases: ${m.total}; supported: ${m.supported}; unsupported: ${m.unsupported}
- Correct: ${m.correct}; incorrect: ${m.incorrect}; accuracy: ${pct(m.accuracy)}
- False positives: ${m.falsePositive} (${pct(m.falsePositiveRate)}); false negatives: ${m.falseNegative} (${pct(m.falseNegativeRate)})
- Latency: average ${m.performance.averageInferenceMs?.toFixed(3) ?? "n/a"} ms; p95 ${m.performance.p95InferenceMs?.toFixed(3) ?? "n/a"} ms; >=30s ${m.performance.exceedsThirtySecondBoundaryCount}
- Cold start: ${m.performance.coldStartMs?.toFixed(3) ?? "n/a"} ms; model artifact bytes: ${m.performance.modelArtifactBytes ?? "n/a"}

## By capability

${table(m.byCapability)}

## By expected category

${table(m.byCategory)}

## By difficulty

${table(m.byDifficulty)}

## By surface

${table(m.bySurface)}

## Results

| Fixture | Surface | Expected | Actual | Outcome | Categories | Latency ms |
| --- | --- | --- | --- | --- | --- | ---: |
${report.results.map((result) => `| ${result.fixtureId} | ${result.surface} | ${result.expectedDecision} | ${result.actualDecision ?? result.providerStatus} | ${result.outcome} | ${result.actualCategories.join(", ") || "none"} | ${result.latencyMs.toFixed(3)} |`).join("\n")}
`;
};
export const writeImageModerationEvaluationReport = async (report: ImageModerationEvaluationReport, outputDirectory: string) => {
  const directory = path.resolve(outputDirectory); await mkdir(directory, { recursive: true });
  const jsonPath = path.join(directory, "latest.json"); const markdownPath = path.join(directory, "latest.md");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"), writeFile(markdownPath, renderImageModerationMarkdownReport(report), "utf8")]);
  return { jsonPath, markdownPath };
};
