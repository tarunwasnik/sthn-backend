import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import { MhsCandidateAdmissionArtifact, validateMhsCandidateAdmissionArtifact } from "./mhsCandidateAdmission";
import { MHS_CANDIDATE_ARTIFACT_SHA256, MHS_CANDIDATE_PAYLOAD_DIGEST } from "./mhsCandidateIntegrityAudit";
import { E5_SEMANTIC_HIGH_CONFIDENCE_THRESHOLD, E5_SEMANTIC_NEAR_DUPLICATE_THRESHOLD, MhsSemanticAuditArtifact, validateMhsSemanticAuditArtifact } from "./mhsSemanticIntegrityAudit";
import {
  ImportedMhsSemanticBoundaryReview, MHS_SEMANTIC_BOUNDARY_BLINDED_FILENAME, MHS_SEMANTIC_BOUNDARY_COLUMNS,
  MHS_SEMANTIC_BOUNDARY_MANIFEST_FILENAME, MHS_SEMANTIC_BOUNDARY_MEMBERSHIP_DIGEST, MHS_SEMANTIC_BOUNDARY_PACKET_SIZE,
  MHS_SEMANTIC_BOUNDARY_PACKET_VERSION, MHS_SEMANTIC_BOUNDARY_PAIR_TYPES, MHS_SEMANTIC_BOUNDARY_STRATA,
  MHS_SEMANTIC_H_MANIFEST_SHA256, MHS_SEMANTIC_I_PRECISION_PAYLOAD_DIGEST, MHS_SEMANTIC_I_PRECISION_SHA256,
  MHS_SEMANTIC_I_VALIDATED_PAYLOAD_DIGEST, MHS_SEMANTIC_I_VALIDATED_SHA256, MhsSemanticBoundaryManifest,
  MhsSemanticBoundaryPairType, MhsSemanticBoundaryStratum, createMhsSemanticBoundaryCsv,
  parseCompletedMhsSemanticBoundaryCsv, validateMhsSemanticBoundaryManifest,
} from "./mhsSemanticBoundaryReviewPacket";
import {
  MHS_SEMANTIC_RELATIONSHIP_OUTCOMES, MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST, MHS_SEMANTIC_SOURCE_SHA256,
  MhsSemanticRelationshipOutcome,
} from "./mhsSemanticReviewPacket";
import {
  MHS_SEMANTIC_COMPLETED_REVIEW_SHA256, MHS_SEMANTIC_PRECISION_FILENAME, MHS_SEMANTIC_REVIEWER_ID,
  MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME, MhsSemanticValidatedReviewArtifact, ValidatedMhsSemanticReviewRecord,
  validateMhsSemanticValidatedReviewArtifact,
} from "./mhsSemanticReviewValidation";
import { writeImmutableFileAtomic } from "./mhsReviewImport";

export const MHS_SEMANTIC_BOUNDARY_COMPLETED_FILENAME = "mhs-semantic-boundary-review-v1-completed-reviewer-a.csv" as const;
export const MHS_SEMANTIC_BOUNDARY_COMPLETED_SHA256 = "5f42fbbf3156431ecb09cfdf8f903481dd34f2dc43ec8295a62abe6f3cb845db" as const;
export const MHS_SEMANTIC_BOUNDARY_BLINDED_SHA256 = "28a3b9ef8377d9f1e10c5cf8ba795fd5e58ac594874dc96e12169395d98099d9" as const;
export const MHS_SEMANTIC_BOUNDARY_MANIFEST_SHA256 = "173fa2aa57a2a3c457677561b58f8223831274c1f77eed2aa21ecfd8435e295f" as const;
export const MHS_SEMANTIC_BOUNDARY_VALIDATED_SCHEMA_VERSION = "STHN_TEXT_MODERATION_MHS_SEMANTIC_BOUNDARY_VALIDATED_REVIEW_V1" as const;
export const MHS_SEMANTIC_BOUNDARY_VALIDATED_FILENAME = "mhs-semantic-boundary-review-v1-validated-reviewer-a.json" as const;
export const MHS_SEMANTIC_BOUNDARY_ANALYSIS_SCHEMA_VERSION = "STHN_TEXT_MODERATION_MHS_SEMANTIC_BOUNDARY_ANALYSIS_V1" as const;
export const MHS_SEMANTIC_BOUNDARY_ANALYSIS_FILENAME = "mhs-semantic-boundary-review-v1-analysis.json" as const;
export const MHS_SEMANTIC_COMBINED_THRESHOLDS = [0.8, 0.81, 0.82, 0.83, 0.84, 0.85] as const;
export const MHS_SEMANTIC_COMBINED_SCORE_REGIONS = ["SCORE_085_PLUS", "SCORE_084_TO_085", "SCORE_083_TO_084", "SCORE_082_TO_083", "SCORE_081_TO_082", "SCORE_080_TO_081"] as const;
export type MhsSemanticCombinedScoreRegion = typeof MHS_SEMANTIC_COMBINED_SCORE_REGIONS[number];

