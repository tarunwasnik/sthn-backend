import { performance } from "node:perf_hooks";

import {
  BoundedRawProviderDetails,
  EvaluationMetricSlice,
  FixtureEvaluationResult,
  ProviderEvaluationResult,
  TEXT_MODERATION_EVALUATION_SCHEMA_VERSION,
  TextModerationEvaluationFixture,
  TextModerationEvaluationMetrics,
  TextModerationEvaluationProvider,
  TextModerationEvaluationReport,
} from "./textModerationEvaluation.types";

const RATE = (numerator: number, denominator: number) =>
  denominator === 0 ? null : numerator / denominator;

const percentile = (values: readonly number[], proportion: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * proportion) - 1];
};

const APPROVED_DOMAINS = new Set(["USER_PROFILE", "CREATOR_APPLICATION"]);
const APPROVED_DIFFICULTIES = new Set(["EASY", "CONTEXTUAL", "ADVERSARIAL"]);
const APPROVED_CATEGORIES = new Set([
  "PROFANITY", "SEXUAL", "ABUSIVE_OR_HARASSING", "HATE",
  "THREAT_OR_VIOLENCE", "OTHER_INAPPROPRIATE",
]);
const SENSITIVE_RAW_KEY = /authorization|api[-_]?key|token|secret|credential|cookie/i;
const APPROVED_TAGS = new Set([
  "profanity", "sexual", "harassment", "hate", "threat", "violence",
  "benign-sensitive-context", "marketplace", "obfuscation", "unicode",
  "multilingual", "profile", "creator-service", "companionship", "nightlife",
]);
const TARGETS = {
  USER_PROFILE: /^(bio|interests\[(0|[1-9]\d*)\])$/,
  CREATOR_APPLICATION: /^(publicBio|services\[(0|[1-9]\d*)\])$/,
} as const;

export const validateTextModerationFixtures = (
  fixtures: readonly TextModerationEvaluationFixture[],
): void => {
  if (!fixtures.length) throw new Error("At least one text moderation fixture is required");
  const ids = new Set<string>();
  for (const fixture of fixtures) {
    if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(fixture.id)) {
      throw new Error(`Invalid fixture ID: ${fixture.id}`);
    }
    if (ids.has(fixture.id)) throw new Error(`Duplicate fixture ID: ${fixture.id}`);
    ids.add(fixture.id);
    if (!APPROVED_DOMAINS.has(fixture.domain)) throw new Error(`Invalid domain: ${fixture.domain}`);
    if (!TARGETS[fixture.domain].test(fixture.target)) {
      throw new Error(`Target ${fixture.target} is not allowed for ${fixture.domain}`);
    }
    if (!fixture.text || fixture.text.length > 2_000) throw new Error(`Invalid text for ${fixture.id}`);
    if (fixture.expectedDecision !== "ALLOW" && fixture.expectedDecision !== "BLOCK") throw new Error(`Invalid expected decision for ${fixture.id}`);
    if (!fixture.policyReason || fixture.policyReason.length > 300) throw new Error(`Invalid policy reason for ${fixture.id}`);
    if (!fixture.language || fixture.language.length > 40) throw new Error(`Invalid language for ${fixture.id}`);
    if (!APPROVED_DIFFICULTIES.has(fixture.difficulty)) throw new Error(`Invalid difficulty for ${fixture.id}`);
    if (!fixture.tags.length || new Set(fixture.tags).size !== fixture.tags.length || fixture.tags.some((tag) => !APPROVED_TAGS.has(tag))) throw new Error(`Invalid tags for ${fixture.id}`);
    if (fixture.nearPairGroup && !/^[a-z0-9][a-z0-9-]{2,79}$/.test(fixture.nearPairGroup)) throw new Error(`Invalid near-pair group for ${fixture.id}`);
    if (fixture.expectedDecision === "BLOCK" && !fixture.expectedCategory) throw new Error(`BLOCK fixture ${fixture.id} needs a category`);
    if (fixture.expectedDecision === "ALLOW" && fixture.expectedCategory) throw new Error(`ALLOW fixture ${fixture.id} cannot have a harmful category`);
    if (fixture.expectedCategory && !APPROVED_CATEGORIES.has(fixture.expectedCategory)) throw new Error(`Invalid category for ${fixture.id}`);
  }
};

