export const IMAGE_MODERATION_EVALUATION_SCHEMA_VERSION = "STHN_IMAGE_MODERATION_EVALUATION_V1" as const;

export type ImageModerationSurface =
  | "USER_AVATAR" | "USER_COVER" | "USER_PROFILE_PHOTO"
  | "CREATOR_APPLICATION_AVATAR" | "CREATOR_APPLICATION_COVER" | "CREATOR_APPLICATION_MEDIA"
  | "CREATOR_PROFILE_AVATAR" | "CREATOR_PROFILE_COVER" | "CREATOR_PROFILE_MEDIA"
  | "CREATOR_SERVICE_MEDIA";
export type ImagePolicyDecision = "PASS" | "BLOCK" | "UNCERTAIN";
export type EvaluationDifficulty = "EASY" | "CONTEXTUAL" | "ADVERSARIAL";
export type DetectorCapability = "NSFW" | "NUDITY" | "PORNOGRAPHY" | "SUGGESTIVE" | "HENTAI" | "VIOLENCE" | "GORE" | "FIREARM" | "CONTEXTUAL_WEAPON" | "SUBSTANCE" | "TOBACCO" | "AI_GENERATED" | "MINOR" | "TECHNICAL_QUALITY";
export type ImagePolicyCategory = "NUDITY" | "PORNOGRAPHY" | "SEXUAL_CONTENT" | "SUGGESTIVE" | "HENTAI" | "GENERATED_SEXUAL" | "GRAPHIC_VIOLENCE" | "GORE" | "FIREARM" | "THREATENING_WEAPON" | "SUBSTANCE_USE" | "TOBACCO_USE" | "AI_GENERATED_PERSON" | "MINOR_SOLO" | "IMAGE_UNREADABLE";
export type FixtureTag = "synthetic" | "safe-harness" | "swimwear-boundary" | "combat-sport" | "multi-category" | "surface-dependent" | "quality" | "minor-capability" | "future-ocr";

export interface ImageModerationEvaluationFixture {
  readonly id: string;
  readonly description: string;
  readonly asset: string;
  readonly expectedBySurface: Readonly<Partial<Record<ImageModerationSurface, Readonly<{ decision: ImagePolicyDecision; categories: readonly ImagePolicyCategory[] }>>>>;
  readonly requiredCapabilities: readonly DetectorCapability[];
  readonly difficulty: EvaluationDifficulty;
  readonly tags: readonly FixtureTag[];
  readonly rationale: string;
  readonly provenance: Readonly<{ kind: "SYNTHETIC" | "INTERNAL" | "EXTERNAL"; license?: string }>;
}

export interface NormalizedDetectorFinding { readonly category: ImagePolicyCategory; readonly score?: number; readonly severity?: "LOW" | "MEDIUM" | "HIGH"; }
export type DetectorEvaluationResult =
  | Readonly<{ status: "COMPLETED"; decision: ImagePolicyDecision; findings: readonly NormalizedDetectorFinding[] }>
  | Readonly<{ status: "UNAVAILABLE" | "ERROR"; errorCode: string }>;
export interface ImageModerationEvaluationDetector {
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly capabilities: readonly DetectorCapability[];
  initialize?(): Promise<void>;
  getPerformanceMetadata?(): Readonly<{ coldStartMs?: number; modelArtifactBytes?: number; processRssBeforeLoadBytes?: number; processRssAfterLoadBytes?: number }>;
  evaluate(input: Readonly<{ fixture: ImageModerationEvaluationFixture; surface: ImageModerationSurface; assetPath: string; bytes: Buffer }>): Promise<DetectorEvaluationResult>;
}
export type EvaluationOutcome = "SUPPORTED_AND_CORRECT" | "SUPPORTED_AND_INCORRECT" | "NOT_SUPPORTED" | "UNAVAILABLE" | "ERROR";
export interface FixtureEvaluationResult { readonly fixtureId: string; readonly surface: ImageModerationSurface; readonly expectedDecision: ImagePolicyDecision; readonly expectedCategories: readonly ImagePolicyCategory[]; readonly requiredCapabilities: readonly DetectorCapability[]; readonly providerStatus: DetectorEvaluationResult["status"] | "NOT_SUPPORTED"; readonly actualDecision: ImagePolicyDecision | null; readonly actualCategories: readonly ImagePolicyCategory[]; readonly outcome: EvaluationOutcome; readonly latencyMs: number; readonly errorCode: string | null; }
export interface MetricSlice { total: number; supported: number; correct: number; incorrect: number; unsupported: number; unavailableOrError: number; accuracy: number | null; falsePositive: number; falseNegative: number; falsePositiveRate: number | null; falseNegativeRate: number | null; blockRecall: number | null; passRecall: number | null; confusion: Readonly<Record<string, number>>; }
export interface ImageModerationEvaluationMetrics extends MetricSlice { readonly byCapability: Readonly<Record<string, MetricSlice>>; readonly byCategory: Readonly<Record<string, MetricSlice>>; readonly byDifficulty: Readonly<Record<string, MetricSlice>>; readonly bySurface: Readonly<Record<string, MetricSlice>>; readonly performance: Readonly<{ coldStartMs: number | null; totalRunTimeMs: number; averageInferenceMs: number | null; medianInferenceMs: number | null; p95InferenceMs: number | null; minInferenceMs: number | null; maxInferenceMs: number | null; throughputPerSecond: number | null; processRssBeforeLoadBytes: number | null; processRssAfterLoadBytes: number | null; modelArtifactBytes: number | null; exceedsThirtySecondBoundaryCount: number }> }
export interface ImageModerationEvaluationReport { readonly schemaVersion: typeof IMAGE_MODERATION_EVALUATION_SCHEMA_VERSION; readonly runId: string; readonly generatedAt: string; readonly fixture: Readonly<{ version: string; fixtureCount: number; evaluatedCases: number }>; readonly detector: Readonly<{ id: string; version: string; displayName: string; capabilities: readonly DetectorCapability[] }>; readonly metrics: ImageModerationEvaluationMetrics; readonly results: readonly FixtureEvaluationResult[]; readonly notes: readonly string[]; }