export interface ValidatedMhsSemanticBoundaryRecord {
  readonly pairRowNumber: number; readonly pairKey: string; readonly candidateAId: string; readonly candidateBId: string;
  readonly candidateADigest: string; readonly candidateBDigest: string; readonly semanticScore: number;
  readonly scoreStratum: MhsSemanticBoundaryStratum; readonly pairType: MhsSemanticBoundaryPairType;
  readonly semanticRelationship: MhsSemanticRelationshipOutcome; readonly reviewerNote: string | null; readonly reviewedAt: string;
}
export interface MhsSemanticBoundaryValidatedPayload {
  readonly schemaVersion: typeof MHS_SEMANTIC_BOUNDARY_VALIDATED_SCHEMA_VERSION; readonly validationStatus: "VALIDATED";
  readonly sourceCompletedCsvFilename: typeof MHS_SEMANTIC_BOUNDARY_COMPLETED_FILENAME; readonly completedCsvSha256: typeof MHS_SEMANTIC_BOUNDARY_COMPLETED_SHA256;
  readonly sourceBlindedPacketFilename: typeof MHS_SEMANTIC_BOUNDARY_BLINDED_FILENAME; readonly sourceBlindedPacketSha256: typeof MHS_SEMANTIC_BOUNDARY_BLINDED_SHA256;
  readonly sourceManifestFilename: typeof MHS_SEMANTIC_BOUNDARY_MANIFEST_FILENAME; readonly sourceManifestSha256: typeof MHS_SEMANTIC_BOUNDARY_MANIFEST_SHA256;
  readonly packetVersion: typeof MHS_SEMANTIC_BOUNDARY_PACKET_VERSION; readonly packetMembershipDigest: typeof MHS_SEMANTIC_BOUNDARY_MEMBERSHIP_DIGEST;
  readonly hValidatedReviewArtifactSha256: typeof MHS_SEMANTIC_I_VALIDATED_SHA256; readonly hMembershipDigest: typeof MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST;
  readonly hJOverlapCount: 0; readonly sourceSemanticArtifactSha256: typeof MHS_SEMANTIC_SOURCE_SHA256; readonly reviewerId: typeof MHS_SEMANTIC_REVIEWER_ID;
  readonly reviewedAt: { readonly minimum: string; readonly maximum: string; readonly distinctCount: number }; readonly rowCount: typeof MHS_SEMANTIC_BOUNDARY_PACKET_SIZE;
  readonly importedAt: string; readonly records: readonly ValidatedMhsSemanticBoundaryRecord[]; readonly humanOutcomeCounts: Readonly<Record<MhsSemanticRelationshipOutcome, number>>;
  readonly candidateMutationApplied: false; readonly thresholdMutationApplied: false; readonly trainingEligibleCount: 0;
}
export interface MhsSemanticBoundaryValidatedArtifact extends MhsSemanticBoundaryValidatedPayload { readonly validatedBoundaryPayloadDigest: string; }

export interface BoundaryGroupAnalysis { readonly pairCount: number; readonly reviewedNonAdjudicationCount: number; readonly outcomeCounts: Readonly<Record<MhsSemanticRelationshipOutcome, number>>;
  readonly duplicateLikeCount: number; readonly duplicateLikePrecision: number; readonly relatedOrDuplicateRate: number; readonly relatedButDistinctRate: number; readonly unrelatedRate: number; }
export interface BoundaryScoreStatistics { readonly count: number; readonly minimum: number | null; readonly maximum: number | null; readonly mean: number | null; readonly median: number | null; readonly p25: number | null; readonly p75: number | null; }
export interface CombinedThresholdEvidence { readonly threshold: number; readonly retainedCount: number; readonly packetCoverage: number; readonly reviewedNonAdjudicationCount: number;
  readonly duplicateLikeCount: number; readonly duplicateLikePrecision: number; readonly duplicateLikeRecallWithinReviewedMembership: number; readonly relatedOrDuplicateRate: number;
  readonly allowBlockConflictRetainedCount: number; readonly allowBlockConflictCaptureRate: number; }
