import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import {
  MHS_V2_EXPANSION_ACQUISITION_SHA256,
  MHS_V2_EXPANSION_CANDIDATE_SHA256,
  MhsV2ExpansionAcquisitionArtifact,
  MhsV2ExpansionCandidateArtifact,
  validateMhsV2ExpansionArtifacts,
} from "./mhsV2ExpansionCandidateAcquisition";
import {
  MHS_V2_EXPANSION_CONSOLIDATION_SHA256,
  MhsV2ExpansionConsolidationArtifact,
  validateMhsV2ExpansionConsolidation,
} from "./mhsV2ExpansionConsolidation";
import {
  MHS_V2_REVIEW_UNIVERSE_SHA256,
  MhsV2ReviewUniverseArtifact,
  validateMhsV2ReviewUniverse,
} from "./mhsV2ExpansionReviewerA";
import {
  MHS_V2_COLLISION_ANALYSIS_SHA256,
  MHS_V2_COLLISION_CERTIFICATION_SHA256,
  MHS_V2_COLLISION_POLICY_SHA256,
  MhsV2CollisionAnalysisArtifact,
  MhsV2CollisionCertificationArtifact,
  MhsV2CollisionPolicyArtifact,
  validateMhsV2CollisionAnalysis,
  validateMhsV2CollisionCertification,
  validateMhsV2CollisionPolicy,
} from "./mhsV2HistoricalSplitAnchorCollision";
import {
  MHS_V2_LEAKAGE_COMPONENTS_SHA256,
  MHS_V2_LEAKAGE_GRAPH_ANALYSIS_SHA256,
  MHS_V2_LEAKAGE_GRAPH_CERTIFICATION_SHA256,
  MHS_V2_LEAKAGE_GRAPH_SHA256,
  MhsV2LeakageComponentsArtifact,
  MhsV2LeakageGraphAnalysisArtifact,
  MhsV2LeakageGraphArtifact,
  MhsV2LeakageGraphCertificationArtifact,
  validateMhsV2LeakageGraphArtifacts,
} from "./mhsV2SemanticLeakageGraph";
import {
  MHS_TRAIN_EXPANSION_DESIGN_SHA256,
  MhsTrainExpansionDesign,
  validateMhsTrainExpansionDesign,
} from "./mhsTrainExpansionDesign";
import { MHS_SPLIT_MANIFEST_SHA256, MhsInternalTestFreezeArtifact, validateMhsInternalTestFreezeArtifact } from "./mhsInternalTestFreeze";
import { MhsSplitManifestArtifact, validateMhsSplitManifestArtifact } from "./mhsSplitManifest";
import { MHS_INTERNAL_TEST_FREEZE_SHA256 } from "./mhsV2SemanticCalibrationPolicy";
import {
  PROTECTED_V2_ANALYSIS_SHA256,
  PROTECTED_V2_CERTIFICATION_SHA256,
  PROTECTED_V2_EXCLUSION_SHA256,
  PROTECTED_V2_FINGERPRINT_SHA256,
  ProtectedAnalysisArtifact,
  ProtectedCertificationArtifact,
  ProtectedExclusionArtifact,
  ProtectedFingerprintArtifact,
  validateProtectedV2Artifacts,
} from "../../evaluation/textModeration/protectedV2ContaminationAuthority";

export const MHS_V2_RELEASE_POLICY_VERSION = "MHS_V2_TRAIN_EXPANSION_RELEASE_POLICY_V1" as const;
export const MHS_V2_RELEASE_SEED = "STHN-T6L-7I5-MHS-V2-TRAIN-EXPANSION-RELEASE-V1" as const;
export const MHS_V2_RELEASE_FROZEN_AT = "2026-09-21T18:00:00.000Z" as const;
export const MHS_V2_RELEASE_POLICY_FILENAME = "mhs-v2-train-expansion-release-policy-v1.json" as const;
export const MHS_V2_RELEASE_FEASIBILITY_FILENAME = "mhs-v2-train-expansion-release-feasibility-v1.json" as const;
export const MHS_V2_RELEASE_PLAN_FILENAME = "mhs-v2-train-expansion-release-plan-v1.json" as const;
export const MHS_V2_RELEASE_PROJECTION_FILENAME = "mhs-v2-train-expansion-candidate-release-projection-v1.json" as const;

export const MHS_V2_RELEASE_POLICY_SHA256 = "86e2b3433780d8a683937c4163a919f4c3ab9f1eda8689655bda4d42dd5633df";
export const MHS_V2_RELEASE_POLICY_PAYLOAD_DIGEST = "c472f62b58992c00bcdf2e3c2e2438082f0bcbd4b3546a2afe03326a226241f6";
export const MHS_V2_RELEASE_FEASIBILITY_SHA256 = "ea964eacea21c24939a56f5b5974024fb99ab0a0ec619bf01944ceb1ff4e140e";
export const MHS_V2_RELEASE_FEASIBILITY_PAYLOAD_DIGEST = "c107e6d4c5c9a515c80a06a92bb1fd05aa311d155470071ce0b2cf56c6db7b0b";
export const MHS_V2_RELEASE_PLAN_SHA256 = "0a8d11b68f3e29f06c16e584e30a458b8848d50b53a78637167c2241e74447ad";
export const MHS_V2_RELEASE_PLAN_PAYLOAD_DIGEST = "2c39c17ac4a431875caaf1a6dcfc8eb6db94f612abda77512a1e820a6e5f5a9d";
export const MHS_V2_RELEASE_PROJECTION_SHA256 = "0c9e662f917d4a98e7108d6b30756168de7c5f05dffe4dd2149d0ac1bf3e5407";
export const MHS_V2_RELEASE_PROJECTION_PAYLOAD_DIGEST = "c6728376f7d2eb8e3b985f15cb3be2e2be740e84e867088544861238d4e546a4";