const boundedRaw = (raw?: BoundedRawProviderDetails): BoundedRawProviderDetails | null => {
  if (!raw) return null;
  const summary = raw.summary?.slice(0, 500);
  const labels = raw.labels?.slice(0, 20).map((label) => ({
    name: label.name.slice(0, 80),
    ...(Number.isFinite(label.score) ? { score: label.score } : {}),
    ...(Number.isFinite(label.severity) ? { severity: label.severity } : {}),
    ...(typeof label.flagged === "boolean" || label.flagged === null ? { flagged: label.flagged } : {}),
    ...(label.appliedInputTypes?.length ? { appliedInputTypes: label.appliedInputTypes.slice(0, 4).map((value) => value.slice(0, 20)) } : {}),
  }));
  const metadata = raw.metadata
    ? Object.fromEntries(Object.entries(raw.metadata).filter(([key]) => !SENSITIVE_RAW_KEY.test(key)).slice(0, 20).map(([key, value]) => [
        key.slice(0, 80), typeof value === "string" ? value.slice(0, 300) : value,
      ]))
    : undefined;
  return { ...(summary ? { summary } : {}), ...(labels?.length ? { labels } : {}), ...(metadata ? { metadata } : {}) };
};

const classify = (
  fixture: TextModerationEvaluationFixture,
  result: ProviderEvaluationResult,
): Omit<FixtureEvaluationResult, "fixture" | "latencyMs"> => {
  if (result.status !== "COMPLETED") return {
    providerStatus: result.status,
    providerDecision: null,
    providerCategories: [],
    raw: boundedRaw(result.raw),
    errorCode: result.errorCode.slice(0, 100),
    outcome: result.status,
  };
  const outcome = fixture.expectedDecision === result.decision
    ? (result.decision === "ALLOW" ? "CORRECT_ALLOW" : "CORRECT_BLOCK")
    : (result.decision === "BLOCK" ? "FALSE_POSITIVE" : "FALSE_NEGATIVE");
  return {
    providerStatus: result.status,
    providerDecision: result.decision,
    providerCategories: [...(result.categories ?? [])].filter((category) => APPROVED_CATEGORIES.has(category)).slice(0, 6),
    raw: boundedRaw(result.raw),
    errorCode: null,
    outcome,
  };
};

const metricSlice = (results: readonly FixtureEvaluationResult[]): EvaluationMetricSlice => {
  const correct = results.filter(({ outcome }) => outcome === "CORRECT_ALLOW" || outcome === "CORRECT_BLOCK").length;
  const falsePositive = results.filter(({ outcome }) => outcome === "FALSE_POSITIVE").length;
  const falseNegative = results.filter(({ outcome }) => outcome === "FALSE_NEGATIVE").length;
  const evaluated = correct + falsePositive + falseNegative;
  return {
    total: results.length,
    evaluated,
    correct,
    falsePositive,
    falseNegative,
    unavailableOrError: results.length - evaluated,
    evaluatedAccuracy: RATE(correct, evaluated),
  };
};