type CombinedRecord = { readonly provenance: "H" | "J"; readonly pairKey: string; readonly semanticScore: number; readonly semanticRelationship: MhsSemanticRelationshipOutcome; readonly allowBlockConflict: boolean };
export interface MhsSemanticBoundaryAnalysisPayload {
  readonly schemaVersion: typeof MHS_SEMANTIC_BOUNDARY_ANALYSIS_SCHEMA_VERSION; readonly analysisStatus: "BOUNDARY_YIELD_MEASURED_NO_MUTATION";
  readonly sourceValidatedBoundaryArtifactFilename: typeof MHS_SEMANTIC_BOUNDARY_VALIDATED_FILENAME; readonly sourceValidatedBoundaryArtifactSha256: string;
  readonly sourceValidatedBoundaryPayloadDigest: string; readonly completedCsvSha256: typeof MHS_SEMANTIC_BOUNDARY_COMPLETED_SHA256;
  readonly jMembershipDigest: typeof MHS_SEMANTIC_BOUNDARY_MEMBERSHIP_DIGEST; readonly hValidatedArtifactSha256: typeof MHS_SEMANTIC_I_VALIDATED_SHA256;
  readonly hPrecisionArtifactSha256: typeof MHS_SEMANTIC_I_PRECISION_SHA256; readonly sourceSemanticArtifactSha256: typeof MHS_SEMANTIC_SOURCE_SHA256;
  readonly reviewerId: typeof MHS_SEMANTIC_REVIEWER_ID; readonly jRowCount: 75; readonly combinedRowCount: 225; readonly hJOverlapCount: 0; readonly generatedAt: string;
  readonly jHumanOutcomeCounts: Readonly<Record<MhsSemanticRelationshipOutcome, number>>; readonly jOutcomePercentages: Readonly<Record<MhsSemanticRelationshipOutcome, number>>;
  readonly jAggregate: { readonly duplicateLikeCount: number; readonly duplicateLikeRate: number; readonly relatedOrDuplicateCount: number; readonly relatedOrDuplicateRate: number;
    readonly notDuplicateLikeCount: number; readonly unresolvedCount: number };
  readonly jStratumYield: Readonly<Record<MhsSemanticBoundaryStratum, BoundaryGroupAnalysis>>; readonly jPairTypeAnalysis: Readonly<Record<MhsSemanticBoundaryPairType, BoundaryGroupAnalysis>>;
  readonly jScoreStatisticsByOutcome: Readonly<Record<MhsSemanticRelationshipOutcome, BoundaryScoreStatistics>>;
  readonly combinedHumanOutcomeCounts: Readonly<Record<MhsSemanticRelationshipOutcome, number>>; readonly combinedScoreRegions: Readonly<Record<MhsSemanticCombinedScoreRegion, BoundaryGroupAnalysis>>;
  readonly thresholdEvidence: readonly CombinedThresholdEvidence[];
  readonly futureReviewFloorRecommendation: { readonly outcome: "0.85_SUPPORTED_FOR_FUTURE_REVIEW_FLOOR_CHANGE"; readonly proposedFloor: 0.85; readonly authority: "DESCRIPTIVE_RECOMMENDATION_ONLY"; readonly rationale: string };
  readonly highConfidenceRecommendation: { readonly threshold: 0.94; readonly recommendation: "RETAIN_UNCHANGED_NO_AUTOMATIC_MERGE_AUTHORIZED"; readonly rationale: string };
  readonly limitations: readonly string[]; readonly candidateMutationApplied: false; readonly thresholdMutationApplied: false; readonly trainingEligibleCount: 0;
}
export interface MhsSemanticBoundaryAnalysisArtifact extends MhsSemanticBoundaryAnalysisPayload { readonly boundaryAnalysisPayloadDigest: string; }

type AtomicPublisher = (temporaryPath: string, targetPath: string) => void;
export interface CreateBoundaryValidatedOptions { readonly completedCsvPath: string; readonly manifestPath: string; readonly blindedPacketPath: string; readonly outputDirectory: string; readonly importedAt?: string; readonly publishAtomic?: AtomicPublisher; }
export interface CreateBoundaryAnalysisOptions { readonly validatedBoundaryArtifactPath: string; readonly hValidatedArtifactPath: string; readonly hPrecisionArtifactPath: string; readonly outputDirectory: string; readonly generatedAt?: string; readonly publishAtomic?: AtomicPublisher; }