const CQ_COMPONENT_ID = "union_74809df3d5e0e77cc14b025644c2c898f592bd7f25155a58c7a54d2cf82b45c8" as const;
const TRAIN_ANCHOR_COMPONENT_ID = "union_e53063ce5d15b9563c8f7a8876a0b6723c761d1f68ffa2a0f4f6b3786351799c" as const;
const CATEGORIES = ["ABUSIVE_OR_HARASSING", "HATE", "PROFANITY", "SEXUAL", "THREAT_OR_VIOLENCE"] as const;
type RequiredCategory = typeof CATEGORIES[number];
export type ReleaseDisposition = "RELEASED_TO_TRAIN" | "RESEARCH_RESERVE_NOT_RELEASED" | "EXCLUDED_FROM_TRAIN_AND_VALIDATION";

const historicalCategoryCounts: Readonly<Record<RequiredCategory, number>> = { ABUSIVE_OR_HARASSING: 6, HATE: 4, PROFANITY: 3, SEXUAL: 7, THREAT_OR_VIOLENCE: 0 };
const combinedCategoryFloors: Readonly<Record<RequiredCategory, number>> = { ABUSIVE_OR_HARASSING: 18, HATE: 16, PROFANITY: 10, SEXUAL: 18, THREAT_OR_VIOLENCE: 15 };
const requiredV2CategoryMinimums = Object.fromEntries(CATEGORIES.map((category) => [category, combinedCategoryFloors[category] - historicalCategoryCounts[category]])) as Record<RequiredCategory, number>;

const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
const parse = <T>(bytes: Buffer): T => JSON.parse(bytes.toString("utf8")) as T;
const tally = (values: readonly string[]): Readonly<Record<string, number>> => values.reduce<Record<string, number>>((out, value) => { out[value] = (out[value] ?? 0) + 1; return out; }, {});
const choose = (n: number, k: number): bigint => { if (k < 0 || k > n) return 0n; let result = 1n; for (let i = 1; i <= Math.min(k, n - k); i += 1) result = result * BigInt(n - i + 1) / BigInt(i); return result; };

export interface MhsV2ReleaseInputs {
  readonly candidateBytes: Buffer; readonly acquisitionBytes: Buffer; readonly universeBytes: Buffer; readonly designBytes: Buffer; readonly consolidationBytes: Buffer;
  readonly graphBytes: Buffer; readonly componentsBytes: Buffer; readonly graphAnalysisBytes: Buffer; readonly graphCertificationBytes: Buffer;
  readonly collisionPolicyBytes: Buffer; readonly collisionAnalysisBytes: Buffer; readonly collisionCertificationBytes: Buffer;
  readonly historicalSplitBytes: Buffer; readonly internalTestFreezeBytes: Buffer;
  readonly protectedFingerprintBytes: Buffer; readonly protectedAnalysisBytes: Buffer; readonly protectedExclusionBytes: Buffer; readonly protectedCertificationBytes: Buffer;
}

interface VerifiedInputs { readonly consolidation: MhsV2ExpansionConsolidationArtifact; readonly components: MhsV2LeakageComponentsArtifact }
const exact = (bytes: Buffer, expected: string, label: string): void => { if (sha256(bytes) !== expected) throw new Error(`T6L-7I5 ${label} authority mismatch`); };
const verifyInputs = (input: MhsV2ReleaseInputs): VerifiedInputs => {
  exact(input.candidateBytes, MHS_V2_EXPANSION_CANDIDATE_SHA256, "candidate"); exact(input.acquisitionBytes, MHS_V2_EXPANSION_ACQUISITION_SHA256, "acquisition");
  const candidate = parse<MhsV2ExpansionCandidateArtifact>(input.candidateBytes), acquisition = parse<MhsV2ExpansionAcquisitionArtifact>(input.acquisitionBytes); validateMhsV2ExpansionArtifacts(candidate, acquisition);
  exact(input.universeBytes, MHS_V2_REVIEW_UNIVERSE_SHA256, "universe"); validateMhsV2ReviewUniverse(parse<MhsV2ReviewUniverseArtifact>(input.universeBytes));
  exact(input.designBytes, MHS_TRAIN_EXPANSION_DESIGN_SHA256, "expansion design"); const design = parse<MhsTrainExpansionDesign>(input.designBytes); validateMhsTrainExpansionDesign(design);
  if (design.recommendation.futureTrainTotal !== 200 || design.recommendation.newAllowRequired !== 70 || design.recommendation.newBlockRequired !== 70 || !design.validationFreezePolicy.frozenForImmediateExpansion || design.validationFreezePolicy.expandedInThisLineage) throw new Error("T6L-7I5 expansion design policy mismatch");
  exact(input.consolidationBytes, MHS_V2_EXPANSION_CONSOLIDATION_SHA256, "consolidation"); const consolidation = parse<MhsV2ExpansionConsolidationArtifact>(input.consolidationBytes); validateMhsV2ExpansionConsolidation(consolidation);
  exact(input.graphBytes, MHS_V2_LEAKAGE_GRAPH_SHA256, "graph"); exact(input.componentsBytes, MHS_V2_LEAKAGE_COMPONENTS_SHA256, "components"); exact(input.graphAnalysisBytes, MHS_V2_LEAKAGE_GRAPH_ANALYSIS_SHA256, "graph analysis"); exact(input.graphCertificationBytes, MHS_V2_LEAKAGE_GRAPH_CERTIFICATION_SHA256, "graph certification");
  const graph = parse<MhsV2LeakageGraphArtifact>(input.graphBytes), components = parse<MhsV2LeakageComponentsArtifact>(input.componentsBytes), graphAnalysis = parse<MhsV2LeakageGraphAnalysisArtifact>(input.graphAnalysisBytes), graphCertification = parse<MhsV2LeakageGraphCertificationArtifact>(input.graphCertificationBytes); validateMhsV2LeakageGraphArtifacts(graph, components, graphAnalysis, graphCertification);
  exact(input.collisionPolicyBytes, MHS_V2_COLLISION_POLICY_SHA256, "CQ policy"); exact(input.collisionAnalysisBytes, MHS_V2_COLLISION_ANALYSIS_SHA256, "CQ analysis"); exact(input.collisionCertificationBytes, MHS_V2_COLLISION_CERTIFICATION_SHA256, "CQ certification"); validateMhsV2CollisionPolicy(parse<MhsV2CollisionPolicyArtifact>(input.collisionPolicyBytes)); validateMhsV2CollisionAnalysis(parse<MhsV2CollisionAnalysisArtifact>(input.collisionAnalysisBytes)); validateMhsV2CollisionCertification(parse<MhsV2CollisionCertificationArtifact>(input.collisionCertificationBytes));
  exact(input.historicalSplitBytes, MHS_SPLIT_MANIFEST_SHA256, "historical split"); validateMhsSplitManifestArtifact(parse<MhsSplitManifestArtifact>(input.historicalSplitBytes)); exact(input.internalTestFreezeBytes, MHS_INTERNAL_TEST_FREEZE_SHA256, "INTERNAL_TEST freeze"); validateMhsInternalTestFreezeArtifact(parse<MhsInternalTestFreezeArtifact>(input.internalTestFreezeBytes));
  exact(input.protectedFingerprintBytes, PROTECTED_V2_FINGERPRINT_SHA256, "protected fingerprint"); exact(input.protectedAnalysisBytes, PROTECTED_V2_ANALYSIS_SHA256, "protected analysis"); exact(input.protectedExclusionBytes, PROTECTED_V2_EXCLUSION_SHA256, "protected exclusion"); exact(input.protectedCertificationBytes, PROTECTED_V2_CERTIFICATION_SHA256, "protected certification");
  const protectedAnalysis = parse<ProtectedAnalysisArtifact>(input.protectedAnalysisBytes), protectedExclusion = parse<ProtectedExclusionArtifact>(input.protectedExclusionBytes), protectedCertification = parse<ProtectedCertificationArtifact>(input.protectedCertificationBytes); validateProtectedV2Artifacts(parse<ProtectedFingerprintArtifact>(input.protectedFingerprintBytes), protectedAnalysis, protectedExclusion, protectedCertification);
  if (protectedAnalysis.counts.directlyContaminatedCandidates || protectedAnalysis.counts.contaminatedComponents || protectedExclusion.excludedCandidateCount || protectedExclusion.components.length) throw new Error("T6L-7I5 protected contamination is nonzero");
  if (consolidation.rows.length !== 400 || components.components.length !== 393) throw new Error("T6L-7I5 universe census mismatch");
  return { consolidation, components };
};

