import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import { MhsCandidateAdmissionArtifact, validateMhsCandidateAdmissionArtifact } from "./mhsCandidateAdmission";
import { MHS_CANDIDATE_ARTIFACT_SHA256, MHS_CANDIDATE_PAYLOAD_DIGEST } from "./mhsCandidateIntegrityAudit";
import { MhsSemanticAuditArtifact, validateMhsSemanticAuditArtifact } from "./mhsSemanticIntegrityAudit";
import {
  ImportedMhsSemanticPairReview, MHS_SEMANTIC_DECISION_RELATIONSHIPS, MHS_SEMANTIC_RELATIONSHIP_OUTCOMES,
  MHS_SEMANTIC_REVIEW_CSV_FILENAME, MHS_SEMANTIC_REVIEW_MANIFEST_FILENAME, MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST,
  MHS_SEMANTIC_REVIEW_PACKET_SIZE, MHS_SEMANTIC_REVIEW_PACKET_VERSION, MHS_SEMANTIC_SCORE_BANDS,
  MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST, MHS_SEMANTIC_SOURCE_SHA256, MhsSemanticDecisionRelationship,
  MhsSemanticRelationshipOutcome, MhsSemanticReviewManifest, MhsSemanticScoreBand, parseCompletedMhsSemanticReviewCsv,
  validateMhsSemanticReviewManifest,
} from "./mhsSemanticReviewPacket";
import { writeImmutableFileAtomic } from "./mhsReviewImport";

export const MHS_SEMANTIC_COMPLETED_REVIEW_FILENAME = "mhs-semantic-review-v1-completed-reviewer-a-corrected.csv" as const;
export const MHS_SEMANTIC_COMPLETED_REVIEW_SHA256 = "376dc31d036f58d8b5046c3940b54c7e9a3a8ac9ecc1b9cb6e5165c404753d5f" as const;
export const MHS_SEMANTIC_BLINDED_PACKET_SHA256 = "759a2d47b8d78ba1d11be36b7c5c54bcbe00f20c57202a1d37b0135b62a3427f" as const;
export const MHS_SEMANTIC_REVIEW_MANIFEST_SHA256 = "2402f995c1300954a2316fe247132d5fcefb2e5d83e4e0d84e91770d7be95377" as const;
export const MHS_SEMANTIC_REVIEWER_ID = "a" as const;
export const MHS_SEMANTIC_VALIDATED_REVIEW_SCHEMA_VERSION = "STHN_TEXT_MODERATION_MHS_SEMANTIC_VALIDATED_REVIEW_V1" as const;
export const MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME = "mhs-semantic-review-v1-validated-reviewer-a.json" as const;
export const MHS_SEMANTIC_PRECISION_SCHEMA_VERSION = "STHN_TEXT_MODERATION_MHS_SEMANTIC_PRECISION_ANALYSIS_V1" as const;
export const MHS_SEMANTIC_PRECISION_FILENAME = "mhs-semantic-review-v1-precision-analysis.json" as const;
export const MHS_SEMANTIC_THRESHOLD_CANDIDATES = [0.8, 0.81, 0.82, 0.83, 0.84, 0.85] as const;