const strictInstant = (value: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const payloadDigest = (payload: unknown): string => sha256(Buffer.from(canonicalJson(payload), "utf8"));
const rate = (numerator: number, denominator: number): number => denominator === 0 ? 0 : Number((numerator / denominator).toFixed(6));
const percentage = (numerator: number, denominator: number): number => Number((rate(numerator, denominator) * 100).toFixed(4));
const counts = <T extends { readonly semanticRelationship: MhsSemanticRelationshipOutcome }>(records: readonly T[]): Readonly<Record<MhsSemanticRelationshipOutcome, number>> => Object.fromEntries(
  MHS_SEMANTIC_RELATIONSHIP_OUTCOMES.map((outcome) => [outcome, records.filter((record) => record.semanticRelationship === outcome).length]),
) as Readonly<Record<MhsSemanticRelationshipOutcome, number>>;
const group = <T extends { readonly semanticRelationship: MhsSemanticRelationshipOutcome }>(records: readonly T[]): BoundaryGroupAnalysis => { const outcomeCounts = counts(records); const nonAdjudication = records.length - outcomeCounts.NEEDS_ADJUDICATION; const duplicateLike = outcomeCounts.DUPLICATE + outcomeCounts.NEAR_DUPLICATE;
  return { pairCount: records.length, reviewedNonAdjudicationCount: nonAdjudication, outcomeCounts, duplicateLikeCount: duplicateLike, duplicateLikePrecision: rate(duplicateLike, nonAdjudication),
    relatedOrDuplicateRate: rate(duplicateLike + outcomeCounts.RELATED_BUT_DISTINCT, nonAdjudication), relatedButDistinctRate: rate(outcomeCounts.RELATED_BUT_DISTINCT, nonAdjudication), unrelatedRate: rate(outcomeCounts.UNRELATED, nonAdjudication) }; };
const percentile = (values: readonly number[], fraction: number): number | null => { if (!values.length) return null; const position = (values.length - 1) * fraction; const low = Math.floor(position); const high = Math.ceil(position); return Number((values[low] + (values[high] - values[low]) * (position - low)).toFixed(6)); };
const scoreStats = (records: readonly ValidatedMhsSemanticBoundaryRecord[]): BoundaryScoreStatistics => { const values = records.map((record) => record.semanticScore).sort((a, b) => a - b); if (!values.length) return { count: 0, minimum: null, maximum: null, mean: null, median: null, p25: null, p75: null };
  return { count: values.length, minimum: values[0], maximum: values[values.length - 1], mean: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6)), median: percentile(values, 0.5), p25: percentile(values, 0.25), p75: percentile(values, 0.75) }; };
const combinedRegion = (score: number): MhsSemanticCombinedScoreRegion => score >= 0.85 ? "SCORE_085_PLUS" : score >= 0.84 ? "SCORE_084_TO_085" : score >= 0.83 ? "SCORE_083_TO_084" : score >= 0.82 ? "SCORE_082_TO_083" : score >= 0.81 ? "SCORE_081_TO_082" : "SCORE_080_TO_081";

export const validateMhsSemanticBoundaryValidatedArtifact = (artifact: MhsSemanticBoundaryValidatedArtifact): void => { const { validatedBoundaryPayloadDigest, ...payload } = artifact;
  if (payload.schemaVersion !== MHS_SEMANTIC_BOUNDARY_VALIDATED_SCHEMA_VERSION || payload.validationStatus !== "VALIDATED" || payload.sourceCompletedCsvFilename !== MHS_SEMANTIC_BOUNDARY_COMPLETED_FILENAME
    || payload.completedCsvSha256 !== MHS_SEMANTIC_BOUNDARY_COMPLETED_SHA256 || payload.sourceBlindedPacketFilename !== MHS_SEMANTIC_BOUNDARY_BLINDED_FILENAME || payload.sourceBlindedPacketSha256 !== MHS_SEMANTIC_BOUNDARY_BLINDED_SHA256
    || payload.sourceManifestFilename !== MHS_SEMANTIC_BOUNDARY_MANIFEST_FILENAME || payload.sourceManifestSha256 !== MHS_SEMANTIC_BOUNDARY_MANIFEST_SHA256 || payload.packetVersion !== MHS_SEMANTIC_BOUNDARY_PACKET_VERSION
    || payload.packetMembershipDigest !== MHS_SEMANTIC_BOUNDARY_MEMBERSHIP_DIGEST || payload.hValidatedReviewArtifactSha256 !== MHS_SEMANTIC_I_VALIDATED_SHA256 || payload.hMembershipDigest !== MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST
    || payload.hJOverlapCount !== 0 || payload.sourceSemanticArtifactSha256 !== MHS_SEMANTIC_SOURCE_SHA256 || payload.reviewerId !== MHS_SEMANTIC_REVIEWER_ID || payload.rowCount !== 75 || payload.records.length !== 75
    || !strictInstant(payload.importedAt) || !strictInstant(payload.reviewedAt.minimum) || !strictInstant(payload.reviewedAt.maximum) || payload.reviewedAt.distinctCount < 1 || payload.candidateMutationApplied || payload.thresholdMutationApplied || payload.trainingEligibleCount !== 0) throw new Error("Invalid semantic boundary validated artifact identity");
  const seen = new Set<string>(); payload.records.forEach((record, index) => { if (record.pairRowNumber !== index + 1 || record.pairKey !== [record.candidateAId, record.candidateBId].sort().join("::") || seen.has(record.pairKey)
    || !/^[a-f0-9]{64}$/.test(record.candidateADigest) || !/^[a-f0-9]{64}$/.test(record.candidateBDigest) || !MHS_SEMANTIC_BOUNDARY_STRATA.includes(record.scoreStratum) || !MHS_SEMANTIC_BOUNDARY_PAIR_TYPES.includes(record.pairType)
    || !MHS_SEMANTIC_RELATIONSHIP_OUTCOMES.includes(record.semanticRelationship) || !strictInstant(record.reviewedAt) || (record.reviewerNote?.length ?? 0) > 500) throw new Error(`Invalid semantic boundary validated record at row ${index + 1}`); seen.add(record.pairKey); });
  if (canonicalJson(payload.humanOutcomeCounts) !== canonicalJson(counts(payload.records)) || validatedBoundaryPayloadDigest !== payloadDigest(payload)) throw new Error("Semantic boundary validated summary or digest mismatch");
};