const grouped = (
  results: readonly FixtureEvaluationResult[],
  keys: (result: FixtureEvaluationResult) => readonly string[],
): Readonly<Record<string, EvaluationMetricSlice>> => {
  const groups = new Map<string, FixtureEvaluationResult[]>();
  for (const result of results) {
    for (const key of keys(result)) groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  return Object.fromEntries([...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(
    ([key, values]) => [key, metricSlice(values)],
  ));
};

export const calculateTextModerationMetrics = (
  results: readonly FixtureEvaluationResult[],
  totalRunTimeMs = results.reduce((sum, result) => sum + result.latencyMs, 0),
): TextModerationEvaluationMetrics => {
  const base = metricSlice(results);
  const correctAllow = results.filter(({ outcome }) => outcome === "CORRECT_ALLOW").length;
  const correctBlock = results.filter(({ outcome }) => outcome === "CORRECT_BLOCK").length;
  const unavailable = results.filter(({ outcome }) => outcome === "UNAVAILABLE").length;
  const error = results.filter(({ outcome }) => outcome === "ERROR").length;
  const expectedAllowEvaluated = results.filter(({ fixture, providerStatus }) => fixture.expectedDecision === "ALLOW" && providerStatus === "COMPLETED").length;
  const expectedBlockEvaluated = results.filter(({ fixture, providerStatus }) => fixture.expectedDecision === "BLOCK" && providerStatus === "COMPLETED").length;
  const latencies = results.map(({ latencyMs }) => latencyMs);
  return {
    ...base,
    correctAllow,
    correctBlock,
    unavailable,
    error,
    availabilityRate: RATE(base.evaluated, base.total),
    allowAccuracy: RATE(correctAllow, expectedAllowEvaluated),
    blockRecall: RATE(correctBlock, expectedBlockEvaluated),
    falsePositiveRate: RATE(base.falsePositive, expectedAllowEvaluated),
    falseNegativeRate: RATE(base.falseNegative, expectedBlockEvaluated),
    averageLatencyMs: RATE(results.reduce((sum, result) => sum + result.latencyMs, 0), results.length),
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    maxLatencyMs: latencies.length ? Math.max(...latencies) : null,
    totalRunTimeMs,
    byDifficulty: grouped(results, ({ fixture }) => [fixture.difficulty]),
    byLanguage: grouped(results, ({ fixture }) => [fixture.language]),
    byTag: grouped(results, ({ fixture }) => fixture.tags),
    byExpectedCategory: grouped(results, ({ fixture }) => fixture.expectedCategory ? [fixture.expectedCategory] : ["ALLOW_NONE"]),
  };
};

export const evaluateTextModerationFixtures = async (
  fixtures: readonly TextModerationEvaluationFixture[],
  provider: TextModerationEvaluationProvider,
  options: Readonly<{
    now?: () => number;
    generatedAt?: string;
    runId?: string;
    fixtureVersion?: string;
  }> = {},
): Promise<TextModerationEvaluationReport> => {
  validateTextModerationFixtures(fixtures);
  const now = options.now ?? (() => performance.now());
  const runStartedAt = now();
  const results: FixtureEvaluationResult[] = [];
  for (const fixture of fixtures) {
    const startedAt = now();
    let providerResult: ProviderEvaluationResult;
    try {
      providerResult = await provider.evaluate(fixture);
    } catch {
      providerResult = { status: "ERROR", errorCode: "PROVIDER_THROWN_ERROR" };
    }
    results.push({ fixture, ...classify(fixture, providerResult), latencyMs: Math.max(0, now() - startedAt) });
  }
  const metrics = calculateTextModerationMetrics(results, Math.max(0, now() - runStartedAt));
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const actualModels = [...new Set(results.flatMap(({ raw }) => {
    const model = raw?.metadata?.actualModel;
    return typeof model === "string" && model ? [model] : [];
  }))].sort();
  return {
    schemaVersion: TEXT_MODERATION_EVALUATION_SCHEMA_VERSION,
    runId: options.runId ?? `run-${generatedAt.replace(/[^0-9]/g, "").slice(0, 17)}`,
    generatedAt,
    fixture: { version: options.fixtureVersion ?? "UNSPECIFIED", count: fixtures.length },
    provider: {
      id: provider.id,
      displayName: provider.displayName,
      ...(provider.requestedModel ? { requestedModel: provider.requestedModel } : {}),
      actualModels,
      ...(provider.getReportMetadata ? { metadata: provider.getReportMetadata() } : {}),
    },
    metrics,
    falsePositives: results.filter(({ outcome }) => outcome === "FALSE_POSITIVE"),
    falseNegatives: results.filter(({ outcome }) => outcome === "FALSE_NEGATIVE"),
    unavailableOrErrors: results.filter(({ outcome }) => outcome === "UNAVAILABLE" || outcome === "ERROR"),
    results,
  };
};
