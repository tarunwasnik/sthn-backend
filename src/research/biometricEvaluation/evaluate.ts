/** Pure, score-only offline evaluation. Never imports workers, policy or model runtime. */
import { z } from "zod";
import { scoreSummary } from "../../evaluation/sfaceCalibration.service";
import { Manifest, validateManifest } from "./manifest";

const scoredCapture = z.discriminatedUnion("status", [
  z.object({ status: z.literal("SCORED"), score: z.number().finite().min(-1).max(1) }).strict(),
  z.object({ status: z.enum(["ACQUISITION_FAILURE", "QUALITY_FAILURE", "TECHNICAL_FAILURE"]) }).strict(),
]);
const result = z.object({
  sampleId: z.string(), captures: z.array(scoredCapture).length(5),
  enrollment: z.enum(["ENROLLED", "FAILURE", "NOT_ATTEMPTED"]),
  workflow: z.enum(["ACCEPTED", "REJECTED", "REVIEW", "INCONCLUSIVE", "NOT_MEASURED"]),
}).strict();
const pad = z.object({ presentationId: z.string(), outcome: z.enum(["BONA_FIDE", "ATTACK", "NO_RESPONSE", "NOT_RUN"]) }).strict();
const resultsSchema = z.object({ samples: z.array(result), presentations: z.array(pad) }).strict();
type Results = z.infer<typeof resultsSchema>;
type SampleResult = Results["samples"][number];
type Metric = { numerator: number; denominator: number; value: number | null };
const rate = (numerator: number, denominator: number): Metric => ({ numerator, denominator, value: denominator ? numerator / denominator : null });
const score = (s: SampleResult): number | null => {
  const values = s.captures.flatMap(c => c.status === "SCORED" ? [c.score] : []);
  return values.length >= 3 ? scoreSummary(values).median : null;
};

function aggregate(manifest: Manifest, results: Results, thresholds: number[]) {
  const sampleMap = new Map(results.samples.map(r => [r.sampleId, r]));
  const padMap = new Map(results.presentations.map(r => [r.presentationId, r]));
  const matched = manifest.samples.map(s => ({ ...s, result: sampleMap.get(s.id) }));
  const labeledScores = matched.flatMap(s => {
    if (!s.result || !s.truth) return [];
    const value = score(s.result);
    return value === null ? [] : [{ truth: s.truth, value }];
  });
  const captures = matched.flatMap(s => s.result?.captures ?? []);
  const comparisonScores = matched.flatMap(s => !s.truth || !s.result ? [] : s.result.captures.flatMap(c => c.status === "SCORED" ? [{ truth: s.truth, value: c.score }] : []));
  const workflows = matched.filter(s => s.result && s.result.workflow !== "NOT_MEASURED");
  const outcomeCount = (truth: "GENUINE" | "IMPOSTOR", outcome: string) => workflows.filter(s => s.truth === truth && s.result?.workflow === outcome).length;
  const workflowCount = (truth: "GENUINE" | "IMPOSTOR") => workflows.filter(s => s.truth === truth).length;
  const enrolled = matched.filter(s => s.result && s.result.enrollment !== "NOT_ATTEMPTED");
  const pads = manifest.presentations.map(p => ({ ...p, outcome: padMap.get(p.id)?.outcome ?? "NOT_RUN" }));
  const padMetric = (truth: "ATTACK" | "BONA_FIDE", wrong: "BONA_FIDE" | "ATTACK", instrument?: string) => {
    const relevant = pads.filter(p => p.truth === truth && (instrument === undefined || p.instrument === instrument) && (p.outcome === "ATTACK" || p.outcome === "BONA_FIDE"));
    return rate(relevant.filter(p => p.outcome === wrong).length, relevant.length);
  };
  return {
    counts: { plannedSessions: matched.length, missingSessionResults: matched.filter(s => !s.result).length,
      unlabeledSessions: matched.filter(s => !s.truth).length, scoredSessions: labeledScores.length,
      insufficientScoredCaptures: matched.filter(s => s.result && score(s.result) === null).length,
      captureAcquisitionFailures: captures.filter(c => c.status === "ACQUISITION_FAILURE").length,
      captureQualityFailures: captures.filter(c => c.status === "QUALITY_FAILURE").length,
      captureTechnicalFailures: captures.filter(c => c.status === "TECHNICAL_FAILURE").length },
    component: {
      unit: "SESSION_MEDIAN_AVATAR_TO_CAPTURE_COSINE_MINIMUM_3_OF_5" as const,
      genuine: scoreSummary(labeledScores.filter(s => s.truth === "GENUINE").map(s => s.value)),
      impostor: scoreSummary(labeledScores.filter(s => s.truth === "IMPOSTOR").map(s => s.value)),
      individualComparisons: {
        genuine: scoreSummary(comparisonScores.filter(s => s.truth === "GENUINE").map(s => s.value)),
        impostor: scoreSummary(comparisonScores.filter(s => s.truth === "IMPOSTOR").map(s => s.value)),
        tradeoffs: thresholds.map(threshold => {
          const genuine = comparisonScores.filter(s => s.truth === "GENUINE"); const impostor = comparisonScores.filter(s => s.truth === "IMPOSTOR");
          return { threshold, fmr: rate(impostor.filter(s => s.value >= threshold).length, impostor.length), fnmr: rate(genuine.filter(s => s.value < threshold).length, genuine.length) };
        }),
      },
      tradeoffs: thresholds.map(threshold => {
        const genuine = labeledScores.filter(s => s.truth === "GENUINE"); const impostor = labeledScores.filter(s => s.truth === "IMPOSTOR");
        return { threshold, fmr: rate(impostor.filter(s => s.value >= threshold).length, impostor.length), fnmr: rate(genuine.filter(s => s.value < threshold).length, genuine.length) };
      }),
    },
    acquisition: { failureToAcquire: rate(captures.filter(c => c.status === "ACQUISITION_FAILURE").length, captures.length),
      failureToEnroll: rate(enrolled.filter(s => s.result?.enrollment === "FAILURE").length, enrolled.length) },
    workflow: { measuredAttempts: workflows.length,
      far: rate(outcomeCount("IMPOSTOR", "ACCEPTED"), workflowCount("IMPOSTOR")),
      frr: rate(outcomeCount("GENUINE", "REJECTED"), workflowCount("GENUINE")),
      review: rate(workflows.filter(s => s.result?.workflow === "REVIEW").length, workflows.length),
      inconclusive: rate(workflows.filter(s => s.result?.workflow === "INCONCLUSIVE").length, workflows.length) },
    pad: { planned: pads.length, notRun: pads.filter(p => p.outcome === "NOT_RUN").length,
      noResponse: pads.filter(p => p.outcome === "NO_RESPONSE").length,
      unlabeled: pads.filter(p => p.truth === null).length,
      apcer: padMetric("ATTACK", "BONA_FIDE"), bpcer: padMetric("BONA_FIDE", "ATTACK"),
      byInstrument: Object.fromEntries(["PRINT", "SCREEN", "REPLAY", "OTHER", "UNKNOWN"].map(i => [i, padMetric("ATTACK", "BONA_FIDE", i)])) },
  };
}