interface SelectableComponent { readonly componentId: string; readonly memberCandidateIds: readonly string[]; readonly memberCount: number; readonly allow: number; readonly block: number; readonly categories: Readonly<Record<string, number>>; readonly rank: string; readonly componentDigest: string; readonly anchor: boolean; readonly excluded: boolean }
const componentSurface = (verified: VerifiedInputs): readonly SelectableComponent[] => verified.components.components.map((component) => ({ componentId: component.componentId, memberCandidateIds: component.memberCandidateIds, memberCount: component.memberCount, allow: component.decisionComposition.ALLOW ?? 0, block: component.decisionComposition.BLOCK ?? 0, categories: component.primaryCategoryComposition, rank: digest([MHS_V2_RELEASE_SEED, component.componentId]), componentDigest: component.componentDigest, anchor: component.componentId === TRAIN_ANCHOR_COMPONENT_ID, excluded: component.componentId === CQ_COMPONENT_ID || component.collisionQuarantine })).sort((a, b) => a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.componentId < b.componentId ? -1 : 1);

interface Selection { readonly componentIds: readonly string[]; readonly exactSolutionCount: string; readonly reachableQuotaStateCount: number }
const selectionKey = (selected: readonly SelectableComponent[]): string => canonicalJson([...selected].sort((a, b) => a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.componentId.localeCompare(b.componentId)).map((component) => [component.rank, component.componentId]));
const selectRelease = (components: readonly SelectableComponent[]): Selection => {
  const excluded = components.filter((component) => component.excluded), anchor = components.filter((component) => component.anchor);
  if (excluded.length !== 1 || excluded[0].componentId !== CQ_COMPONENT_ID || excluded[0].memberCount !== 4 || anchor.length !== 1 || anchor[0].excluded) throw new Error("T6L-7I5 exclusion or TRAIN anchor mismatch");
  const optionalNonSingleton = components.filter((component) => !component.excluded && !component.anchor && component.memberCount > 1);
  if (optionalNonSingleton.length > 20) throw new Error("T6L-7I5 bounded component enumeration exceeded");
  const singletons = components.filter((component) => !component.excluded && !component.anchor && component.memberCount === 1);
  const candidates: { selected: readonly SelectableComponent[]; count: bigint }[] = [];
  const reachableStates = new Set<string>();
  for (let mask = 0; mask < 2 ** optionalNonSingleton.length; mask += 1) {
    const fixed = [anchor[0], ...optionalNonSingleton.filter((_, index) => (mask & (1 << index)) !== 0)];
    const fixedAllow = fixed.reduce((sum, component) => sum + component.allow, 0), fixedBlock = fixed.reduce((sum, component) => sum + component.block, 0);
    const needAllow = 70 - fixedAllow, needBlock = 70 - fixedBlock;
    if (needAllow < 0 || needBlock < 0) continue;
    const allowPool = singletons.filter((component) => component.allow === 1), blockPool = singletons.filter((component) => component.block === 1);
    if (needAllow > allowPool.length || needBlock > blockPool.length) continue;
    const selectedBlocks: SelectableComponent[] = []; const selectedIds = new Set<string>(); let ways = 1n;
    for (const category of CATEGORIES) {
      const fixedCategory = fixed.reduce((sum, component) => sum + (component.categories[category] ?? 0), 0), minimum = Math.max(0, requiredV2CategoryMinimums[category] - fixedCategory);
      const pool = blockPool.filter((component) => (component.categories[category] ?? 0) === 1);
      if (minimum > pool.length) { ways = 0n; break; }
      pool.slice(0, minimum).forEach((component) => { selectedBlocks.push(component); selectedIds.add(component.componentId); });
    }
    if (!ways || selectedBlocks.length > needBlock) continue;
    const extraBlock = needBlock - selectedBlocks.length, extraPool = blockPool.filter((component) => !selectedIds.has(component.componentId));
    if (extraBlock > extraPool.length) continue;
    extraPool.slice(0, extraBlock).forEach((component) => selectedBlocks.push(component));
    const selected = [...fixed, ...allowPool.slice(0, needAllow), ...selectedBlocks];
    const totals = selected.reduce((out, component) => ({ allow: out.allow + component.allow, block: out.block + component.block }), { allow: 0, block: 0 });
    const categoryTotals = Object.fromEntries(CATEGORIES.map((category) => [category, selected.reduce((sum, component) => sum + (component.categories[category] ?? 0), 0)])) as Record<RequiredCategory, number>;
    if (totals.allow !== 70 || totals.block !== 70 || CATEGORIES.some((category) => categoryTotals[category] < requiredV2CategoryMinimums[category])) continue;
    let patternWays = choose(allowPool.length, needAllow); const categoryCaps = Object.fromEntries([...CATEGORIES, "OTHER_INAPPROPRIATE"].map((category) => [category, blockPool.filter((component) => (component.categories[category] ?? 0) === 1).length])) as Record<string, number>;
    const minima = Object.fromEntries(CATEGORIES.map((category) => [category, Math.max(0, requiredV2CategoryMinimums[category] - fixed.reduce((sum, component) => sum + (component.categories[category] ?? 0), 0))])) as Record<string, number>;
    let blockWays = 0n; const cats = [...CATEGORIES, "OTHER_INAPPROPRIATE"];
    const countWays = (index: number, remaining: number, product: bigint): void => { if (index === cats.length) { if (remaining === 0) blockWays += product; return; } const category = cats[index], minimum = minima[category] ?? 0, maximum = Math.min(categoryCaps[category] ?? 0, remaining); for (let count = minimum; count <= maximum; count += 1) countWays(index + 1, remaining - count, product * choose(categoryCaps[category] ?? 0, count)); };
    countWays(0, needBlock, 1n); patternWays *= blockWays; if (!patternWays) continue;
    reachableStates.add(`${totals.allow}:${totals.block}:${CATEGORIES.map((category) => categoryTotals[category]).join(":")}`); candidates.push({ selected, count: patternWays });
  }
  if (!candidates.length) throw new Error("T6L-7I5 exact 140/70/70 component-atomic target is infeasible");
  candidates.sort((a, b) => selectionKey(a.selected) < selectionKey(b.selected) ? -1 : selectionKey(a.selected) > selectionKey(b.selected) ? 1 : 0);
  return { componentIds: candidates[0].selected.map((component) => component.componentId).sort(), exactSolutionCount: candidates.reduce((sum, candidate) => sum + candidate.count, 0n).toString(), reachableQuotaStateCount: reachableStates.size };
};

