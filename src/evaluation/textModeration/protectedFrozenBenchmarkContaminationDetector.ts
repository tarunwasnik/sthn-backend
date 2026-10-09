import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TEXT_DUPLICATE_NORMALIZATION_VERSION, normalizeTextForDuplicateDetection, textDuplicateFingerprint } from "../../research/textModerationDataset/identity";
import { TEXT_MODERATION_FIXTURE_VERSION, textModerationEvaluationFixtures } from "./textModerationFixtures";

export const FROZEN_TEXT_MODERATION_FIXTURE_SHA256 = "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747" as const;
export const FROZEN_TEXT_MODERATION_FIXTURE_COUNT = 140 as const;
export const PROTECTED_CONTAMINATION_DETECTOR_VERSION = "STHN_PROTECTED_FROZEN_TEXT_CONTAMINATION_DETECTOR_V1" as const;
export const PROTECTED_FUZZY_DETECTOR_VERSION = "STHN_PROTECTED_CHAR_TRIGRAM_JACCARD_V1" as const;
export const PROTECTED_FUZZY_THRESHOLD = 0.9 as const;
export const PROTECTED_FUZZY_MINIMUM_NORMALIZED_LENGTH = 20 as const;

export interface ProtectedContaminationCandidateInput {
  readonly candidateRowId: string;
  readonly candidateTextDigest: string;
  readonly text: string;
}

export interface ProtectedContaminationFinding {
  readonly candidateRowId: string;
  readonly candidateTextDigest: string;
  readonly fixtureOpaqueId: string;
  readonly fixtureFingerprint: string;
  readonly comparisonType: "EXACT_MATCH" | "NORMALIZED_MATCH" | "FUZZY_CHAR_TRIGRAM_JACCARD";
  readonly matched: true;
  readonly similarity: number;
  readonly threshold: number;
  readonly detectorVersion: string;
  readonly disposition: "POTENTIAL_CONTAMINATION_REVIEW_REQUIRED";
}

export interface ProtectedContaminationResult {
  readonly detectorVersion: typeof PROTECTED_CONTAMINATION_DETECTOR_VERSION;
  readonly fixtureVersion: typeof TEXT_MODERATION_FIXTURE_VERSION;
  readonly fixturePublishedSha256: typeof FROZEN_TEXT_MODERATION_FIXTURE_SHA256;
  readonly fixtureCount: typeof FROZEN_TEXT_MODERATION_FIXTURE_COUNT;
  readonly normalizationVersion: typeof TEXT_DUPLICATE_NORMALIZATION_VERSION;
  readonly fuzzyDetectorVersion: typeof PROTECTED_FUZZY_DETECTOR_VERSION;
  readonly fuzzyThreshold: typeof PROTECTED_FUZZY_THRESHOLD;
  readonly fuzzyMinimumNormalizedLength: typeof PROTECTED_FUZZY_MINIMUM_NORMALIZED_LENGTH;
  readonly comparedCandidateCount: number;
  readonly findings: readonly ProtectedContaminationFinding[];
}

const sha256 = (value: string | Buffer): string => crypto.createHash("sha256").update(value).digest("hex");
const trigrams = (value: string): Set<string> => {
  const points = [...value]; const result = new Set<string>();
  for (let index = 0; index <= points.length - 3; index += 1) result.add(points.slice(index, index + 3).join(""));
  return result;
};
const jaccard = (left: Set<string>, right: Set<string>): number => {
  if (!left.size && !right.size) return 1; let intersection = 0; left.forEach((item) => { if (right.has(item)) intersection += 1; });
  return Number((intersection / (left.size + right.size - intersection)).toFixed(6));
};
const fixtureSourcePath = (): string => path.resolve(process.cwd(), "src", "evaluation", "textModeration", "textModerationFixtures.ts");
const opaqueFixtureId = (fixtureId: string, exactDigest: string): string => `frozen_fixture_${sha256(`${TEXT_MODERATION_FIXTURE_VERSION}:${fixtureId}:${exactDigest}`)}`;

/**
 * Sole boundary allowed to read frozen fixture text for candidate-contamination detection.
 * Returned values contain hashes, opaque references, scores and dispositions only.
 */