export interface ValidatedMhsSemanticReviewRecord {
  readonly pairRowNumber: number; readonly pairKey: string; readonly candidateAId: string; readonly candidateBId: string;
  readonly candidateADigest: string; readonly candidateBDigest: string; readonly semanticScore: number;
  readonly scoreBand: MhsSemanticScoreBand; readonly decisionRelationship: MhsSemanticDecisionRelationship;
  readonly candidateAPrimaryCategory: string | null; readonly candidateBPrimaryCategory: string | null;
  readonly semanticRelationship: MhsSemanticRelationshipOutcome; readonly reviewerNote: string | null; readonly reviewedAt: string;
}
export interface MhsSemanticOutcomeSummary { readonly count: number; readonly rate: number; readonly percentage: number; }
export interface MhsSemanticValidatedReviewPayload {
  readonly schemaVersion: typeof MHS_SEMANTIC_VALIDATED_REVIEW_SCHEMA_VERSION; readonly validationStatus: "VALIDATED";
  readonly sourceCompletedCsvFilename: typeof MHS_SEMANTIC_COMPLETED_REVIEW_FILENAME; readonly completedCsvSha256: typeof MHS_SEMANTIC_COMPLETED_REVIEW_SHA256;
  readonly sourceBlindedPacketFilename: typeof MHS_SEMANTIC_REVIEW_CSV_FILENAME; readonly sourceBlindedPacketSha256: typeof MHS_SEMANTIC_BLINDED_PACKET_SHA256;
  readonly sourceManifestFilename: typeof MHS_SEMANTIC_REVIEW_MANIFEST_FILENAME; readonly sourceManifestSha256: typeof MHS_SEMANTIC_REVIEW_MANIFEST_SHA256;
  readonly packetVersion: typeof MHS_SEMANTIC_REVIEW_PACKET_VERSION; readonly packetMembershipDigest: typeof MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST;
  readonly sourceSemanticArtifactSha256: typeof MHS_SEMANTIC_SOURCE_SHA256; readonly sourceSemanticPayloadDigest: typeof MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST;
  readonly reviewerId: typeof MHS_SEMANTIC_REVIEWER_ID; readonly reviewedAt: { readonly minimum: string; readonly maximum: string; readonly distinctCount: number };
  readonly rowCount: typeof MHS_SEMANTIC_REVIEW_PACKET_SIZE; readonly importedAt: string; readonly records: readonly ValidatedMhsSemanticReviewRecord[];
  readonly humanOutcomeCounts: Readonly<Record<MhsSemanticRelationshipOutcome, number>>;
  readonly candidateMutationApplied: false; readonly trainingEligibleCount: 0;
}
export interface MhsSemanticValidatedReviewArtifact extends MhsSemanticValidatedReviewPayload { readonly validatedReviewPayloadDigest: string; }

export interface PrecisionGroupRow {
  readonly sampleCount: number; readonly reviewedNonAdjudicationCount: number;
  readonly outcomeCounts: Readonly<Record<MhsSemanticRelationshipOutcome, number>>;
  readonly duplicateLikeCount: number; readonly duplicateLikePrecision: number; readonly relatedOrDuplicateRate: number;
  readonly relatedButDistinctRate: number; readonly unrelatedRate: number;
}
export interface ScoreStatistics { readonly count: number; readonly minimum: number | null; readonly maximum: number | null; readonly mean: number | null; readonly median: number | null; readonly p25: number | null; readonly p75: number | null; }
export interface ThresholdEvaluationRow {
  readonly threshold: number; readonly retainedCount: number; readonly retainedPercentage: number; readonly reviewedNonAdjudicationCount: number;
  readonly duplicateLikeCount: number; readonly duplicateLikePrecision: number; readonly duplicateLikeRecallWithinPacket: number;
  readonly relatedOrDuplicateRate: number; readonly allowBlockConflictRetainedCount: number; readonly allowBlockConflictCaptureRate: number;
}
export interface MhsSemanticPrecisionPayload {
  readonly schemaVersion: typeof MHS_SEMANTIC_PRECISION_SCHEMA_VERSION; readonly analysisStatus: "HUMAN_PRECISION_MEASURED_NO_DATASET_MUTATION";
  readonly sourceValidatedReviewArtifactFilename: typeof MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME; readonly sourceValidatedReviewArtifactSha256: string;
  readonly sourceValidatedReviewPayloadDigest: string; readonly completedCsvSha256: typeof MHS_SEMANTIC_COMPLETED_REVIEW_SHA256;
  readonly sourceSemanticArtifactSha256: typeof MHS_SEMANTIC_SOURCE_SHA256; readonly packetMembershipDigest: typeof MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST;
  readonly reviewerId: typeof MHS_SEMANTIC_REVIEWER_ID; readonly totalReviewedRows: typeof MHS_SEMANTIC_REVIEW_PACKET_SIZE; readonly generatedAt: string;
  readonly humanOutcomes: Readonly<Record<MhsSemanticRelationshipOutcome, MhsSemanticOutcomeSummary>>;
  readonly aggregate: { readonly duplicateLike: MhsSemanticOutcomeSummary; readonly notDuplicateLike: MhsSemanticOutcomeSummary; readonly unresolved: MhsSemanticOutcomeSummary };
  readonly scoreBandPrecision: Readonly<Record<MhsSemanticScoreBand, PrecisionGroupRow>>;
  readonly decisionRelationshipPrecision: Readonly<Record<MhsSemanticDecisionRelationship, PrecisionGroupRow>>;
  readonly categoryPairAnalysis: { readonly blockContainingCount: number; readonly samePrimaryCategory: PrecisionGroupRow; readonly differentPrimaryCategory: PrecisionGroupRow;
    readonly allowBlock: PrecisionGroupRow; readonly specificPrimaryCategoryPairs: Readonly<Record<string, PrecisionGroupRow>> };
  readonly scoreStatisticsByHumanOutcome: Readonly<Record<MhsSemanticRelationshipOutcome, ScoreStatistics>>;
  readonly thresholdEvaluation: readonly ThresholdEvaluationRow[];
  readonly duplicateLikePairKeys: readonly string[]; readonly falsePositivePairKeys: readonly string[];
  readonly recommendedFutureReviewFloor: { readonly value: 0.85; readonly authority: "FUTURE_REVIEW_FLOOR_INVESTIGATION_ONLY"; readonly rationale: string };
  readonly highConfidenceRecommendation: { readonly existingThreshold: 0.94; readonly recommendation: "RETAIN_UNCHANGED_AND_ESTABLISH_NO_AUTOMATIC_DUPLICATE_THRESHOLD_YET"; readonly rationale: string };
  readonly limitations: readonly string[]; readonly candidateMutationApplied: false; readonly trainingEligibleCount: 0;
}
export interface MhsSemanticPrecisionArtifact extends MhsSemanticPrecisionPayload { readonly precisionPayloadDigest: string; }