export const createMhsSemanticBoundaryValidatedReview = (options: CreateBoundaryValidatedOptions): { readonly artifactPath: string; readonly artifactSha256: string; readonly artifact: MhsSemanticBoundaryValidatedArtifact } => {
  const completedBytes = fs.readFileSync(options.completedCsvPath); if (sha256(completedBytes) !== MHS_SEMANTIC_BOUNDARY_COMPLETED_SHA256) throw new Error("Completed semantic boundary CSV SHA-256 mismatch");
  const manifestBytes = fs.readFileSync(options.manifestPath); if (sha256(manifestBytes) !== MHS_SEMANTIC_BOUNDARY_MANIFEST_SHA256) throw new Error("Semantic boundary manifest SHA-256 mismatch");
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as MhsSemanticBoundaryManifest; validateMhsSemanticBoundaryManifest(manifest);
  if (!fs.existsSync(options.blindedPacketPath)) throw new Error("Semantic boundary blinded packet is missing");
  // The reviewer working copy may contain filled input cells. Reconstruct the frozen
  // blank packet from the immutable manifest so K neither trusts nor rewrites it.
  if (sha256(Buffer.from(createMhsSemanticBoundaryCsv(manifest.rows), "utf8")) !== MHS_SEMANTIC_BOUNDARY_BLINDED_SHA256) throw new Error("Canonical semantic boundary blinded packet SHA-256 mismatch");
  const reviews = parseCompletedMhsSemanticBoundaryCsv(completedBytes.toString("utf8"), manifest, MHS_SEMANTIC_REVIEWER_ID); const records = reviews.map((review: ImportedMhsSemanticBoundaryReview, index): ValidatedMhsSemanticBoundaryRecord => { const pair = manifest.rows[index];
    if (review.pairKey !== pair.pairKey || review.pairRowNumber !== pair.pairRowNumber) throw new Error(`Boundary review membership mismatch at row ${index + 1}`); return { pairRowNumber: pair.pairRowNumber, pairKey: pair.pairKey,
      candidateAId: pair.candidateAId, candidateBId: pair.candidateBId, candidateADigest: pair.candidateADigest, candidateBDigest: pair.candidateBDigest,
      semanticScore: pair.semanticScore, scoreStratum: pair.scoreStratum, pairType: pair.pairType, semanticRelationship: review.relationship, reviewerNote: review.reviewerNote, reviewedAt: review.reviewedAt }; });
  const reviewedAt = [...new Set(records.map((record) => record.reviewedAt))].sort(); const importedAt = options.importedAt ?? new Date().toISOString(); if (!strictInstant(importedAt)) throw new Error("Boundary import timestamp must use strict UTC milliseconds");
  const payload: MhsSemanticBoundaryValidatedPayload = { schemaVersion: MHS_SEMANTIC_BOUNDARY_VALIDATED_SCHEMA_VERSION, validationStatus: "VALIDATED", sourceCompletedCsvFilename: MHS_SEMANTIC_BOUNDARY_COMPLETED_FILENAME,
    completedCsvSha256: MHS_SEMANTIC_BOUNDARY_COMPLETED_SHA256, sourceBlindedPacketFilename: MHS_SEMANTIC_BOUNDARY_BLINDED_FILENAME, sourceBlindedPacketSha256: MHS_SEMANTIC_BOUNDARY_BLINDED_SHA256,
    sourceManifestFilename: MHS_SEMANTIC_BOUNDARY_MANIFEST_FILENAME, sourceManifestSha256: MHS_SEMANTIC_BOUNDARY_MANIFEST_SHA256, packetVersion: MHS_SEMANTIC_BOUNDARY_PACKET_VERSION,
    packetMembershipDigest: MHS_SEMANTIC_BOUNDARY_MEMBERSHIP_DIGEST, hValidatedReviewArtifactSha256: MHS_SEMANTIC_I_VALIDATED_SHA256, hMembershipDigest: MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST,
    hJOverlapCount: 0, sourceSemanticArtifactSha256: MHS_SEMANTIC_SOURCE_SHA256, reviewerId: MHS_SEMANTIC_REVIEWER_ID, reviewedAt: { minimum: reviewedAt[0], maximum: reviewedAt[reviewedAt.length - 1], distinctCount: reviewedAt.length },
    rowCount: 75, importedAt, records, humanOutcomeCounts: counts(records), candidateMutationApplied: false, thresholdMutationApplied: false, trainingEligibleCount: 0 };
  const artifact: MhsSemanticBoundaryValidatedArtifact = { ...payload, validatedBoundaryPayloadDigest: payloadDigest(payload) }; validateMhsSemanticBoundaryValidatedArtifact(artifact); const serialized = canonicalJson(artifact);
  const artifactPath = path.join(options.outputDirectory, MHS_SEMANTIC_BOUNDARY_VALIDATED_FILENAME); writeImmutableFileAtomic(artifactPath, serialized, options.publishAtomic); return { artifactPath, artifactSha256: sha256(Buffer.from(serialized)), artifact };
};

