import { E5SemanticSimilarityAdapter, semanticCosineSimilarity } from "./e5SemanticSimilarityAdapter";
import {
  E5_CALIBRATION_PAIR_CLASSES, E5CalibrationPair, E5CalibrationPairClass, E5ExpectedRelationship,
  e5SemanticCalibrationCorpus, E5_SEMANTIC_CALIBRATION_CORPUS_DIGEST, E5_SEMANTIC_CALIBRATION_CORPUS_VERSION, e5SemanticCalibrationCorpusDigest,
} from "./e5SemanticCalibrationCorpus";

export const E5_PREFIX_CALIBRATION_VERSION = "STHN_E5_SYMMETRIC_PREFIX_CALIBRATION_V1" as const;
export const E5_PREFIX_POLICIES = ["PASSAGE_PASSAGE", "QUERY_QUERY", "QUERY_PASSAGE_BIDIRECTIONAL_MEAN"] as const;
export const E5_SELECTED_SYMMETRIC_PREFIX_POLICY = "QUERY_PASSAGE_BIDIRECTIONAL_MEAN" as const;
export const E5_SELECTED_PREFIX_POLICY_VERSION = "STHN_E5_SYMMETRIC_QUERY_PASSAGE_BIDIRECTIONAL_MEAN_V1" as const;
export type E5PrefixPolicy = typeof E5_PREFIX_POLICIES[number];
export interface DistributionStatistics { readonly count: number; readonly minimum: number; readonly maximum: number; readonly mean: number; readonly median: number; readonly p10: number; readonly p90: number; }
export interface E5CalibrationScoredPair extends Omit<E5CalibrationPair, "left" | "right"> { readonly similarity: number; }
export interface E5PrefixPolicyResult {
  readonly policy: E5PrefixPolicy; readonly statisticsByClass: Readonly<Record<E5CalibrationPairClass, DistributionStatistics>>;
  readonly equivalentStatistics: DistributionStatistics; readonly distinctStatistics: DistributionStatistics;
  readonly orderingAccuracy: number; readonly medianSeparation: number; readonly scores: readonly E5CalibrationScoredPair[];
}
export interface E5CalibrationResult {
  readonly version: typeof E5_PREFIX_CALIBRATION_VERSION; readonly corpusVersion: typeof E5_SEMANTIC_CALIBRATION_CORPUS_VERSION;
  readonly corpusDigest: string; readonly pairCount: number; readonly policyResults: readonly E5PrefixPolicyResult[];
  readonly selectedPolicy: E5PrefixPolicy; readonly selectionRule: string;
}

const percentile = (sorted: readonly number[], fraction: number): number => {
  const position = (sorted.length - 1) * fraction; const lower = Math.floor(position); const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};
export const distributionStatistics = (values: readonly number[]): DistributionStatistics => {
  if (!values.length || values.some((value) => !Number.isFinite(value) || value < -1 || value > 1)) throw new Error("Invalid calibration distribution");
  const sorted = [...values].sort((a, b) => a - b); return { count: sorted.length, minimum: sorted[0], maximum: sorted[sorted.length - 1],
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length, median: percentile(sorted, 0.5), p10: percentile(sorted, 0.1), p90: percentile(sorted, 0.9) };
};
const batches = <T>(values: readonly T[], size: number): readonly T[][] => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
const embeddings = async (adapter: E5SemanticSimilarityAdapter, texts: readonly string[], prefix: "query" | "passage"): Promise<Map<string, readonly number[]>> => {
  const result = new Map<string, readonly number[]>(); for (const batch of batches(texts, 16)) {
    const vectors = await adapter.embedBatch(batch, prefix); batch.forEach((text, index) => result.set(text, vectors[index]));
  } return result;
};
const orderingAccuracy = (equivalent: readonly number[], distinct: readonly number[]): number => {
  let ordered = 0; let total = 0; equivalent.forEach((positive) => distinct.forEach((negative) => { total += 1; ordered += positive > negative ? 1 : positive === negative ? 0.5 : 0; }));
  return ordered / total;
};

