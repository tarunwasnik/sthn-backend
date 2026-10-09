import { access } from "node:fs/promises";
import path from "node:path";
import { ImageModerationSurface, ImagePolicyCategory } from "../imageModerationEvaluation.types";
import { SEXUAL_CONTENT_BENCHMARK_SCHEMA_VERSION, ModelQualitySexualContentFixture, SexualContentCoverageTarget, SexualContentDatasetAnalysis } from "./sexualContentBenchmark.types";

const contextTags = new Set(["PORTRAIT", "PROFESSIONAL", "FITNESS", "ATHLETIC", "BEACH", "SWIMWEAR", "SHIRTLESS", "FASHION", "COUPLE", "GROUP", "ANIME", "DRAWING", "AI_GENERATED", "SUGGESTIVE_BOUNDARY", "EXPLICIT_BOUNDARY"]);
const reviewStates = new Set(["PROPOSED", "REVIEW_REQUIRED", "APPROVED"]);
const provenance = new Set(["INTERNAL", "SYNTHETIC_GENERATED", "EXTERNAL_DATASET"]);
const validCategories = new Set<ImagePolicyCategory>(["NUDITY", "PORNOGRAPHY", "SEXUAL_CONTENT", "SUGGESTIVE", "HENTAI", "GENERATED_SEXUAL", "AI_GENERATED_PERSON"]);
const validSurfaces = new Set<ImageModerationSurface>(["USER_AVATAR", "USER_COVER", "USER_PROFILE_PHOTO", "CREATOR_APPLICATION_AVATAR", "CREATOR_APPLICATION_COVER", "CREATOR_APPLICATION_MEDIA", "CREATOR_PROFILE_AVATAR", "CREATOR_PROFILE_COVER", "CREATOR_PROFILE_MEDIA", "CREATOR_SERVICE_MEDIA"]);
const increment = (group: Record<string, Record<string, number>>, key: string, value: string) => { group[key] ??= {}; group[key][value] = (group[key][value] ?? 0) + 1; };

export const validateSexualContentBenchmarkFixtures = (fixtures: readonly ModelQualitySexualContentFixture[]) => {
  const ids = new Set<string>(); const pairs = new Map<string, string[]>();
  for (const fixture of fixtures) {
    if (!/^sthn-sexual-[a-z0-9-]{3,79}$/.test(fixture.id) || ids.has(fixture.id)) throw new Error(`Duplicate or invalid model-quality fixture ID: ${fixture.id}`); ids.add(fixture.id);
    if (!fixture.description || !fixture.rationale || !fixture.contextTags.length || fixture.contextTags.some((tag) => !contextTags.has(tag))) throw new Error(`Invalid fixture metadata: ${fixture.id}`);
    if (!fixture.coverageClasses.length || !fixture.requiredCapabilities.length || !fixture.sourceLabels.every((label) => label.length <= 120)) throw new Error(`Invalid fixture labels: ${fixture.id}`);
    if (!provenance.has(fixture.provenance.kind) || !fixture.provenance.referenceNote || fixture.provenance.referenceNote.length > 500) throw new Error(`Invalid provenance: ${fixture.id}`);
    if (!reviewStates.has(fixture.review.status) || !fixture.review.rationale || fixture.review.rationale.length > 500) throw new Error(`Invalid review state: ${fixture.id}`);
    if (fixture.review.status === "APPROVED" && (!fixture.localAsset || !fixture.provenance.license || !fixture.review.policyVersion || !fixture.review.reviewedAt)) throw new Error(`Approved fixture lacks asset/license/review authority: ${fixture.id}`);
    for (const [surface, expected] of Object.entries(fixture.expectedBySurface)) {
      if (!validSurfaces.has(surface as ImageModerationSurface) || !expected || !["PASS", "BLOCK", "UNCERTAIN"].includes(expected.decision) || expected.categories.some((category) => !validCategories.has(category))) throw new Error(`Invalid STHN policy label: ${fixture.id}`);
      if (expected.decision === "PASS" && expected.categories.length) throw new Error(`PASS fixture has a harmful category: ${fixture.id}`);
      if (expected.decision !== "PASS" && !expected.categories.length) throw new Error(`Non-PASS fixture lacks category: ${fixture.id}`);
    }
    if (fixture.boundaryPairId) pairs.set(fixture.boundaryPairId, [...(pairs.get(fixture.boundaryPairId) ?? []), fixture.id]);
  }
  for (const [pair, members] of pairs) if (members.length !== 2) throw new Error(`Boundary pair ${pair} must reference exactly two fixtures`);
};

export const analyzeSexualContentBenchmark = (fixtures: readonly ModelQualitySexualContentFixture[], targets: readonly SexualContentCoverageTarget[], version: string): SexualContentDatasetAnalysis => {
  validateSexualContentBenchmarkFixtures(fixtures); const composition: Record<string, Record<string, number>> = {};
  const approved = fixtures.filter((fixture) => fixture.review.status === "APPROVED");
  for (const fixture of fixtures) { increment(composition, "reviewStatus", fixture.review.status); increment(composition, "provenance", fixture.provenance.kind); increment(composition, "difficulty", fixture.difficulty); for (const tag of fixture.contextTags) increment(composition, "contextTag", tag); for (const [surface, expected] of Object.entries(fixture.expectedBySurface)) { increment(composition, "surface", surface); increment(composition, "expectedDecision", expected!.decision); for (const category of expected!.categories) increment(composition, "expectedCategory", category); } }
  const coverage = targets.map((target) => { const approvedCount = approved.filter((fixture) => fixture.coverageClasses.includes(target.coverageClass)).length; return { coverageClass: target.coverageClass, requiredMinimum: target.requiredMinimum, approvedCount, gap: Math.max(0, target.requiredMinimum - approvedCount), expectedDecision: target.expectedDecision }; });
  const pairMap = new Map<string, string[]>(); for (const fixture of fixtures) if (fixture.boundaryPairId) pairMap.set(fixture.boundaryPairId, [...(pairMap.get(fixture.boundaryPairId) ?? []), fixture.id]);
  return { schemaVersion: SEXUAL_CONTENT_BENCHMARK_SCHEMA_VERSION, benchmarkVersion: version, modelQualityFixtureCount: fixtures.length, approvedFixtureCount: approved.length, approvedEvaluationCaseCount: approved.reduce((count, fixture) => count + Object.keys(fixture.expectedBySurface).length, 0), composition, coverage, boundaryPairs: [...pairMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, fixtureIds]) => ({ id, fixtureIds, valid: fixtureIds.length === 2 })) };
};

/** Guards I4-B official runs: planned/unreviewed fixtures never become evidence. */
export const requireApprovedSexualContentAssets = async (fixtures: readonly ModelQualitySexualContentFixture[], assetRoot: string) => {
  const approved = fixtures.filter((fixture) => fixture.review.status === "APPROVED");
  if (!approved.length) throw new Error("No approved model-quality sexual-content fixtures are available for an official evaluation");
  for (const fixture of approved) { const asset = fixture.localAsset!; if (path.isAbsolute(asset) || asset.includes("\\") || asset.split("/").includes("..")) throw new Error(`Unsafe approved fixture asset: ${fixture.id}`); try { await access(path.resolve(assetRoot, asset)); } catch { throw new Error(`Approved model-quality fixture asset is missing: ${fixture.id}`); } }
  return approved;
};