export const validateMhsSemanticBoundaryAnalysisArtifact = (artifact: MhsSemanticBoundaryAnalysisArtifact): void => { const { boundaryAnalysisPayloadDigest, ...payload } = artifact;
  if (payload.schemaVersion !== MHS_SEMANTIC_BOUNDARY_ANALYSIS_SCHEMA_VERSION || payload.analysisStatus !== "BOUNDARY_YIELD_MEASURED_NO_MUTATION" || payload.sourceValidatedBoundaryArtifactFilename !== MHS_SEMANTIC_BOUNDARY_VALIDATED_FILENAME
    || !/^[a-f0-9]{64}$/.test(payload.sourceValidatedBoundaryArtifactSha256) || !/^[a-f0-9]{64}$/.test(payload.sourceValidatedBoundaryPayloadDigest) || payload.completedCsvSha256 !== MHS_SEMANTIC_BOUNDARY_COMPLETED_SHA256
    || payload.jMembershipDigest !== MHS_SEMANTIC_BOUNDARY_MEMBERSHIP_DIGEST || payload.hValidatedArtifactSha256 !== MHS_SEMANTIC_I_VALIDATED_SHA256 || payload.hPrecisionArtifactSha256 !== MHS_SEMANTIC_I_PRECISION_SHA256
    || payload.sourceSemanticArtifactSha256 !== MHS_SEMANTIC_SOURCE_SHA256 || payload.reviewerId !== "a" || payload.jRowCount !== 75 || payload.combinedRowCount !== 225 || payload.hJOverlapCount !== 0
    || !strictInstant(payload.generatedAt) || payload.thresholdEvidence.length !== 6 || payload.futureReviewFloorRecommendation.proposedFloor !== 0.85 || payload.highConfidenceRecommendation.threshold !== 0.94
    || payload.candidateMutationApplied || payload.thresholdMutationApplied || payload.trainingEligibleCount !== 0 || boundaryAnalysisPayloadDigest !== payloadDigest(payload)) throw new Error("Invalid semantic boundary analysis artifact identity or digest");
};

