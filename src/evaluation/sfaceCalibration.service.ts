import { z } from "zod";
import { CalibrationManifest, CalibrationSampleResult, ThresholdMetrics } from "./sfaceCalibration.types";

const label = z.enum(["MATCH", "NON_MATCH"]);
const localPath = z.string().min(1).max(512).refine((value) => !/^[a-z][a-z0-9+.-]*:\/\//i.test(value), "Calibration inputs must be local paths");
const sample = z.object({ sampleId: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/), expectedLabel: label, reference: localPath, captures: z.array(localPath).length(5), scenario: z.string().min(1).max(80).optional() });
const manifest = z.object({ schemaVersion: z.literal("STHN_SFACE_CALIBRATION_MANIFEST_V1"), samples: z.array(sample).min(1).max(1_000) });
export const parseCalibrationManifest = (value: unknown): CalibrationManifest => {
  const parsed = manifest.parse(value);
  const ids = new Set<string>();
  for (const item of parsed.samples) { if (ids.has(item.sampleId)) throw new Error("Calibration sampleId values must be unique"); ids.add(item.sampleId); }
  return parsed as CalibrationManifest;
};
const rate = (numerator: number, denominator: number) => denominator ? numerator / denominator : null;
export const defaultThresholdGrid = () => [0.80, 0.82, 0.84, 0.86, 0.88, 0.89, 0.90, 0.91, 0.92, 0.93, 0.94, 0.95];
export const evaluateThresholds = (results: readonly CalibrationSampleResult[], thresholds = defaultThresholdGrid()): ThresholdMetrics[] => thresholds.map((threshold) => {
  if (!Number.isFinite(threshold) || threshold < -1 || threshold > 1) throw new Error("Invalid calibration threshold");
  let truePositive = 0, falsePositive = 0, trueNegative = 0, falseNegative = 0;
  for (const result of results) {
    if (result.status !== "COMPLETED" || result.medianSimilarity === null) continue;
    const approved = result.medianSimilarity >= threshold;
    if (result.expectedLabel === "MATCH") approved ? truePositive++ : falseNegative++;
    else approved ? falsePositive++ : trueNegative++;
  }
  return { threshold, truePositive, falsePositive, trueNegative, falseNegative, genuineAutoApprovalRate: rate(truePositive, truePositive + falseNegative), genuineAdminReviewRate: rate(falseNegative, truePositive + falseNegative), falseAutomaticApprovalRate: rate(falsePositive, falsePositive + trueNegative), nonMatchSafeFallbackRate: rate(trueNegative, falsePositive + trueNegative) };
});
export const scoreSummary = (values: readonly number[]) => {
  if (!values.length) return { count: 0, min: null, max: null, mean: null, median: null, standardDeviation: null };
  const ordered = [...values].sort((a, b) => a - b); const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const median = ordered.length % 2 ? ordered[Math.floor(ordered.length / 2)] : (ordered[ordered.length / 2 - 1] + ordered[ordered.length / 2]) / 2;
  const standardDeviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  return { count: values.length, min: ordered[0], max: ordered[ordered.length - 1], mean, median, standardDeviation };
};