/** Throws generic errors only, to avoid echoing private manifest content. */
export function evaluateOffline(input: unknown, rawResults: unknown, thresholds: unknown, asOf: string) {
  const manifest = validateManifest(input, asOf);
  const parsed = resultsSchema.safeParse(rawResults);
  const grid = z.array(z.number().finite().min(-1).max(1)).min(1).max(100).safeParse(thresholds);
  if (!parsed.success || !grid.success) throw new Error("INVALID_EVALUATION_INPUT");
  const results = parsed.data;
  const verifyIds = (expected: string[], actual: string[]) => {
    const allowed = new Set(expected);
    if (new Set(actual).size !== actual.length || actual.some(id => !allowed.has(id))) throw new Error("INVALID_RESULT_REFERENCE");
  };
  verifyIds(manifest.samples.map(s => s.id), results.samples.map(s => s.sampleId));
  verifyIds(manifest.presentations.map(p => p.id), results.presentations.map(p => p.presentationId));
  const by = (dimension: "target" | "device" | "lighting" | "quality", value: string) => {
    const samples = manifest.samples.filter(s => dimension === "target" ? s.target === value : s.conditions[dimension] === value);
    // Only aggregate matching rows, never identifiers or arbitrary metadata.
    const ids = new Set(samples.map(s => s.id));
    return aggregate({ ...manifest, samples, presentations: [] }, { samples: results.samples.filter(s => ids.has(s.sampleId)), presentations: [] }, grid.data);
  };
  return {
    schemaVersion: "STHN_BIOMETRIC_EVAL_REPORT_V1" as const,
    interpretation: "RESEARCH_ONLY_NO_PRODUCTION_DECISIONS" as const,
    total: aggregate(manifest, results, grid.data),
    breakdown: {
      target: Object.fromEntries(["USER", "CREATOR"].map(v => [v, by("target", v)])),
      device: Object.fromEntries(["PHONE", "WEBCAM", "OTHER", "UNKNOWN"].map(v => [v, by("device", v)])),
      lighting: Object.fromEntries(["NORMAL", "LOW", "BRIGHT", "BACKLIT", "OTHER", "UNKNOWN"].map(v => [v, by("lighting", v)])),
      quality: Object.fromEntries(["NORMAL", "LOW", "OCCLUDED", "OTHER", "UNKNOWN"].map(v => [v, by("quality", v)])),
    },
  };
}
