export const TEXT_MODERATION_EVALUATION_SCHEMA_VERSION =
  "STHN_TEXT_MODERATION_EVALUATION_V1" as const;

export const PROFANITY_POLICY_BOUNDARY = {
  block: "Unnecessary explicit profanity used as the user's own public expression.",
  allow: "Legitimate educational, professional, research, or descriptive discussion of profanity.",
} as const;

export const OTHER_INAPPROPRIATE_POLICY_BOUNDARY =
  "Content clearly incompatible with a legitimate STHN marketplace profile or service that is not adequately represented by another bounded Text AI harm category." as const;

export type EvaluationDomain = "USER_PROFILE" | "CREATOR_APPLICATION";
export type EvaluationTarget =
  | "bio"
  | `interests[${number}]`
  | "publicBio"
  | `services[${number}]`;
export type ExpectedDecision = "ALLOW" | "BLOCK";
export type EvaluationDecision = ExpectedDecision;
export type EvaluationDifficulty = "EASY" | "CONTEXTUAL" | "ADVERSARIAL";
export type EvaluationPolicyCategory =
  | "PROFANITY"
  | "SEXUAL"
  | "ABUSIVE_OR_HARASSING"
  | "HATE"
  | "THREAT_OR_VIOLENCE"
  | "OTHER_INAPPROPRIATE";

export type EvaluationTag =
  | "profanity"
  | "sexual"
  | "harassment"
  | "hate"
  | "threat"
  | "violence"
  | "benign-sensitive-context"
  | "marketplace"
  | "obfuscation"
  | "unicode"
  | "multilingual"
  | "profile"
  | "creator-service"
  | "companionship"
  | "nightlife";

export interface TextModerationEvaluationFixture {
  readonly id: string;
  readonly domain: EvaluationDomain;
  readonly target: EvaluationTarget;
  readonly text: string;
  readonly expectedDecision: ExpectedDecision;
  readonly policyReason: string;
  readonly language: string;
  readonly difficulty: EvaluationDifficulty;
  readonly tags: readonly EvaluationTag[];
  readonly expectedCategory?: EvaluationPolicyCategory;
  readonly nearPairGroup?: string;
}

export type RawProviderScalar = string | number | boolean | null;
export interface BoundedRawProviderDetails {
  readonly summary?: string;
  readonly labels?: readonly Readonly<{
    name: string;
    score?: number;
    severity?: number;
    flagged?: boolean | null;
    appliedInputTypes?: readonly string[];
  }>[];
  readonly metadata?: Readonly<Record<string, RawProviderScalar>>;
}

export type ProviderEvaluationResult =
  | Readonly<{
      status: "COMPLETED";
      decision: EvaluationDecision;
      categories?: readonly EvaluationPolicyCategory[];
      raw?: BoundedRawProviderDetails;
    }>
  | Readonly<{
      status: "UNAVAILABLE" | "ERROR";
      errorCode: string;
      raw?: BoundedRawProviderDetails;
    }>;

export interface TextModerationEvaluationProvider {
  readonly id: string;
  readonly displayName: string;
  readonly requestedModel?: string;
  initialize?(): Promise<void>;
  getReportMetadata?(): Readonly<Record<string, RawProviderScalar>>;
  evaluate(fixture: TextModerationEvaluationFixture): Promise<ProviderEvaluationResult>;
}

export type EvaluationOutcome =
  | "CORRECT_ALLOW"
  | "CORRECT_BLOCK"
  | "FALSE_POSITIVE"
  | "FALSE_NEGATIVE"
  | "UNAVAILABLE"
  | "ERROR";

export interface FixtureEvaluationResult {
  readonly fixture: TextModerationEvaluationFixture;
  readonly providerStatus: ProviderEvaluationResult["status"];
  readonly providerDecision: EvaluationDecision | null;
  readonly providerCategories: readonly EvaluationPolicyCategory[];
  readonly raw: BoundedRawProviderDetails | null;
  readonly errorCode: string | null;
  readonly outcome: EvaluationOutcome;
  readonly latencyMs: number;
}

export interface EvaluationMetricSlice {
  total: number;
  evaluated: number;
  correct: number;
  falsePositive: number;
  falseNegative: number;
  unavailableOrError: number;
  evaluatedAccuracy: number | null;
}

export interface TextModerationEvaluationMetrics extends EvaluationMetricSlice {
  correctAllow: number;
  correctBlock: number;
  unavailable: number;
  error: number;
  availabilityRate: number | null;
  allowAccuracy: number | null;
  blockRecall: number | null;
  falsePositiveRate: number | null;
  falseNegativeRate: number | null;
  averageLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  maxLatencyMs: number | null;
  totalRunTimeMs: number;
  byDifficulty: Readonly<Record<string, EvaluationMetricSlice>>;
  byLanguage: Readonly<Record<string, EvaluationMetricSlice>>;
  byTag: Readonly<Record<string, EvaluationMetricSlice>>;
  byExpectedCategory: Readonly<Record<string, EvaluationMetricSlice>>;
}

export interface TextModerationEvaluationReport {
  readonly schemaVersion: typeof TEXT_MODERATION_EVALUATION_SCHEMA_VERSION;
  readonly runId: string;
  readonly generatedAt: string;
  readonly fixture: Readonly<{ version: string; count: number }>;
  readonly provider: Readonly<{
    id: string;
    displayName: string;
    requestedModel?: string;
    actualModels: readonly string[];
    metadata?: Readonly<Record<string, RawProviderScalar>>;
  }>;
  readonly metrics: TextModerationEvaluationMetrics;
  readonly falsePositives: readonly FixtureEvaluationResult[];
  readonly falseNegatives: readonly FixtureEvaluationResult[];
  readonly unavailableOrErrors: readonly FixtureEvaluationResult[];
  readonly results: readonly FixtureEvaluationResult[];
}