type AtomicPublisher = (temporaryPath: string, targetPath: string) => void;
export interface CreateValidatedReviewOptions { readonly completedCsvPath: string; readonly manifestPath: string; readonly blindedPacketPath: string; readonly outputDirectory: string; readonly importedAt?: string; readonly publishAtomic?: AtomicPublisher; }
export interface CreatePrecisionOptions { readonly validatedReviewArtifactPath: string; readonly outputDirectory: string; readonly generatedAt?: string; readonly publishAtomic?: AtomicPublisher; }

const payloadDigest = (payload: unknown): string => sha256(Buffer.from(canonicalJson(payload), "utf8"));
const rate = (numerator: number, denominator: number): number => denominator === 0 ? 0 : Number((numerator / denominator).toFixed(6));
const percentage = (numerator: number, denominator: number): number => Number((rate(numerator, denominator) * 100).toFixed(4));
const strictInstant = (value: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const outcomeCounts = (records: readonly Pick<ValidatedMhsSemanticReviewRecord, "semanticRelationship">[]): Readonly<Record<MhsSemanticRelationshipOutcome, number>> => Object.fromEntries(
  MHS_SEMANTIC_RELATIONSHIP_OUTCOMES.map((outcome) => [outcome, records.filter((record) => record.semanticRelationship === outcome).length]),
) as Readonly<Record<MhsSemanticRelationshipOutcome, number>>;
const isDuplicateLike = (record: Pick<ValidatedMhsSemanticReviewRecord, "semanticRelationship">): boolean => record.semanticRelationship === "DUPLICATE" || record.semanticRelationship === "NEAR_DUPLICATE";
const groupMetrics = (records: readonly ValidatedMhsSemanticReviewRecord[]): PrecisionGroupRow => {
  const counts = outcomeCounts(records); const nonAdjudication = records.length - counts.NEEDS_ADJUDICATION; const duplicateLike = counts.DUPLICATE + counts.NEAR_DUPLICATE;
  return { sampleCount: records.length, reviewedNonAdjudicationCount: nonAdjudication, outcomeCounts: counts, duplicateLikeCount: duplicateLike,
    duplicateLikePrecision: rate(duplicateLike, nonAdjudication), relatedOrDuplicateRate: rate(duplicateLike + counts.RELATED_BUT_DISTINCT, nonAdjudication),
    relatedButDistinctRate: rate(counts.RELATED_BUT_DISTINCT, nonAdjudication), unrelatedRate: rate(counts.UNRELATED, nonAdjudication) };
};
const percentile = (sorted: readonly number[], fraction: number): number | null => {
  if (!sorted.length) return null; const position = (sorted.length - 1) * fraction; const lower = Math.floor(position); const upper = Math.ceil(position);
  return Number((sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)).toFixed(6));
};
const scoreStatistics = (records: readonly ValidatedMhsSemanticReviewRecord[]): ScoreStatistics => {
  const values = records.map((record) => record.semanticScore).sort((a, b) => a - b); if (!values.length) return { count: 0, minimum: null, maximum: null, mean: null, median: null, p25: null, p75: null };
  return { count: values.length, minimum: values[0], maximum: values[values.length - 1], mean: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6)),
    median: percentile(values, 0.5), p25: percentile(values, 0.25), p75: percentile(values, 0.75) };
};