interface Authorities { readonly candidateSha256: string; readonly acquisitionSha256: string; readonly universeSha256: string; readonly designSha256: string; readonly consolidationSha256: string; readonly graphSha256: string; readonly componentsSha256: string; readonly graphAnalysisSha256: string; readonly graphCertificationSha256: string; readonly cqPolicySha256: string; readonly cqAnalysisSha256: string; readonly cqCertificationSha256: string; readonly historicalSplitSha256: string; readonly internalTestFreezeSha256: string; readonly protectedFingerprintSha256: string; readonly protectedAnalysisSha256: string; readonly protectedExclusionSha256: string; readonly protectedCertificationSha256: string }
const authorities = (): Authorities => ({ candidateSha256: MHS_V2_EXPANSION_CANDIDATE_SHA256, acquisitionSha256: MHS_V2_EXPANSION_ACQUISITION_SHA256, universeSha256: MHS_V2_REVIEW_UNIVERSE_SHA256, designSha256: MHS_TRAIN_EXPANSION_DESIGN_SHA256, consolidationSha256: MHS_V2_EXPANSION_CONSOLIDATION_SHA256, graphSha256: MHS_V2_LEAKAGE_GRAPH_SHA256, componentsSha256: MHS_V2_LEAKAGE_COMPONENTS_SHA256, graphAnalysisSha256: MHS_V2_LEAKAGE_GRAPH_ANALYSIS_SHA256, graphCertificationSha256: MHS_V2_LEAKAGE_GRAPH_CERTIFICATION_SHA256, cqPolicySha256: MHS_V2_COLLISION_POLICY_SHA256, cqAnalysisSha256: MHS_V2_COLLISION_ANALYSIS_SHA256, cqCertificationSha256: MHS_V2_COLLISION_CERTIFICATION_SHA256, historicalSplitSha256: MHS_SPLIT_MANIFEST_SHA256, internalTestFreezeSha256: MHS_INTERNAL_TEST_FREEZE_SHA256, protectedFingerprintSha256: PROTECTED_V2_FINGERPRINT_SHA256, protectedAnalysisSha256: PROTECTED_V2_ANALYSIS_SHA256, protectedExclusionSha256: PROTECTED_V2_EXCLUSION_SHA256, protectedCertificationSha256: PROTECTED_V2_CERTIFICATION_SHA256 });