export const compareCandidatesToProtectedFrozenBenchmark = (candidates: readonly ProtectedContaminationCandidateInput[]): ProtectedContaminationResult => {
  const fixtureHash = sha256(fs.readFileSync(fixtureSourcePath()));
  if (fixtureHash !== FROZEN_TEXT_MODERATION_FIXTURE_SHA256 || TEXT_MODERATION_FIXTURE_VERSION !== "STHN_TEXT_MODERATION_FIXTURES_V1R"
    || textModerationEvaluationFixtures.length !== FROZEN_TEXT_MODERATION_FIXTURE_COUNT) throw new Error("Protected frozen fixture authority verification failed");
  if (new Set(candidates.map((candidate) => candidate.candidateRowId)).size !== candidates.length
    || candidates.some((candidate) => !candidate.candidateRowId || sha256(candidate.text) !== candidate.candidateTextDigest)) throw new Error("Protected detector candidate identity verification failed");

  const fixtures = textModerationEvaluationFixtures.map((fixture) => {
    const exactDigest = sha256(fixture.text); const normalized = normalizeTextForDuplicateDetection(fixture.text);
    return { opaqueId: opaqueFixtureId(fixture.id, exactDigest), exactDigest, normalizedFingerprint: textDuplicateFingerprint(fixture.text),
      normalizedLength: [...normalized].length, trigramSignature: trigrams(normalized) };
  });
  const findings: ProtectedContaminationFinding[] = [];
  for (const candidate of candidates) {
    const normalized = normalizeTextForDuplicateDetection(candidate.text); const exactDigest = sha256(candidate.text);
    const exact = fixtures.find((fixture) => fixture.exactDigest === exactDigest);
    if (exact) { findings.push({ candidateRowId: candidate.candidateRowId, candidateTextDigest: candidate.candidateTextDigest, fixtureOpaqueId: exact.opaqueId,
      fixtureFingerprint: exact.exactDigest, comparisonType: "EXACT_MATCH", matched: true, similarity: 1, threshold: 1,
      detectorVersion: PROTECTED_CONTAMINATION_DETECTOR_VERSION, disposition: "POTENTIAL_CONTAMINATION_REVIEW_REQUIRED" }); continue; }
    const normalizedFingerprint = textDuplicateFingerprint(candidate.text); const normalizedMatch = fixtures.find((fixture) => fixture.normalizedFingerprint === normalizedFingerprint);
    if (normalizedMatch) { findings.push({ candidateRowId: candidate.candidateRowId, candidateTextDigest: candidate.candidateTextDigest, fixtureOpaqueId: normalizedMatch.opaqueId,
      fixtureFingerprint: normalizedMatch.normalizedFingerprint, comparisonType: "NORMALIZED_MATCH", matched: true, similarity: 1, threshold: 1,
      detectorVersion: PROTECTED_CONTAMINATION_DETECTOR_VERSION, disposition: "POTENTIAL_CONTAMINATION_REVIEW_REQUIRED" }); continue; }
    if ([...normalized].length < PROTECTED_FUZZY_MINIMUM_NORMALIZED_LENGTH) continue;
    const signature = trigrams(normalized); let best: { fixture: typeof fixtures[number]; score: number } | null = null;
    for (const fixture of fixtures) {
      if (fixture.normalizedLength < PROTECTED_FUZZY_MINIMUM_NORMALIZED_LENGTH) continue;
      const score = jaccard(signature, fixture.trigramSignature); if (!best || score > best.score) best = { fixture, score };
    }
    if (best && best.score >= PROTECTED_FUZZY_THRESHOLD) findings.push({ candidateRowId: candidate.candidateRowId, candidateTextDigest: candidate.candidateTextDigest,
      fixtureOpaqueId: best.fixture.opaqueId, fixtureFingerprint: best.fixture.normalizedFingerprint, comparisonType: "FUZZY_CHAR_TRIGRAM_JACCARD",
      matched: true, similarity: best.score, threshold: PROTECTED_FUZZY_THRESHOLD, detectorVersion: PROTECTED_FUZZY_DETECTOR_VERSION,
      disposition: "POTENTIAL_CONTAMINATION_REVIEW_REQUIRED" });
  }
  return { detectorVersion: PROTECTED_CONTAMINATION_DETECTOR_VERSION, fixtureVersion: TEXT_MODERATION_FIXTURE_VERSION,
    fixturePublishedSha256: FROZEN_TEXT_MODERATION_FIXTURE_SHA256, fixtureCount: FROZEN_TEXT_MODERATION_FIXTURE_COUNT,
    normalizationVersion: TEXT_DUPLICATE_NORMALIZATION_VERSION, fuzzyDetectorVersion: PROTECTED_FUZZY_DETECTOR_VERSION,
    fuzzyThreshold: PROTECTED_FUZZY_THRESHOLD, fuzzyMinimumNormalizedLength: PROTECTED_FUZZY_MINIMUM_NORMALIZED_LENGTH,
    comparedCandidateCount: candidates.length, findings: findings.sort((left, right) => left.candidateRowId.localeCompare(right.candidateRowId)) };
};