export const validateMhsSemanticValidatedReviewArtifact = (artifact: MhsSemanticValidatedReviewArtifact): void => {
  const { validatedReviewPayloadDigest, ...payload } = artifact;
  if (payload.schemaVersion !== MHS_SEMANTIC_VALIDATED_REVIEW_SCHEMA_VERSION || payload.validationStatus !== "VALIDATED"
    || payload.sourceCompletedCsvFilename !== MHS_SEMANTIC_COMPLETED_REVIEW_FILENAME || payload.completedCsvSha256 !== MHS_SEMANTIC_COMPLETED_REVIEW_SHA256
    || payload.sourceBlindedPacketFilename !== MHS_SEMANTIC_REVIEW_CSV_FILENAME || payload.sourceBlindedPacketSha256 !== MHS_SEMANTIC_BLINDED_PACKET_SHA256
    || payload.sourceManifestFilename !== MHS_SEMANTIC_REVIEW_MANIFEST_FILENAME || payload.sourceManifestSha256 !== MHS_SEMANTIC_REVIEW_MANIFEST_SHA256
    || payload.packetVersion !== MHS_SEMANTIC_REVIEW_PACKET_VERSION || payload.packetMembershipDigest !== MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST
    || payload.sourceSemanticArtifactSha256 !== MHS_SEMANTIC_SOURCE_SHA256 || payload.sourceSemanticPayloadDigest !== MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST
    || payload.reviewerId !== MHS_SEMANTIC_REVIEWER_ID || payload.rowCount !== MHS_SEMANTIC_REVIEW_PACKET_SIZE || payload.records.length !== MHS_SEMANTIC_REVIEW_PACKET_SIZE
    || payload.candidateMutationApplied || payload.trainingEligibleCount !== 0 || !strictInstant(payload.importedAt)
    || !strictInstant(payload.reviewedAt.minimum) || !strictInstant(payload.reviewedAt.maximum) || payload.reviewedAt.distinctCount < 1) throw new Error("Invalid semantic validated-review artifact identity");
  const seen = new Set<string>(); for (const [index, record] of payload.records.entries()) {
    if (record.pairRowNumber !== index + 1 || record.pairKey !== `${record.candidateAId}::${record.candidateBId}` || seen.has(record.pairKey)) throw new Error(`Invalid or duplicate semantic review record at row ${index + 1}`); seen.add(record.pairKey);
    if (!/^[a-f0-9]{64}$/.test(record.candidateADigest) || !/^[a-f0-9]{64}$/.test(record.candidateBDigest) || !MHS_SEMANTIC_SCORE_BANDS.includes(record.scoreBand)
      || !MHS_SEMANTIC_DECISION_RELATIONSHIPS.includes(record.decisionRelationship) || !MHS_SEMANTIC_RELATIONSHIP_OUTCOMES.includes(record.semanticRelationship)
      || !strictInstant(record.reviewedAt) || (record.reviewerNote?.length ?? 0) > 500) throw new Error(`Invalid semantic review record contract at row ${index + 1}`);
  }
  if (canonicalJson(payload.humanOutcomeCounts) !== canonicalJson(outcomeCounts(payload.records)) || validatedReviewPayloadDigest !== payloadDigest(payload)) throw new Error("Semantic validated-review summary or payload digest mismatch");
};

