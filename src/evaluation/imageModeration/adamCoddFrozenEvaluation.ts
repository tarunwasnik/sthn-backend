import { createHash } from "node:crypto";
import type { AdamCoddNativeClass } from "./adamCoddRuntimeAuthority";

export type EvaluationDecision = "PASS" | "BLOCK";
export type AdamCoddEvaluationRow = Readonly<{ humanDecision: EvaluationDecision; evaluationDecision: EvaluationDecision; classifications: readonly string[]; nsfwProbability: number }>;

export const sha256 = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
export const adamCoddEvaluationDecision = (nativeClass: AdamCoddNativeClass): EvaluationDecision => {
  if (nativeClass === "sfw") return "PASS";
  if (nativeClass === "nsfw") return "BLOCK";
  throw new Error("AdamCodd native class is not mapped by the frozen evaluation protocol");
};
export const adamCoddCohort = (humanDecision: EvaluationDecision, evaluationDecision: EvaluationDecision): string => `HUMAN_${humanDecision}__MODEL_${evaluationDecision}`;
export const percentile = (sorted: readonly number[], proportion: number): number => sorted[Math.max(0, Math.ceil(sorted.length * proportion) - 1)];
export const probabilitySummary = (values: readonly number[]) => {
  if (!values.length || values.some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error("Probability summary requires finite [0,1] values");
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, min: sorted[0], mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length, median: percentile(sorted, .5), p25: percentile(sorted, .25), p75: percentile(sorted, .75), p90: percentile(sorted, .9), p95: percentile(sorted, .95), max: sorted[sorted.length - 1] };
};
export const confusionMetrics = (rows: readonly AdamCoddEvaluationRow[]) => {
  const n = (human: EvaluationDecision, model: EvaluationDecision) => rows.filter(row => row.humanDecision === human && row.evaluationDecision === model).length;
  const tn = n("PASS", "PASS"), fp = n("PASS", "BLOCK"), fn = n("BLOCK", "PASS"), tp = n("BLOCK", "BLOCK");
  const div = (a: number, b: number) => b ? a / b : null;
  const recall = div(tp, tp + fn), specificity = div(tn, tn + fp), precision = div(tp, tp + fp), npv = div(tn, tn + fn);
  return { total: rows.length, negativeDefinition: "PASS", positiveDefinition: "BLOCK", humanPassModelPass: tn, humanPassModelBlock: fp, humanBlockModelPass: fn, humanBlockModelBlock: tp, tn, fp, fn, tp, accuracy: div(tn + tp, rows.length), blockRecall: recall, passSpecificity: specificity, blockPrecision: precision, negativePredictiveValue: npv, balancedAccuracy: recall === null || specificity === null ? null : (recall + specificity) / 2, blockF1: precision === null || recall === null || precision + recall === 0 ? null : 2 * precision * recall / (precision + recall) };
};
export const classificationBreakdown = (rows: readonly AdamCoddEvaluationRow[]) => Object.fromEntries([...new Set(rows.flatMap(row => row.classifications))].sort().map(classification => {
  const subset = rows.filter(row => row.classifications.includes(classification)); const pass = subset.filter(row => row.evaluationDecision === "PASS").length; const block = subset.length - pass;
  const agreement = subset.filter(row => row.humanDecision === row.evaluationDecision).length;
  return [classification, { support: subset.length, modelPass: pass, modelBlock: block, agreement, disagreement: subset.length - agreement, agreementRate: agreement / subset.length, blockRecall: classification.endsWith("_BLOCK") ? block / subset.length : null, passRate: classification.endsWith("_PASS") ? pass / subset.length : null }];
}));
