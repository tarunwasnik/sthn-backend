import { DetectorCapability, EvaluationDifficulty, ImageModerationSurface, ImagePolicyCategory, ImagePolicyDecision } from "../imageModerationEvaluation.types";

export const SEXUAL_CONTENT_BENCHMARK_SCHEMA_VERSION = "STHN_IMAGE_SEXUAL_CONTENT_BENCHMARK_V1" as const;
export type FixtureReviewStatus = "PROPOSED" | "REVIEW_REQUIRED" | "APPROVED";
export type ModelQualityProvenance = "INTERNAL" | "SYNTHETIC_GENERATED" | "EXTERNAL_DATASET";
export type SexualContentContextTag = "PORTRAIT" | "PROFESSIONAL" | "FITNESS" | "ATHLETIC" | "BEACH" | "SWIMWEAR" | "SHIRTLESS" | "FASHION" | "COUPLE" | "GROUP" | "ANIME" | "DRAWING" | "AI_GENERATED" | "SUGGESTIVE_BOUNDARY" | "EXPLICIT_BOUNDARY";
export type CoverageClass = "ORDINARY_PORTRAIT_PASS" | "PROFESSIONAL_PORTRAIT_PASS" | "FITNESS_PASS" | "ATHLETIC_PASS" | "SWIMWEAR_PASS" | "BEACH_PASS" | "SHIRTLESS_NONSEXUAL_PASS" | "FASHION_PASS" | "COUPLE_GROUP_PASS" | "NONSEXUAL_ILLUSTRATION_PASS" | "NONAVATAR_GENERATED_PASS" | "NUDITY_BLOCK" | "EXPLICIT_SEXUAL_BLOCK" | "PORNOGRAPHY_BLOCK" | "SUGGESTIVE_BLOCK" | "SEXUAL_ILLUSTRATION_BLOCK" | "GENERATED_SEXUAL_BLOCK" | "BOUNDARY_UNCERTAIN";
export interface ModelQualitySexualContentFixture {
  readonly id: string; readonly description: string; readonly localAsset?: string;
  readonly sourceLabels: readonly string[];
  readonly expectedBySurface: Readonly<Partial<Record<ImageModerationSurface, Readonly<{ decision: ImagePolicyDecision; categories: readonly ImagePolicyCategory[] }>>>>;
  readonly requiredCapabilities: readonly DetectorCapability[]; readonly difficulty: EvaluationDifficulty;
  readonly contextTags: readonly SexualContentContextTag[]; readonly coverageClasses: readonly CoverageClass[];
  readonly boundaryPairId?: string; readonly rationale: string;
  readonly provenance: Readonly<{ kind: ModelQualityProvenance; datasetId?: string; assetId?: string; license?: string; referenceNote: string }>;
  readonly review: Readonly<{ status: FixtureReviewStatus; policyVersion?: string; reviewedAt?: string; reviewer: "POLICY_REVIEW" | "DATASET_REVIEW"; rationale: string }>;
}
export interface SexualContentCoverageTarget { readonly coverageClass: CoverageClass; readonly expectedDecision: ImagePolicyDecision; readonly requiredMinimum: number; readonly rationale: string; }
export interface SexualContentDatasetAnalysis { readonly schemaVersion: typeof SEXUAL_CONTENT_BENCHMARK_SCHEMA_VERSION; readonly benchmarkVersion: string; readonly modelQualityFixtureCount: number; readonly approvedFixtureCount: number; readonly approvedEvaluationCaseCount: number; readonly composition: Readonly<Record<string, Readonly<Record<string, number>>>>; readonly coverage: readonly Readonly<{ coverageClass: CoverageClass; requiredMinimum: number; approvedCount: number; gap: number; expectedDecision: ImagePolicyDecision }>[]; readonly boundaryPairs: readonly Readonly<{ id: string; fixtureIds: readonly string[]; valid: boolean }>[]; }