export const createMhsSemanticValidatedReview = (options: CreateValidatedReviewOptions): { readonly artifactPath: string; readonly artifactSha256: string; readonly artifact: MhsSemanticValidatedReviewArtifact } => {
  const completedBytes = fs.readFileSync(options.completedCsvPath); if (sha256(completedBytes) !== MHS_SEMANTIC_COMPLETED_REVIEW_SHA256) throw new Error("Completed semantic-review CSV SHA-256 mismatch");
  const manifestBytes = fs.readFileSync(options.manifestPath); if (sha256(manifestBytes) !== MHS_SEMANTIC_REVIEW_MANIFEST_SHA256) throw new Error("Semantic-review manifest SHA-256 mismatch");
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as MhsSemanticReviewManifest; validateMhsSemanticReviewManifest(manifest);
  if (sha256(fs.readFileSync(options.blindedPacketPath)) !== MHS_SEMANTIC_BLINDED_PACKET_SHA256) throw new Error("Blinded semantic-review packet SHA-256 mismatch");
  const imported = parseCompletedMhsSemanticReviewCsv(completedBytes.toString("utf8"), manifest, MHS_SEMANTIC_REVIEWER_ID);
  const records = imported.map((review: ImportedMhsSemanticPairReview, index): ValidatedMhsSemanticReviewRecord => {
    const pair = manifest.rows[index]; if (review.pairRowNumber !== pair.pairRowNumber || review.pairKey !== pair.pairKey) throw new Error(`Semantic review membership mismatch at row ${index + 1}`);
    return { pairRowNumber: pair.pairRowNumber, pairKey: pair.pairKey, candidateAId: pair.candidateAId, candidateBId: pair.candidateBId,
      candidateADigest: pair.candidateADigest, candidateBDigest: pair.candidateBDigest, semanticScore: pair.semanticScore, scoreBand: pair.scoreBand,
      decisionRelationship: pair.decisionRelationship, candidateAPrimaryCategory: pair.candidateAPrimaryCategory, candidateBPrimaryCategory: pair.candidateBPrimaryCategory,
      semanticRelationship: review.relationship, reviewerNote: review.reviewerNote, reviewedAt: review.reviewedAt };
  });
  const reviewedAtValues = [...new Set(records.map((record) => record.reviewedAt))].sort(); const importedAt = options.importedAt ?? new Date().toISOString(); if (!strictInstant(importedAt)) throw new Error("Semantic review import timestamp must be strict UTC ISO with milliseconds");
  const payload: MhsSemanticValidatedReviewPayload = { schemaVersion: MHS_SEMANTIC_VALIDATED_REVIEW_SCHEMA_VERSION, validationStatus: "VALIDATED",
    sourceCompletedCsvFilename: MHS_SEMANTIC_COMPLETED_REVIEW_FILENAME, completedCsvSha256: MHS_SEMANTIC_COMPLETED_REVIEW_SHA256,
    sourceBlindedPacketFilename: MHS_SEMANTIC_REVIEW_CSV_FILENAME, sourceBlindedPacketSha256: MHS_SEMANTIC_BLINDED_PACKET_SHA256,
    sourceManifestFilename: MHS_SEMANTIC_REVIEW_MANIFEST_FILENAME, sourceManifestSha256: MHS_SEMANTIC_REVIEW_MANIFEST_SHA256,
    packetVersion: MHS_SEMANTIC_REVIEW_PACKET_VERSION, packetMembershipDigest: MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST,
    sourceSemanticArtifactSha256: MHS_SEMANTIC_SOURCE_SHA256, sourceSemanticPayloadDigest: MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST,
    reviewerId: MHS_SEMANTIC_REVIEWER_ID, reviewedAt: { minimum: reviewedAtValues[0], maximum: reviewedAtValues[reviewedAtValues.length - 1], distinctCount: reviewedAtValues.length },
    rowCount: MHS_SEMANTIC_REVIEW_PACKET_SIZE, importedAt, records, humanOutcomeCounts: outcomeCounts(records), candidateMutationApplied: false, trainingEligibleCount: 0 };
  const artifact: MhsSemanticValidatedReviewArtifact = { ...payload, validatedReviewPayloadDigest: payloadDigest(payload) }; validateMhsSemanticValidatedReviewArtifact(artifact);
  const serialized = canonicalJson(artifact); const artifactPath = path.join(options.outputDirectory, MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME); writeImmutableFileAtomic(artifactPath, serialized, options.publishAtomic);
  return { artifactPath, artifactSha256: sha256(Buffer.from(serialized, "utf8")), artifact };
};