export const createMhsSemanticBoundaryAnalysis = (options: CreateBoundaryAnalysisOptions): { readonly artifactPath: string; readonly artifactSha256: string; readonly artifact: MhsSemanticBoundaryAnalysisArtifact } => {
  const jBytes = fs.readFileSync(options.validatedBoundaryArtifactPath); const jSha = sha256(jBytes); const j = JSON.parse(jBytes.toString("utf8")) as MhsSemanticBoundaryValidatedArtifact; validateMhsSemanticBoundaryValidatedArtifact(j);
  const hBytes = fs.readFileSync(options.hValidatedArtifactPath); if (sha256(hBytes) !== MHS_SEMANTIC_I_VALIDATED_SHA256) throw new Error("H validated artifact SHA-256 mismatch"); const h = JSON.parse(hBytes.toString("utf8")) as MhsSemanticValidatedReviewArtifact; validateMhsSemanticValidatedReviewArtifact(h);
  const precisionBytes = fs.readFileSync(options.hPrecisionArtifactPath); if (sha256(precisionBytes) !== MHS_SEMANTIC_I_PRECISION_SHA256) throw new Error("H precision artifact SHA-256 mismatch"); const precision = JSON.parse(precisionBytes.toString("utf8")) as { readonly precisionPayloadDigest?: string };
  if (precision.precisionPayloadDigest !== MHS_SEMANTIC_I_PRECISION_PAYLOAD_DIGEST || h.validatedReviewPayloadDigest !== MHS_SEMANTIC_I_VALIDATED_PAYLOAD_DIGEST) throw new Error("H analysis payload authority mismatch");
  const hKeys = new Set(h.records.map((record) => record.pairKey)); if (j.records.some((record) => hKeys.has(record.pairKey))) throw new Error("H/J semantic review overlap is non-zero");
  const combined: CombinedRecord[] = [...h.records.map((record: ValidatedMhsSemanticReviewRecord) => ({ provenance: "H" as const, pairKey: record.pairKey, semanticScore: record.semanticScore,
    semanticRelationship: record.semanticRelationship, allowBlockConflict: record.decisionRelationship === "ALLOW_BLOCK" })), ...j.records.map((record) => ({ provenance: "J" as const, pairKey: record.pairKey,
    semanticScore: record.semanticScore, semanticRelationship: record.semanticRelationship, allowBlockConflict: record.pairType === "ALLOW_BLOCK" }))];
  const jCounts = counts(j.records); const combinedCounts = counts(combined); const combinedDuplicateLike = combinedCounts.DUPLICATE + combinedCounts.NEAR_DUPLICATE; const allAllowBlock = combined.filter((record) => record.allowBlockConflict).length;
  const thresholdEvidence = MHS_SEMANTIC_COMBINED_THRESHOLDS.map((threshold): CombinedThresholdEvidence => { const retained = combined.filter((record) => record.semanticScore >= threshold); const metrics = group(retained); const allowBlock = retained.filter((record) => record.allowBlockConflict).length;
    return { threshold, retainedCount: retained.length, packetCoverage: rate(retained.length, combined.length), reviewedNonAdjudicationCount: metrics.reviewedNonAdjudicationCount, duplicateLikeCount: metrics.duplicateLikeCount,
      duplicateLikePrecision: metrics.duplicateLikePrecision, duplicateLikeRecallWithinReviewedMembership: rate(metrics.duplicateLikeCount, combinedDuplicateLike), relatedOrDuplicateRate: metrics.relatedOrDuplicateRate,
      allowBlockConflictRetainedCount: allowBlock, allowBlockConflictCaptureRate: rate(allowBlock, allAllowBlock) }; });
  const generatedAt = options.generatedAt ?? new Date().toISOString(); if (!strictInstant(generatedAt)) throw new Error("Boundary analysis timestamp must use strict UTC milliseconds");
  const duplicateLikeJ = jCounts.DUPLICATE + jCounts.NEAR_DUPLICATE; const relatedJ = duplicateLikeJ + jCounts.RELATED_BUT_DISTINCT;
  const payload: MhsSemanticBoundaryAnalysisPayload = { schemaVersion: MHS_SEMANTIC_BOUNDARY_ANALYSIS_SCHEMA_VERSION, analysisStatus: "BOUNDARY_YIELD_MEASURED_NO_MUTATION",
    sourceValidatedBoundaryArtifactFilename: MHS_SEMANTIC_BOUNDARY_VALIDATED_FILENAME, sourceValidatedBoundaryArtifactSha256: jSha, sourceValidatedBoundaryPayloadDigest: j.validatedBoundaryPayloadDigest,
    completedCsvSha256: MHS_SEMANTIC_BOUNDARY_COMPLETED_SHA256, jMembershipDigest: MHS_SEMANTIC_BOUNDARY_MEMBERSHIP_DIGEST, hValidatedArtifactSha256: MHS_SEMANTIC_I_VALIDATED_SHA256,
    hPrecisionArtifactSha256: MHS_SEMANTIC_I_PRECISION_SHA256, sourceSemanticArtifactSha256: MHS_SEMANTIC_SOURCE_SHA256, reviewerId: "a", jRowCount: 75, combinedRowCount: 225, hJOverlapCount: 0, generatedAt,
    jHumanOutcomeCounts: jCounts, jOutcomePercentages: Object.fromEntries(MHS_SEMANTIC_RELATIONSHIP_OUTCOMES.map((outcome) => [outcome, percentage(jCounts[outcome], 75)])) as Readonly<Record<MhsSemanticRelationshipOutcome, number>>,
    jAggregate: { duplicateLikeCount: duplicateLikeJ, duplicateLikeRate: rate(duplicateLikeJ, 75), relatedOrDuplicateCount: relatedJ, relatedOrDuplicateRate: rate(relatedJ, 75), notDuplicateLikeCount: jCounts.RELATED_BUT_DISTINCT + jCounts.UNRELATED, unresolvedCount: jCounts.NEEDS_ADJUDICATION },
    jStratumYield: Object.fromEntries(MHS_SEMANTIC_BOUNDARY_STRATA.map((stratum) => [stratum, group(j.records.filter((record) => record.scoreStratum === stratum))])) as Readonly<Record<MhsSemanticBoundaryStratum, BoundaryGroupAnalysis>>,
    jPairTypeAnalysis: Object.fromEntries(MHS_SEMANTIC_BOUNDARY_PAIR_TYPES.map((pairType) => [pairType, group(j.records.filter((record) => record.pairType === pairType))])) as Readonly<Record<MhsSemanticBoundaryPairType, BoundaryGroupAnalysis>>,
    jScoreStatisticsByOutcome: Object.fromEntries(MHS_SEMANTIC_RELATIONSHIP_OUTCOMES.map((outcome) => [outcome, scoreStats(j.records.filter((record) => record.semanticRelationship === outcome))])) as Readonly<Record<MhsSemanticRelationshipOutcome, BoundaryScoreStatistics>>,
    combinedHumanOutcomeCounts: combinedCounts, combinedScoreRegions: Object.fromEntries(MHS_SEMANTIC_COMBINED_SCORE_REGIONS.map((region) => [region, group(combined.filter((record) => combinedRegion(record.semanticScore) === region))])) as Readonly<Record<MhsSemanticCombinedScoreRegion, BoundaryGroupAnalysis>>,
    thresholdEvidence, futureReviewFloorRecommendation: { outcome: "0.85_SUPPORTED_FOR_FUTURE_REVIEW_FLOOR_CHANGE", proposedFloor: 0.85, authority: "DESCRIPTIVE_RECOMMENDATION_ONLY",
      rationale: "The independent J holdout found zero duplicate-like relationships in 75 reviewed pairs from 0.82 to below 0.85, while both duplicate-like outcomes across the disjoint 225-pair H+J evidence occur at or above 0.85." },
    highConfidenceRecommendation: { threshold: 0.94, recommendation: "RETAIN_UNCHANGED_NO_AUTOMATIC_MERGE_AUTHORIZED", rationale: "No audited candidate pair reached 0.94, and reviewed-sample evidence does not authorize an automatic merge threshold." },
    limitations: ["H and J are deterministic stratified review samples; neither is random.", "J was intentionally boundary-focused.", "Precision is conditional on packet construction.", "Recall applies only within reviewed H+J membership, not all 3,655 candidate pairs.", "No frozen benchmark was used.", "Semantic similarity cannot override human labels.", "Semantic similarity is evidence for review or grouping only.", "No automatic candidate mutation follows from score."],
    candidateMutationApplied: false, thresholdMutationApplied: false, trainingEligibleCount: 0 };
  const artifact: MhsSemanticBoundaryAnalysisArtifact = { ...payload, boundaryAnalysisPayloadDigest: payloadDigest(payload) }; validateMhsSemanticBoundaryAnalysisArtifact(artifact); const serialized = canonicalJson(artifact);
  const artifactPath = path.join(options.outputDirectory, MHS_SEMANTIC_BOUNDARY_ANALYSIS_FILENAME); writeImmutableFileAtomic(artifactPath, serialized, options.publishAtomic); return { artifactPath, artifactSha256: sha256(Buffer.from(serialized)), artifact };
};