export const evaluateE5PrefixPolicies = async (adapter: E5SemanticSimilarityAdapter,
  corpus: readonly E5CalibrationPair[] = e5SemanticCalibrationCorpus): Promise<E5CalibrationResult> => {
  if (!corpus.length || new Set(corpus.map((pair) => pair.id)).size !== corpus.length || E5_CALIBRATION_PAIR_CLASSES.some((pairClass) => !corpus.some((pair) => pair.pairClass === pairClass))) throw new Error("Invalid E5 calibration corpus");
  await adapter.initialize(); const texts = [...new Set(corpus.flatMap((pair) => [pair.left, pair.right]))].sort();
  const [query, passage] = await Promise.all([embeddings(adapter, texts, "query"), embeddings(adapter, texts, "passage")]);
  const score = (pair: E5CalibrationPair, policy: E5PrefixPolicy): number => {
    if (policy === "QUERY_QUERY") return semanticCosineSimilarity(query.get(pair.left)!, query.get(pair.right)!);
    if (policy === "PASSAGE_PASSAGE") return semanticCosineSimilarity(passage.get(pair.left)!, passage.get(pair.right)!);
    return (semanticCosineSimilarity(query.get(pair.left)!, passage.get(pair.right)!) + semanticCosineSimilarity(query.get(pair.right)!, passage.get(pair.left)!)) / 2;
  };
  const policyResults = E5_PREFIX_POLICIES.map((policy): E5PrefixPolicyResult => {
    const scores = corpus.map((pair) => ({ id: pair.id, pairClass: pair.pairClass, languageGroup: pair.languageGroup,
      expectedRelationship: pair.expectedRelationship, similarity: score(pair, policy) }));
    const byRelationship = (relationship: E5ExpectedRelationship) => scores.filter((item) => item.expectedRelationship === relationship).map((item) => item.similarity);
    const equivalent = byRelationship("EQUIVALENT"); const distinct = byRelationship("DISTINCT");
    const statisticsByClass = Object.fromEntries(E5_CALIBRATION_PAIR_CLASSES.map((pairClass) => [pairClass,
      distributionStatistics(scores.filter((item) => item.pairClass === pairClass).map((item) => item.similarity))])) as Readonly<Record<E5CalibrationPairClass, DistributionStatistics>>;
    const equivalentStatistics = distributionStatistics(equivalent); const distinctStatistics = distributionStatistics(distinct);
    return { policy, statisticsByClass, equivalentStatistics, distinctStatistics, orderingAccuracy: orderingAccuracy(equivalent, distinct),
      medianSeparation: equivalentStatistics.median - distinctStatistics.median, scores };
  });
  const selected = [...policyResults].sort((left, right) => right.orderingAccuracy - left.orderingAccuracy || right.medianSeparation - left.medianSeparation
    || left.policy.localeCompare(right.policy))[0];
  const corpusDigest = e5SemanticCalibrationCorpusDigest(); if (corpus === e5SemanticCalibrationCorpus && corpusDigest !== E5_SEMANTIC_CALIBRATION_CORPUS_DIGEST) throw new Error("E5 calibration corpus authority changed");
  if (corpus === e5SemanticCalibrationCorpus && selected.policy !== E5_SELECTED_SYMMETRIC_PREFIX_POLICY) throw new Error("E5 calibrated prefix-policy authority changed");
  return { version: E5_PREFIX_CALIBRATION_VERSION, corpusVersion: E5_SEMANTIC_CALIBRATION_CORPUS_VERSION,
    corpusDigest, pairCount: corpus.length, policyResults, selectedPolicy: selected.policy,
    selectionRule: "maximum equivalent-vs-distinct pairwise ordering accuracy; then median separation; then lexical policy ID" };
};
