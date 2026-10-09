import { readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DetectorCapability, FixtureEvaluationResult, ImageModerationEvaluationDetector, ImageModerationEvaluationFixture, ImageModerationEvaluationMetrics, ImageModerationEvaluationReport, ImageModerationSurface, MetricSlice, IMAGE_MODERATION_EVALUATION_SCHEMA_VERSION } from "./imageModerationEvaluation.types";

const capabilities = new Set<DetectorCapability>(["NSFW", "NUDITY", "PORNOGRAPHY", "SUGGESTIVE", "HENTAI", "VIOLENCE", "GORE", "FIREARM", "CONTEXTUAL_WEAPON", "SUBSTANCE", "TOBACCO", "AI_GENERATED", "MINOR", "TECHNICAL_QUALITY"]);
const categories = new Set(["NUDITY", "PORNOGRAPHY", "SEXUAL_CONTENT", "SUGGESTIVE", "HENTAI", "GENERATED_SEXUAL", "GRAPHIC_VIOLENCE", "GORE", "FIREARM", "THREATENING_WEAPON", "SUBSTANCE_USE", "TOBACCO_USE", "AI_GENERATED_PERSON", "MINOR_SOLO", "IMAGE_UNREADABLE"]);
const surfaces = new Set<ImageModerationSurface>(["USER_AVATAR", "USER_COVER", "USER_PROFILE_PHOTO", "CREATOR_APPLICATION_AVATAR", "CREATOR_APPLICATION_COVER", "CREATOR_APPLICATION_MEDIA", "CREATOR_PROFILE_AVATAR", "CREATOR_PROFILE_COVER", "CREATOR_PROFILE_MEDIA", "CREATOR_SERVICE_MEDIA"]);
const difficulties = new Set(["EASY", "CONTEXTUAL", "ADVERSARIAL"]);
const rate = (n: number, d: number) => d ? n / d : null;
const percentile = (values: readonly number[], p: number) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null;

