import assert from "node:assert/strict";
import test from "node:test";
import { adamCoddCohort, adamCoddEvaluationDecision, classificationBreakdown, confusionMetrics, probabilitySummary } from "../../evaluation/imageModeration/adamCoddFrozenEvaluation";
import { interpretAdamCoddLogits } from "../../evaluation/imageModeration/adamCoddRuntimeAuthority";

test("AdamCodd frozen mapping uses native argmax only", () => {
  assert.equal(adamCoddEvaluationDecision(interpretAdamCoddLogits([1, 0]).nativeClass), "PASS");
  assert.equal(adamCoddEvaluationDecision(interpretAdamCoddLogits([0, 1]).nativeClass), "BLOCK");
  assert.equal(adamCoddCohort("PASS", "BLOCK"), "HUMAN_PASS__MODEL_BLOCK");
});
test("confusion metrics define PASS as negative and BLOCK as positive", () => {
  const rows = [
    { humanDecision: "PASS" as const, evaluationDecision: "PASS" as const, classifications: ["FASHION_PASS"], nsfwProbability: .1 },
    { humanDecision: "PASS" as const, evaluationDecision: "BLOCK" as const, classifications: ["FASHION_PASS"], nsfwProbability: .9 },
    { humanDecision: "BLOCK" as const, evaluationDecision: "PASS" as const, classifications: ["SUGGESTIVE_BLOCK"], nsfwProbability: .2 },
    { humanDecision: "BLOCK" as const, evaluationDecision: "BLOCK" as const, classifications: ["SUGGESTIVE_BLOCK"], nsfwProbability: .8 },
  ]; const metrics = confusionMetrics(rows);
  assert.deepEqual([metrics.tn, metrics.fp, metrics.fn, metrics.tp], [1, 1, 1, 1]); assert.equal(metrics.blockRecall, .5); assert.equal(metrics.passSpecificity, .5); assert.equal(metrics.blockF1, .5);
  const breakdown = classificationBreakdown(rows); assert.equal(breakdown.FASHION_PASS.passRate, .5); assert.equal(breakdown.SUGGESTIVE_BLOCK.blockRecall, .5);
});
test("probability summaries are bounded and deterministic", () => {
  assert.deepEqual(probabilitySummary([.1, .2, .8, .9]), { count: 4, min: .1, mean: .5, median: .2, p25: .1, p75: .8, p90: .9, p95: .9, max: .9 });
  assert.throws(() => probabilitySummary([1.1]));
});