export interface MhsV2ReleasePolicyPayload { readonly schemaVersion: "STHN_TEXT_MODERATION_MHS_V2_TRAIN_EXPANSION_RELEASE_POLICY_V1"; readonly policyVersion: typeof MHS_V2_RELEASE_POLICY_VERSION; readonly phase: "T6L-7I5"; readonly status: "IMMUTABLE_TRAIN_EXPANSION_RELEASE_SELECTION_POLICY"; readonly authorities: Authorities; readonly targets: { readonly combinedTrain: 200; readonly historicalTrain: 60; readonly v2Train: 140; readonly v2Allow: 70; readonly v2Block: 70; readonly v2Validation: 0; readonly v2InternalTest: 0 }; readonly selection: { readonly unit: "ATOMIC_COMPONENT"; readonly targetMeasurement: "CANDIDATE_COUNT"; readonly seed: typeof MHS_V2_RELEASE_SEED; readonly ranking: "SHA256_CANONICAL_JSON_SEED_AND_COMPONENT_ID"; readonly tieBreak: "LEXICOGRAPHIC_MINIMUM_ORDERED_SEEDED_COMPONENT_RANK_VECTOR_THEN_COMPONENT_ID"; readonly mandatoryTrainAnchorIncludedWithinTarget: true; readonly exclusionsAppliedBeforeSelection: true }; readonly stratification: { readonly blockCategoryPolicy: "HARD_COMBINED_TRAIN_CATEGORY_FLOORS_NO_FIXED_V2_CATEGORY_QUOTAS"; readonly combinedCategoryFloors: Readonly<Record<RequiredCategory, number>>; readonly requiredV2CategoryMinimums: Readonly<Record<RequiredCategory, number>>; readonly languagePolicy: "DIAGNOSTIC_ONLY_SINGLE_LANGUAGE"; readonly sourcePolicy: "DIAGNOSTIC_ONLY_SINGLE_SOURCE"; readonly difficultyPolicy: "UNSPECIFIED_NOT_SELECTION_AUTHORITY" }; readonly reserve: { readonly disposition: "RESEARCH_RESERVE_NOT_RELEASED"; readonly leakageExclusion: false; readonly humanLabelsRemainAuthoritative: true; readonly futureUseRequiresSeparateAuthority: true }; readonly eligibility: { readonly splitOrReleaseMembershipGrantsTrainingEligibility: false; readonly trainingEligibleValue: false; readonly futureTrainingAuthorityRequired: true }; readonly failClosed: readonly string[]; readonly boundaries: Readonly<Record<string, false>>; readonly frozenAt: typeof MHS_V2_RELEASE_FROZEN_AT }
export type MhsV2ReleasePolicyArtifact = MhsV2ReleasePolicyPayload & { readonly policyPayloadDigest: string };
export interface MhsV2ReleaseFeasibilityPayload { readonly schemaVersion: "STHN_TEXT_MODERATION_MHS_V2_TRAIN_EXPANSION_RELEASE_FEASIBILITY_V1"; readonly phase: "T6L-7I5"; readonly status: "EXACT_ATOMIC_TARGET_FEASIBLE"; readonly authorities: Authorities & { readonly policySha256: string; readonly policyPayloadDigest: string }; readonly counts: { readonly candidates: 400; readonly components: 393; readonly cqExcludedCandidates: 4; readonly cqExcludedComponents: 1; readonly protectedExcludedCandidates: 0; readonly protectedExcludedComponents: 0; readonly mandatoryTrainCandidates: 1; readonly mandatoryTrainComponents: 1; readonly eligibleCandidates: 396; readonly eligibleComponents: 392; readonly targetCandidates: 140; readonly targetAllow: 70; readonly targetBlock: 70 }; readonly exactAtomicSolutionExists: true; readonly exactAtomicSolutionCount: string; readonly reachableExactQuotaStateCount: number; readonly selectedComponentIdsDigest: string; readonly modelInvocations: 0; readonly e5Invocations: 0; readonly threshold: null; readonly protectedBenchmarkRawAccesses: 0; readonly internalTestRawAccesses: 0; readonly frozenAt: typeof MHS_V2_RELEASE_FROZEN_AT }
export type MhsV2ReleaseFeasibilityArtifact = MhsV2ReleaseFeasibilityPayload & { readonly feasibilityPayloadDigest: string };
export interface MhsV2ReleaseComponentRecord { readonly componentId: string; readonly memberCandidateIds: readonly string[]; readonly memberCount: number; readonly allowCount: number; readonly blockCount: number; readonly primaryCategoryCounts: Readonly<Record<string, number>>; readonly componentDigest: string; readonly deterministicRank: string; readonly historicalAnchorState: string; readonly strongerExclusion: string | null; readonly disposition: ReleaseDisposition; readonly reason: string }
export interface MhsV2ReleasePlanPayload { readonly schemaVersion: "STHN_TEXT_MODERATION_MHS_V2_TRAIN_EXPANSION_RELEASE_PLAN_V1"; readonly phase: "T6L-7I5"; readonly status: "IMMUTABLE_RELEASE_PLAN"; readonly authorities: MhsV2ReleaseFeasibilityPayload["authorities"] & { readonly feasibilitySha256: string; readonly feasibilityPayloadDigest: string }; readonly components: readonly MhsV2ReleaseComponentRecord[]; readonly summary: { readonly releasedComponents: number; readonly releasedCandidates: 140; readonly releasedAllow: 70; readonly releasedBlock: 70; readonly reserveComponents: number; readonly reserveCandidates: 256; readonly excludedComponents: 1; readonly excludedCandidates: 4; readonly v2ValidationCandidates: 0; readonly v2InternalTestCandidates: 0; readonly releasedBlockCategories: Readonly<Record<string, number>>; readonly reserveDecisionCounts: Readonly<Record<string, number>>; readonly dispositionComponentSizes: Readonly<Record<string, Readonly<Record<string, number>>>>; readonly partialComponentViolations: 0; readonly anchorViolations: 0 }; readonly releaseMembershipDigest: string; readonly trainingEligibilityChanged: false; readonly frozenAt: typeof MHS_V2_RELEASE_FROZEN_AT }
export type MhsV2ReleasePlanArtifact = MhsV2ReleasePlanPayload & { readonly planPayloadDigest: string };
export interface MhsV2ReleaseProjectionRow { readonly candidateId: string; readonly textSha256: string; readonly componentId: string; readonly decision: "ALLOW" | "BLOCK"; readonly primaryCategory: string | null; readonly disposition: ReleaseDisposition; readonly releaseReason: string; readonly trainingEligible: false }
export interface MhsV2ReleaseProjectionPayload { readonly schemaVersion: "STHN_TEXT_MODERATION_MHS_V2_TRAIN_EXPANSION_CANDIDATE_RELEASE_PROJECTION_V1"; readonly phase: "T6L-7I5"; readonly status: "IMMUTABLE_CANDIDATE_RELEASE_PROJECTION"; readonly authorities: MhsV2ReleasePlanPayload["authorities"] & { readonly planSha256: string; readonly planPayloadDigest: string }; readonly rowCount: 400; readonly rows: readonly MhsV2ReleaseProjectionRow[]; readonly releaseMembershipDigest: string; readonly trainingEligibleCount: 0; readonly moderationLabelMutations: 0; readonly historicalMutations: 0; readonly frozenAt: typeof MHS_V2_RELEASE_FROZEN_AT }
export type MhsV2ReleaseProjectionArtifact = MhsV2ReleaseProjectionPayload & { readonly projectionPayloadDigest: string };