export const resolveImageModerationFixtureAsset = (assetRoot: string, reference: string) => {
  if (!reference || path.isAbsolute(reference) || reference.includes("\\") || reference.split("/").includes("..")) throw new Error(`Unsafe fixture asset reference: ${reference}`);
  const root = path.resolve(assetRoot); const resolved = path.resolve(root, reference);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Fixture asset escapes root: ${reference}`);
  return resolved;
};

export const validateImageModerationFixtures = (fixtures: readonly ImageModerationEvaluationFixture[]) => {
  if (!fixtures.length) throw new Error("At least one image moderation fixture is required");
  const ids = new Set<string>();
  for (const fixture of fixtures) {
    if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(fixture.id) || ids.has(fixture.id)) throw new Error(`Duplicate or invalid fixture ID: ${fixture.id}`); ids.add(fixture.id);
    if (!fixture.description || fixture.description.length > 300 || !fixture.rationale || fixture.rationale.length > 500) throw new Error(`Invalid fixture text: ${fixture.id}`);
    resolveImageModerationFixtureAsset("/fixture-root", fixture.asset);
    if (!difficulties.has(fixture.difficulty) || !fixture.tags.length || new Set(fixture.tags).size !== fixture.tags.length) throw new Error(`Invalid fixture classification: ${fixture.id}`);
    if (!fixture.requiredCapabilities.length || fixture.requiredCapabilities.some((capability) => !capabilities.has(capability))) throw new Error(`Invalid capabilities: ${fixture.id}`);
    const expectations = Object.entries(fixture.expectedBySurface);
    if (!expectations.length) throw new Error(`Fixture has no surface expectations: ${fixture.id}`);
    for (const [surface, expected] of expectations) {
      if (!surfaces.has(surface as ImageModerationSurface) || !expected || !["PASS", "BLOCK", "UNCERTAIN"].includes(expected.decision)) throw new Error(`Invalid expected outcome: ${fixture.id}`);
      if (new Set(expected.categories).size !== expected.categories.length || expected.categories.some((category) => !categories.has(category))) throw new Error(`Invalid expected categories: ${fixture.id}`);
      if (expected.decision === "PASS" && expected.categories.length) throw new Error(`PASS fixture cannot have categories: ${fixture.id}`);
      if (expected.decision !== "PASS" && !expected.categories.length) throw new Error(`Non-PASS fixture needs categories: ${fixture.id}`);
    }
    if (!["SYNTHETIC", "INTERNAL", "EXTERNAL"].includes(fixture.provenance.kind)) throw new Error(`Invalid provenance: ${fixture.id}`);
  }
};

const metricSlice = (results: readonly FixtureEvaluationResult[]): MetricSlice => {
  const supported = results.filter((result) => result.outcome === "SUPPORTED_AND_CORRECT" || result.outcome === "SUPPORTED_AND_INCORRECT");
  const correct = supported.filter((result) => result.outcome === "SUPPORTED_AND_CORRECT").length;
  const incorrect = supported.length - correct;
  const falsePositive = supported.filter((result) => result.expectedDecision === "PASS" && result.actualDecision === "BLOCK").length;
  const falseNegative = supported.filter((result) => result.expectedDecision === "BLOCK" && result.actualDecision === "PASS").length;
  const expectedPass = supported.filter((result) => result.expectedDecision === "PASS").length;
  const expectedBlock = supported.filter((result) => result.expectedDecision === "BLOCK").length;
  const confusion: Record<string, number> = {};
  for (const result of supported) { const key = `${result.expectedDecision}->${result.actualDecision}`; confusion[key] = (confusion[key] ?? 0) + 1; }
  return { total: results.length, supported: supported.length, correct, incorrect, unsupported: results.filter((result) => result.outcome === "NOT_SUPPORTED").length, unavailableOrError: results.filter((result) => result.outcome === "UNAVAILABLE" || result.outcome === "ERROR").length, accuracy: rate(correct, supported.length), falsePositive, falseNegative, falsePositiveRate: rate(falsePositive, expectedPass), falseNegativeRate: rate(falseNegative, expectedBlock), blockRecall: rate(supported.filter((result) => result.expectedDecision === "BLOCK" && result.actualDecision === "BLOCK").length, expectedBlock), passRecall: rate(supported.filter((result) => result.expectedDecision === "PASS" && result.actualDecision === "PASS").length, expectedPass), confusion };
};
const groups = (results: readonly FixtureEvaluationResult[], keys: (result: FixtureEvaluationResult) => readonly string[]) => { const map = new Map<string, FixtureEvaluationResult[]>(); for (const result of results) for (const key of keys(result)) map.set(key, [...(map.get(key) ?? []), result]); return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => [key, metricSlice(values)])); };

export const calculateImageModerationMetrics = (results: readonly FixtureEvaluationResult[], totalRunTimeMs: number, metadata: ReturnType<NonNullable<ImageModerationEvaluationDetector["getPerformanceMetadata"]>> | undefined = undefined): ImageModerationEvaluationMetrics => {
  const base = metricSlice(results); const timings = results.map((result) => result.latencyMs); const evaluated = results.filter((result) => result.providerStatus === "COMPLETED");
  return { ...base, byCapability: groups(results, (result) => result.requiredCapabilities), byCategory: groups(results, (result) => result.expectedCategories.length ? result.expectedCategories : ["PASS_NONE"]), byDifficulty: {}, bySurface: groups(results, (result) => [result.surface]), performance: { coldStartMs: metadata?.coldStartMs ?? null, totalRunTimeMs, averageInferenceMs: rate(timings.reduce((sum, value) => sum + value, 0), timings.length), medianInferenceMs: percentile(timings, .5), p95InferenceMs: percentile(timings, .95), minInferenceMs: timings.length ? Math.min(...timings) : null, maxInferenceMs: timings.length ? Math.max(...timings) : null, throughputPerSecond: totalRunTimeMs > 0 ? evaluated.length / (totalRunTimeMs / 1000) : null, processRssBeforeLoadBytes: metadata?.processRssBeforeLoadBytes ?? null, processRssAfterLoadBytes: metadata?.processRssAfterLoadBytes ?? null, modelArtifactBytes: metadata?.modelArtifactBytes ?? null, exceedsThirtySecondBoundaryCount: timings.filter((value) => value >= 30_000).length } };
};

export const evaluateImageModerationFixtures = async (fixtures: readonly ImageModerationEvaluationFixture[], detector: ImageModerationEvaluationDetector, options: Readonly<{ assetRoot: string; fixtureVersion: string; now?: () => number; generatedAt?: string; runId?: string }> ): Promise<ImageModerationEvaluationReport> => {
  validateImageModerationFixtures(fixtures); if (!detector.capabilities.length || detector.capabilities.some((capability) => !capabilities.has(capability))) throw new Error(`Detector declares invalid capabilities: ${detector.id}`); const now = options.now ?? (() => performance.now()); const started = now(); const initializeStarted = now(); await detector.initialize?.(); const coldStartMs = Math.max(0, now() - initializeStarted); const results: FixtureEvaluationResult[] = [];
  for (const fixture of fixtures) for (const [surface, expected] of Object.entries(fixture.expectedBySurface) as [ImageModerationSurface, NonNullable<ImageModerationEvaluationFixture["expectedBySurface"][ImageModerationSurface]>][]) {
    const assetPath = resolveImageModerationFixtureAsset(options.assetRoot, fixture.asset); let bytes: Buffer;
    try { bytes = await readFile(assetPath); } catch { throw new Error(`Fixture asset is missing or unreadable: ${fixture.asset}`); }
    if (!bytes.length) throw new Error(`Fixture asset is empty: ${fixture.asset}`);
    if (!fixture.requiredCapabilities.every((capability) => detector.capabilities.includes(capability))) { results.push({ fixtureId: fixture.id, surface, expectedDecision: expected.decision, expectedCategories: expected.categories, requiredCapabilities: fixture.requiredCapabilities, providerStatus: "NOT_SUPPORTED", actualDecision: null, actualCategories: [], outcome: "NOT_SUPPORTED", latencyMs: 0, errorCode: null }); continue; }
    const point = now(); let response; try { response = await detector.evaluate({ fixture, surface, assetPath, bytes }); } catch { response = { status: "ERROR" as const, errorCode: "DETECTOR_THROWN_ERROR" }; }
    const latencyMs = Math.max(0, now() - point);
    if (response.status !== "COMPLETED") { results.push({ fixtureId: fixture.id, surface, expectedDecision: expected.decision, expectedCategories: expected.categories, requiredCapabilities: fixture.requiredCapabilities, providerStatus: response.status, actualDecision: null, actualCategories: [], outcome: response.status, latencyMs, errorCode: response.errorCode.slice(0, 100) }); continue; }
    if (!Number.isFinite(latencyMs) || response.findings.some((finding) => finding.score !== undefined && !Number.isFinite(finding.score))) throw new Error(`Non-finite evaluation value for ${fixture.id}`);
    const actualCategories = response.findings.map((finding) => finding.category).filter((category, index, values) => categories.has(category) && values.indexOf(category) === index).sort();
    const correct = response.decision === expected.decision && actualCategories.join("|") === [...expected.categories].sort().join("|");
    results.push({ fixtureId: fixture.id, surface, expectedDecision: expected.decision, expectedCategories: expected.categories, requiredCapabilities: fixture.requiredCapabilities, providerStatus: "COMPLETED", actualDecision: response.decision, actualCategories, outcome: correct ? "SUPPORTED_AND_CORRECT" : "SUPPORTED_AND_INCORRECT", latencyMs, errorCode: null });
  }
  const generatedAt = options.generatedAt ?? new Date().toISOString(); const metadata = { ...(detector.getPerformanceMetadata?.() ?? {}), coldStartMs };
  const metrics = calculateImageModerationMetrics(results, Math.max(0, now() - started), metadata);
  return { schemaVersion: IMAGE_MODERATION_EVALUATION_SCHEMA_VERSION, runId: options.runId ?? `image-${generatedAt.replace(/[^0-9]/g, "").slice(0, 17)}`, generatedAt, fixture: { version: options.fixtureVersion, fixtureCount: fixtures.length, evaluatedCases: results.length }, detector: { id: detector.id, version: detector.version, displayName: detector.displayName, capabilities: [...detector.capabilities].sort() }, metrics: { ...metrics, byDifficulty: groups(results, (result) => { const fixture = fixtures.find((item) => item.id === result.fixtureId)!; return [fixture.difficulty]; }) }, results, notes: ["Evaluation-only harness; fixture SVGs are safe synthetic controls, not model-quality evidence.", "The 30-second value is a product fallback boundary, not a decision threshold."] };
};