const validatePrecisionArtifact = (artifact: MhsSemanticPrecisionArtifact): void => {
  const { precisionPayloadDigest, ...payload } = artifact;
  if (payload.schemaVersion !== MHS_SEMANTIC_PRECISION_SCHEMA_VERSION || payload.analysisStatus !== "HUMAN_PRECISION_MEASURED_NO_DATASET_MUTATION"
    || payload.sourceValidatedReviewArtifactFilename !== MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME || !/^[a-f0-9]{64}$/.test(payload.sourceValidatedReviewArtifactSha256)
    || !/^[a-f0-9]{64}$/.test(payload.sourceValidatedReviewPayloadDigest) || payload.completedCsvSha256 !== MHS_SEMANTIC_COMPLETED_REVIEW_SHA256
    || payload.sourceSemanticArtifactSha256 !== MHS_SEMANTIC_SOURCE_SHA256 || payload.packetMembershipDigest !== MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST
    || payload.reviewerId !== MHS_SEMANTIC_REVIEWER_ID || payload.totalReviewedRows !== MHS_SEMANTIC_REVIEW_PACKET_SIZE || !strictInstant(payload.generatedAt)
    || payload.thresholdEvaluation.length !== MHS_SEMANTIC_THRESHOLD_CANDIDATES.length || payload.candidateMutationApplied || payload.trainingEligibleCount !== 0
    || precisionPayloadDigest !== payloadDigest(payload)) throw new Error("Invalid semantic precision artifact identity or digest");
};
export { validatePrecisionArtifact as validateMhsSemanticPrecisionArtifact };