export const verifyMhsSemanticBoundaryValidationAuthorities = (candidatePath: string, semanticPath: string): void => { const candidateBytes = fs.readFileSync(candidatePath); if (sha256(candidateBytes) !== MHS_CANDIDATE_ARTIFACT_SHA256) throw new Error("Candidate artifact changed"); const candidate = JSON.parse(candidateBytes.toString("utf8")) as MhsCandidateAdmissionArtifact; validateMhsCandidateAdmissionArtifact(candidate);
  if (candidate.candidatePayloadDigest !== MHS_CANDIDATE_PAYLOAD_DIGEST || candidate.rows.filter((row) => row.candidateAdmitted).length !== 86 || candidate.rows.filter((row) => row.candidateAdmitted && row.reviewerDecision === "ALLOW").length !== 58
    || candidate.rows.filter((row) => row.candidateAdmitted && row.reviewerDecision === "BLOCK").length !== 28 || candidate.rows.some((row) => row.trainingEligible)) throw new Error("Candidate authority changed"); const semanticBytes = fs.readFileSync(semanticPath);
  if (sha256(semanticBytes) !== MHS_SEMANTIC_SOURCE_SHA256) throw new Error("Semantic artifact changed"); const semantic = JSON.parse(semanticBytes.toString("utf8")) as MhsSemanticAuditArtifact; validateMhsSemanticAuditArtifact(semantic);
  if (semantic.trainingEligibleCount !== 0 || E5_SEMANTIC_NEAR_DUPLICATE_THRESHOLD !== 0.8 || E5_SEMANTIC_HIGH_CONFIDENCE_THRESHOLD !== 0.94) throw new Error("Semantic thresholds or eligibility changed"); };