export const createMhsV2TrainExpansionReleaseArtifacts = (input: MhsV2ReleaseInputs): { readonly policy: MhsV2ReleasePolicyArtifact; readonly feasibility: MhsV2ReleaseFeasibilityArtifact; readonly plan: MhsV2ReleasePlanArtifact; readonly projection: MhsV2ReleaseProjectionArtifact } => {
  const verified = verifyInputs(input), surface = componentSurface(verified), selection = selectRelease(surface), selected = new Set(selection.componentIds);
  const policyPayload: MhsV2ReleasePolicyPayload = { schemaVersion: "STHN_TEXT_MODERATION_MHS_V2_TRAIN_EXPANSION_RELEASE_POLICY_V1", policyVersion: MHS_V2_RELEASE_POLICY_VERSION, phase: "T6L-7I5", status: "IMMUTABLE_TRAIN_EXPANSION_RELEASE_SELECTION_POLICY", authorities: authorities(), targets: { combinedTrain: 200, historicalTrain: 60, v2Train: 140, v2Allow: 70, v2Block: 70, v2Validation: 0, v2InternalTest: 0 }, selection: { unit: "ATOMIC_COMPONENT", targetMeasurement: "CANDIDATE_COUNT", seed: MHS_V2_RELEASE_SEED, ranking: "SHA256_CANONICAL_JSON_SEED_AND_COMPONENT_ID", tieBreak: "LEXICOGRAPHIC_MINIMUM_ORDERED_SEEDED_COMPONENT_RANK_VECTOR_THEN_COMPONENT_ID", mandatoryTrainAnchorIncludedWithinTarget: true, exclusionsAppliedBeforeSelection: true }, stratification: { blockCategoryPolicy: "HARD_COMBINED_TRAIN_CATEGORY_FLOORS_NO_FIXED_V2_CATEGORY_QUOTAS", combinedCategoryFloors, requiredV2CategoryMinimums, languagePolicy: "DIAGNOSTIC_ONLY_SINGLE_LANGUAGE", sourcePolicy: "DIAGNOSTIC_ONLY_SINGLE_SOURCE", difficultyPolicy: "UNSPECIFIED_NOT_SELECTION_AUTHORITY" }, reserve: { disposition: "RESEARCH_RESERVE_NOT_RELEASED", leakageExclusion: false, humanLabelsRemainAuthoritative: true, futureUseRequiresSeparateAuthority: true }, eligibility: { splitOrReleaseMembershipGrantsTrainingEligibility: false, trainingEligibleValue: false, futureTrainingAuthorityRequired: true }, failClosed: ["AUTHORITY_MISMATCH", "NONZERO_PROTECTED_CONTAMINATION", "MISSING_OR_EXCLUDED_TRAIN_ANCHOR", "EXACT_140_70_70_INFEASIBLE", "COMPONENT_ATOMICITY_VIOLATION", "PUBLICATION_COLLISION"], boundaries: { newDataCollected: false, humanReviewRequested: false, validationExpanded: false, internalTestExpanded: false, protectedBenchmarkRawContentAccessed: false, internalTestRawContentAccessed: false, e5Invoked: false, classifierInvoked: false, thresholdSelected: false, trainingPerformed: false, productionIntegrated: false }, frozenAt: MHS_V2_RELEASE_FROZEN_AT };
  const policy = { ...policyPayload, policyPayloadDigest: digest(policyPayload) }, policySha = sha256(Buffer.from(canonicalJson(policy)));
  const feasibilityPayload: MhsV2ReleaseFeasibilityPayload = { schemaVersion: "STHN_TEXT_MODERATION_MHS_V2_TRAIN_EXPANSION_RELEASE_FEASIBILITY_V1", phase: "T6L-7I5", status: "EXACT_ATOMIC_TARGET_FEASIBLE", authorities: { ...authorities(), policySha256: policySha, policyPayloadDigest: policy.policyPayloadDigest }, counts: { candidates: 400, components: 393, cqExcludedCandidates: 4, cqExcludedComponents: 1, protectedExcludedCandidates: 0, protectedExcludedComponents: 0, mandatoryTrainCandidates: 1, mandatoryTrainComponents: 1, eligibleCandidates: 396, eligibleComponents: 392, targetCandidates: 140, targetAllow: 70, targetBlock: 70 }, exactAtomicSolutionExists: true, exactAtomicSolutionCount: selection.exactSolutionCount, reachableExactQuotaStateCount: selection.reachableQuotaStateCount, selectedComponentIdsDigest: digest(selection.componentIds), modelInvocations: 0, e5Invocations: 0, threshold: null, protectedBenchmarkRawAccesses: 0, internalTestRawAccesses: 0, frozenAt: MHS_V2_RELEASE_FROZEN_AT };
  const feasibility = { ...feasibilityPayload, feasibilityPayloadDigest: digest(feasibilityPayload) }, feasibilitySha = sha256(Buffer.from(canonicalJson(feasibility)));
  const records: MhsV2ReleaseComponentRecord[] = surface.map((component) => { const disposition: ReleaseDisposition = component.excluded ? "EXCLUDED_FROM_TRAIN_AND_VALIDATION" : selected.has(component.componentId) ? "RELEASED_TO_TRAIN" : "RESEARCH_RESERVE_NOT_RELEASED"; return { componentId: component.componentId, memberCandidateIds: component.memberCandidateIds, memberCount: component.memberCount, allowCount: component.allow, blockCount: component.block, primaryCategoryCounts: component.categories, componentDigest: component.componentDigest, deterministicRank: component.rank, historicalAnchorState: component.anchor ? "CONSTRAIN_TO_TRAIN" : "NONE", strongerExclusion: component.excluded ? "CONFLICTING_FROZEN_HISTORICAL_SPLIT_ANCHORS" : null, disposition, reason: component.excluded ? "CQ_STRONG_EXCLUSION" : disposition === "RELEASED_TO_TRAIN" ? (component.anchor ? "MANDATORY_HISTORICAL_TRAIN_ANCHOR" : "DETERMINISTIC_EXACT_TARGET_SELECTION") : "VALID_REVIEWED_RESEARCH_RESERVE" }; }).sort((a, b) => a.componentId.localeCompare(b.componentId));
  const byDisposition = (value: ReleaseDisposition) => records.filter((record) => record.disposition === value), released = byDisposition("RELEASED_TO_TRAIN"), reserve = byDisposition("RESEARCH_RESERVE_NOT_RELEASED"), excluded = byDisposition("EXCLUDED_FROM_TRAIN_AND_VALIDATION");
  const releasedRows = released.flatMap((record) => record.memberCandidateIds.map((id) => verified.consolidation.rows.find((row) => row.candidateId === id)!)), reserveRows = reserve.flatMap((record) => record.memberCandidateIds.map((id) => verified.consolidation.rows.find((row) => row.candidateId === id)!));
  const sizeDistribution = (rows: readonly MhsV2ReleaseComponentRecord[]): Readonly<Record<string, number>> => tally(rows.map((row) => String(row.memberCount)));
  const releaseMembershipDigest = digest(releasedRows.map((row) => ({ candidateId: row.candidateId, textSha256: row.textSha256 })).sort((a, b) => a.candidateId.localeCompare(b.candidateId)));
  const planPayload: MhsV2ReleasePlanPayload = { schemaVersion: "STHN_TEXT_MODERATION_MHS_V2_TRAIN_EXPANSION_RELEASE_PLAN_V1", phase: "T6L-7I5", status: "IMMUTABLE_RELEASE_PLAN", authorities: { ...feasibility.authorities, feasibilitySha256: feasibilitySha, feasibilityPayloadDigest: feasibility.feasibilityPayloadDigest }, components: records, summary: { releasedComponents: released.length, releasedCandidates: 140, releasedAllow: 70, releasedBlock: 70, reserveComponents: reserve.length, reserveCandidates: 256, excludedComponents: excluded.length as 1, excludedCandidates: 4, v2ValidationCandidates: 0, v2InternalTestCandidates: 0, releasedBlockCategories: tally(releasedRows.filter((row) => row.decision === "BLOCK").map((row) => row.primaryCategory!)), reserveDecisionCounts: tally(reserveRows.map((row) => row.decision)), dispositionComponentSizes: { RELEASED_TO_TRAIN: sizeDistribution(released), RESEARCH_RESERVE_NOT_RELEASED: sizeDistribution(reserve), EXCLUDED_FROM_TRAIN_AND_VALIDATION: sizeDistribution(excluded) }, partialComponentViolations: 0, anchorViolations: 0 }, releaseMembershipDigest, trainingEligibilityChanged: false, frozenAt: MHS_V2_RELEASE_FROZEN_AT };
  const plan = { ...planPayload, planPayloadDigest: digest(planPayload) }, planSha = sha256(Buffer.from(canonicalJson(plan))), componentByCandidate = new Map(records.flatMap((record) => record.memberCandidateIds.map((id) => [id, record] as const)));
  const projectionRows: MhsV2ReleaseProjectionRow[] = verified.consolidation.rows.map((row) => { const component = componentByCandidate.get(row.candidateId); if (!component || (row.decision !== "ALLOW" && row.decision !== "BLOCK")) throw new Error("T6L-7I5 candidate projection mismatch"); return { candidateId: row.candidateId, textSha256: row.textSha256, componentId: component.componentId, decision: row.decision, primaryCategory: row.primaryCategory, disposition: component.disposition, releaseReason: component.reason, trainingEligible: false as const }; }).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  const projectionPayload: MhsV2ReleaseProjectionPayload = { schemaVersion: "STHN_TEXT_MODERATION_MHS_V2_TRAIN_EXPANSION_CANDIDATE_RELEASE_PROJECTION_V1", phase: "T6L-7I5", status: "IMMUTABLE_CANDIDATE_RELEASE_PROJECTION", authorities: { ...plan.authorities, planSha256: planSha, planPayloadDigest: plan.planPayloadDigest }, rowCount: 400, rows: projectionRows, releaseMembershipDigest, trainingEligibleCount: 0, moderationLabelMutations: 0, historicalMutations: 0, frozenAt: MHS_V2_RELEASE_FROZEN_AT };
  const projection = { ...projectionPayload, projectionPayloadDigest: digest(projectionPayload) };
  validateMhsV2TrainExpansionReleaseArtifacts(policy, feasibility, plan, projection); return { policy, feasibility, plan, projection };
};