export const createMhsSemanticPrecisionAnalysis = (options: CreatePrecisionOptions): { readonly artifactPath: string; readonly artifactSha256: string; readonly artifact: MhsSemanticPrecisionArtifact } => {
  const sourceBytes = fs.readFileSync(options.validatedReviewArtifactPath); const sourceSha = sha256(sourceBytes);
  const source = JSON.parse(sourceBytes.toString("utf8")) as MhsSemanticValidatedReviewArtifact; validateMhsSemanticValidatedReviewArtifact(source);
  const records = source.records; const counts = outcomeCounts(records); const duplicateLikeTotal = counts.DUPLICATE + counts.NEAR_DUPLICATE;
  const byScoreBand = Object.fromEntries(MHS_SEMANTIC_SCORE_BANDS.map((band) => [band, groupMetrics(records.filter((record) => record.scoreBand === band))])) as Readonly<Record<MhsSemanticScoreBand, PrecisionGroupRow>>;
  const byDecision = Object.fromEntries(MHS_SEMANTIC_DECISION_RELATIONSHIPS.map((relationship) => [relationship, groupMetrics(records.filter((record) => record.decisionRelationship === relationship))])) as Readonly<Record<MhsSemanticDecisionRelationship, PrecisionGroupRow>>;
  const blockContaining = records.filter((record) => record.decisionRelationship === "ALLOW_BLOCK" || record.decisionRelationship.startsWith("BLOCK_BLOCK"));
  const categoryKey = (record: ValidatedMhsSemanticReviewRecord): string => [record.candidateAPrimaryCategory ?? "ALLOW", record.candidateBPrimaryCategory ?? "ALLOW"].sort().join("__");
  const categoryKeys = [...new Set(blockContaining.map(categoryKey))].sort();
  const thresholdEvaluation = MHS_SEMANTIC_THRESHOLD_CANDIDATES.map((threshold): ThresholdEvaluationRow => {
    const retained = records.filter((record) => record.semanticScore >= threshold); const metrics = groupMetrics(retained);
    const allAllowBlock = records.filter((record) => record.decisionRelationship === "ALLOW_BLOCK").length; const retainedAllowBlock = retained.filter((record) => record.decisionRelationship === "ALLOW_BLOCK").length;
    return { threshold, retainedCount: retained.length, retainedPercentage: percentage(retained.length, records.length), reviewedNonAdjudicationCount: metrics.reviewedNonAdjudicationCount,
      duplicateLikeCount: metrics.duplicateLikeCount, duplicateLikePrecision: metrics.duplicateLikePrecision, duplicateLikeRecallWithinPacket: rate(metrics.duplicateLikeCount, duplicateLikeTotal),
      relatedOrDuplicateRate: metrics.relatedOrDuplicateRate, allowBlockConflictRetainedCount: retainedAllowBlock, allowBlockConflictCaptureRate: rate(retainedAllowBlock, allAllowBlock) };
  });
  const generatedAt = options.generatedAt ?? new Date().toISOString(); if (!strictInstant(generatedAt)) throw new Error("Semantic precision timestamp must be strict UTC ISO with milliseconds");
  const humanOutcomes = Object.fromEntries(MHS_SEMANTIC_RELATIONSHIP_OUTCOMES.map((outcome) => [outcome, { count: counts[outcome], rate: rate(counts[outcome], records.length), percentage: percentage(counts[outcome], records.length) }])) as Readonly<Record<MhsSemanticRelationshipOutcome, MhsSemanticOutcomeSummary>>;
  const payload: MhsSemanticPrecisionPayload = { schemaVersion: MHS_SEMANTIC_PRECISION_SCHEMA_VERSION, analysisStatus: "HUMAN_PRECISION_MEASURED_NO_DATASET_MUTATION",
    sourceValidatedReviewArtifactFilename: MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME, sourceValidatedReviewArtifactSha256: sourceSha,
    sourceValidatedReviewPayloadDigest: source.validatedReviewPayloadDigest, completedCsvSha256: MHS_SEMANTIC_COMPLETED_REVIEW_SHA256,
    sourceSemanticArtifactSha256: MHS_SEMANTIC_SOURCE_SHA256, packetMembershipDigest: MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST,
    reviewerId: MHS_SEMANTIC_REVIEWER_ID, totalReviewedRows: MHS_SEMANTIC_REVIEW_PACKET_SIZE, generatedAt, humanOutcomes,
    aggregate: { duplicateLike: { count: duplicateLikeTotal, rate: rate(duplicateLikeTotal, records.length), percentage: percentage(duplicateLikeTotal, records.length) },
      notDuplicateLike: { count: counts.RELATED_BUT_DISTINCT + counts.UNRELATED, rate: rate(counts.RELATED_BUT_DISTINCT + counts.UNRELATED, records.length), percentage: percentage(counts.RELATED_BUT_DISTINCT + counts.UNRELATED, records.length) },
      unresolved: { count: counts.NEEDS_ADJUDICATION, rate: rate(counts.NEEDS_ADJUDICATION, records.length), percentage: percentage(counts.NEEDS_ADJUDICATION, records.length) } },
    scoreBandPrecision: byScoreBand, decisionRelationshipPrecision: byDecision,
    categoryPairAnalysis: { blockContainingCount: blockContaining.length,
      samePrimaryCategory: groupMetrics(records.filter((record) => record.candidateAPrimaryCategory !== null && record.candidateBPrimaryCategory !== null && record.candidateAPrimaryCategory === record.candidateBPrimaryCategory)),
      differentPrimaryCategory: groupMetrics(records.filter((record) => record.candidateAPrimaryCategory !== null && record.candidateBPrimaryCategory !== null && record.candidateAPrimaryCategory !== record.candidateBPrimaryCategory)),
      allowBlock: groupMetrics(records.filter((record) => record.decisionRelationship === "ALLOW_BLOCK")),
      specificPrimaryCategoryPairs: Object.fromEntries(categoryKeys.map((key) => [key, groupMetrics(blockContaining.filter((record) => categoryKey(record) === key))])) },
    scoreStatisticsByHumanOutcome: Object.fromEntries(MHS_SEMANTIC_RELATIONSHIP_OUTCOMES.map((outcome) => [outcome, scoreStatistics(records.filter((record) => record.semanticRelationship === outcome))])) as Readonly<Record<MhsSemanticRelationshipOutcome, ScoreStatistics>>,
    thresholdEvaluation, duplicateLikePairKeys: records.filter(isDuplicateLike).map((record) => record.pairKey),
    falsePositivePairKeys: records.filter((record) => record.semanticRelationship === "RELATED_BUT_DISTINCT" || record.semanticRelationship === "UNRELATED").map((record) => record.pairKey),
    recommendedFutureReviewFloor: { value: 0.85, authority: "FUTURE_REVIEW_FLOOR_INVESTIGATION_ONLY", rationale: "Within this deterministic stratified packet, both duplicate-like judgments occur at or above 0.85; a future phase should validate 0.85 on independent review evidence before changing the frozen 0.80 floor." },
    highConfidenceRecommendation: { existingThreshold: 0.94, recommendation: "RETAIN_UNCHANGED_AND_ESTABLISH_NO_AUTOMATIC_DUPLICATE_THRESHOLD_YET", rationale: "No audited candidate pair reached 0.94 and only two reviewed pairs were duplicate-like, so this sample does not justify lowering an automatic threshold." },
    limitations: ["The 150-pair packet is a deterministic stratified validation sample, not a random sample.", "Precision estimates are conditional on packet construction.", "Recall estimates apply only within reviewed packet membership.", "No frozen benchmark was used.", "Semantic thresholds never override human labels.", "Semantic similarity alone cannot remove a candidate.", "Semantic similarity is evidence for review or grouping, not a moderation decision."],
    candidateMutationApplied: false, trainingEligibleCount: 0 };
  const artifact: MhsSemanticPrecisionArtifact = { ...payload, precisionPayloadDigest: payloadDigest(payload) }; validatePrecisionArtifact(artifact);
  const serialized = canonicalJson(artifact); const artifactPath = path.join(options.outputDirectory, MHS_SEMANTIC_PRECISION_FILENAME); writeImmutableFileAtomic(artifactPath, serialized, options.publishAtomic);
  return { artifactPath, artifactSha256: sha256(Buffer.from(serialized, "utf8")), artifact };
};