const pinMatches = (actual: string, expected: string): boolean => expected === "PENDING" || actual === expected;
export const validateMhsV2TrainExpansionReleaseArtifacts = (policy: MhsV2ReleasePolicyArtifact, feasibility: MhsV2ReleaseFeasibilityArtifact, plan: MhsV2ReleasePlanArtifact, projection: MhsV2ReleaseProjectionArtifact): void => {
  const { policyPayloadDigest, ...pp } = policy, { feasibilityPayloadDigest, ...fp } = feasibility, { planPayloadDigest, ...rp } = plan, { projectionPayloadDigest, ...cp } = projection;
  const policySha = sha256(Buffer.from(canonicalJson(policy))), feasibilitySha = sha256(Buffer.from(canonicalJson(feasibility))), planSha = sha256(Buffer.from(canonicalJson(plan))), projectionSha = sha256(Buffer.from(canonicalJson(projection)));
  const dispositions = tally(projection.rows.map((row) => row.disposition)), released = projection.rows.filter((row) => row.disposition === "RELEASED_TO_TRAIN"), ids = projection.rows.map((row) => row.candidateId);
  if (policyPayloadDigest !== digest(pp) || feasibilityPayloadDigest !== digest(fp) || planPayloadDigest !== digest(rp) || projectionPayloadDigest !== digest(cp) || !pinMatches(policySha, MHS_V2_RELEASE_POLICY_SHA256) || !pinMatches(policyPayloadDigest, MHS_V2_RELEASE_POLICY_PAYLOAD_DIGEST) || !pinMatches(feasibilitySha, MHS_V2_RELEASE_FEASIBILITY_SHA256) || !pinMatches(feasibilityPayloadDigest, MHS_V2_RELEASE_FEASIBILITY_PAYLOAD_DIGEST) || !pinMatches(planSha, MHS_V2_RELEASE_PLAN_SHA256) || !pinMatches(planPayloadDigest, MHS_V2_RELEASE_PLAN_PAYLOAD_DIGEST) || !pinMatches(projectionSha, MHS_V2_RELEASE_PROJECTION_SHA256) || !pinMatches(projectionPayloadDigest, MHS_V2_RELEASE_PROJECTION_PAYLOAD_DIGEST)) throw new Error("Invalid T6L-7I5 canonical artifact digest");
  if (policy.targets.v2Train !== 140 || policy.targets.v2Allow !== 70 || policy.targets.v2Block !== 70 || policy.targets.v2Validation !== 0 || policy.targets.v2InternalTest !== 0 || !feasibility.exactAtomicSolutionExists || plan.components.length !== 393 || projection.rows.length !== 400 || new Set(ids).size !== 400 || dispositions.RELEASED_TO_TRAIN !== 140 || dispositions.RESEARCH_RESERVE_NOT_RELEASED !== 256 || dispositions.EXCLUDED_FROM_TRAIN_AND_VALIDATION !== 4 || released.filter((row) => row.decision === "ALLOW").length !== 70 || released.filter((row) => row.decision === "BLOCK").length !== 70 || projection.trainingEligibleCount !== 0 || projection.rows.some((row) => row.trainingEligible) || !plan.components.find((row) => row.componentId === TRAIN_ANCHOR_COMPONENT_ID || false) || plan.components.find((row) => row.componentId === TRAIN_ANCHOR_COMPONENT_ID)!.disposition !== "RELEASED_TO_TRAIN" || plan.components.find((row) => row.componentId === CQ_COMPONENT_ID)?.disposition !== "EXCLUDED_FROM_TRAIN_AND_VALIDATION") throw new Error("Invalid T6L-7I5 release accounting");
  const projectionById = new Map(projection.rows.map((row) => [row.candidateId, row])); if (plan.components.some((component) => component.memberCandidateIds.some((id) => projectionById.get(id)?.disposition !== component.disposition))) throw new Error("T6L-7I5 partial component disposition");
};

type Publisher = (temporary: readonly string[], targets: readonly string[]) => void;
const defaultPublisher: Publisher = (temporary, targets) => temporary.forEach((filename, index) => fs.renameSync(filename, targets[index]));
export const publishMhsV2TrainExpansionReleaseArtifacts = (artifacts: ReturnType<typeof createMhsV2TrainExpansionReleaseArtifacts>, outputDirectory: string, publisher: Publisher = defaultPublisher): { readonly paths: readonly string[]; readonly sha256: readonly string[] } => {
  validateMhsV2TrainExpansionReleaseArtifacts(artifacts.policy, artifacts.feasibility, artifacts.plan, artifacts.projection); fs.mkdirSync(outputDirectory, { recursive: true });
  const targets = [MHS_V2_RELEASE_POLICY_FILENAME, MHS_V2_RELEASE_FEASIBILITY_FILENAME, MHS_V2_RELEASE_PLAN_FILENAME, MHS_V2_RELEASE_PROJECTION_FILENAME].map((filename) => path.join(outputDirectory, filename)); if (targets.some(fs.existsSync)) throw new Error("T6L-7I5 overwrite refused");
  const serialized = [artifacts.policy, artifacts.feasibility, artifacts.plan, artifacts.projection].map(canonicalJson), nonce = crypto.randomBytes(8).toString("hex"), temporary = targets.map((target) => `${target}.${nonce}.tmp`);
  try { temporary.forEach((filename, index) => fs.writeFileSync(filename, serialized[index], { flag: "wx" })); publisher(temporary, targets); if (targets.some((target) => !fs.existsSync(target))) throw new Error("T6L-7I5 incomplete publication"); }
  catch (error) { [...temporary, ...targets].forEach((filename) => { if (fs.existsSync(filename)) fs.rmSync(filename); }); throw error; }
  return { paths: targets, sha256: serialized.map((text) => sha256(Buffer.from(text))) };
};