export const verifyMhsSemanticValidationBoundaries = (candidatePath: string, semanticPath: string): void => {
  const candidateBytes = fs.readFileSync(candidatePath); if (sha256(candidateBytes) !== MHS_CANDIDATE_ARTIFACT_SHA256) throw new Error("Candidate artifact changed during semantic validation");
  const candidate = JSON.parse(candidateBytes.toString("utf8")) as MhsCandidateAdmissionArtifact; validateMhsCandidateAdmissionArtifact(candidate);
  if (candidate.candidatePayloadDigest !== MHS_CANDIDATE_PAYLOAD_DIGEST || candidate.rows.filter((row) => row.candidateAdmitted).length !== 86
    || candidate.rows.filter((row) => row.candidateAdmitted && row.reviewerDecision === "ALLOW").length !== 58
    || candidate.rows.filter((row) => row.candidateAdmitted && row.reviewerDecision === "BLOCK").length !== 28 || candidate.rows.some((row) => row.trainingEligible)) throw new Error("Candidate boundary changed during semantic validation");
  const semanticBytes = fs.readFileSync(semanticPath); if (sha256(semanticBytes) !== MHS_SEMANTIC_SOURCE_SHA256) throw new Error("Semantic artifact changed during semantic validation");
  const semantic = JSON.parse(semanticBytes.toString("utf8")) as MhsSemanticAuditArtifact; validateMhsSemanticAuditArtifact(semantic);
  if (semantic.semanticAuditPayloadDigest !== MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST || semantic.trainingEligibleCount !== 0) throw new Error("Semantic boundary changed during semantic validation");
};
