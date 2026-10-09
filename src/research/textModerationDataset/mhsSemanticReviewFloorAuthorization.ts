import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import { MhsCandidateAdmissionArtifact, validateMhsCandidateAdmissionArtifact } from "./mhsCandidateAdmission";
import { MHS_CANDIDATE_ARTIFACT_SHA256, MHS_CANDIDATE_PAYLOAD_DIGEST } from "./mhsCandidateIntegrityAudit";
import { MhsSemanticAuditArtifact, MhsSemanticFinding, validateMhsSemanticAuditArtifact } from "./mhsSemanticIntegrityAudit";
import {
  MHS_SEMANTIC_BOUNDARY_ANALYSIS_FILENAME, MHS_SEMANTIC_BOUNDARY_ANALYSIS_SCHEMA_VERSION,
  MHS_SEMANTIC_BOUNDARY_COMPLETED_FILENAME, MHS_SEMANTIC_BOUNDARY_COMPLETED_SHA256,
  MHS_SEMANTIC_BOUNDARY_MANIFEST_SHA256, MHS_SEMANTIC_BOUNDARY_VALIDATED_FILENAME,
  MhsSemanticBoundaryAnalysisArtifact, MhsSemanticBoundaryValidatedArtifact,
  validateMhsSemanticBoundaryAnalysisArtifact, validateMhsSemanticBoundaryValidatedArtifact,
} from "./mhsSemanticBoundaryReviewValidation";
import {
  MHS_SEMANTIC_H_MANIFEST_SHA256, MHS_SEMANTIC_I_PRECISION_PAYLOAD_DIGEST, MHS_SEMANTIC_I_PRECISION_SHA256,
  MHS_SEMANTIC_I_VALIDATED_PAYLOAD_DIGEST, MHS_SEMANTIC_I_VALIDATED_SHA256,
} from "./mhsSemanticBoundaryReviewPacket";
import { MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST, MHS_SEMANTIC_SOURCE_SHA256, MhsSemanticRelationshipOutcome } from "./mhsSemanticReviewPacket";
import {
  MHS_SEMANTIC_PRECISION_FILENAME, MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME, MhsSemanticValidatedReviewArtifact,
  validateMhsSemanticValidatedReviewArtifact,
} from "./mhsSemanticReviewValidation";
import { writeImmutableFileAtomic } from "./mhsReviewImport";
import {
  STHN_SEMANTIC_HIGH_CONFIDENCE_SIGNAL, STHN_SEMANTIC_INVESTIGATION_BOUNDARY,
  STHN_SEMANTIC_PREVIOUS_REVIEW_FLOOR, STHN_SEMANTIC_REVIEW_FLOOR, STHN_SEMANTIC_REVIEW_POLICY_VERSION,
  isRoutineSemanticDuplicateReviewSignal,
} from "./semanticReviewPolicy";

export const MHS_REVIEW_FLOOR_AUTHORIZATION_SCHEMA = "STHN_MHS_SEMANTIC_REVIEW_FLOOR_AUTHORIZATION_V1" as const;
export const MHS_REVIEW_FLOOR_AUTHORIZATION_FILENAME = "mhs-semantic-review-floor-0.85-authorization-v1.json" as const;
export const MHS_REVIEW_FLOOR_SEMANTIC_AUDIT_SCHEMA = "STHN_TEXT_MODERATION_MHS_SEMANTIC_INTEGRITY_AUDIT_REVIEW_FLOOR_V2" as const;
export const MHS_REVIEW_FLOOR_SEMANTIC_AUDIT_FILENAME = "mhs-review-pilot-v1-candidate-v1-semantic-audit-review-floor-0.85-v1.json" as const;
export const MHS_K_VALIDATED_SHA256 = "2e1723f074d122084d8013d31361ff256c1dcbe3b18c4ebe9ec4b267dbaf5c3d" as const;
export const MHS_K_VALIDATED_PAYLOAD_DIGEST = "fccbee8de6a71092e3e41943c5a92ad4b4bb19d895b71ac0d084c8cc422e0b1b" as const;
export const MHS_K_ANALYSIS_SHA256 = "664b41936711b3dadac327d91446d2b0b387e77bb89d26966d088e8574958bf0" as const;
export const MHS_K_ANALYSIS_PAYLOAD_DIGEST = "f48e682182434f39255bd179054828e88989ef7b7dc42684050d2d04aad10dd9" as const;

type PairType = "ALLOW_ALLOW" | "ALLOW_BLOCK" | "BLOCK_BLOCK_SAME_PRIMARY_CATEGORY" | "BLOCK_BLOCK_DIFFERENT_PRIMARY_CATEGORY";
const pairTypes: readonly PairType[] = ["ALLOW_ALLOW", "ALLOW_BLOCK", "BLOCK_BLOCK_SAME_PRIMARY_CATEGORY", "BLOCK_BLOCK_DIFFERENT_PRIMARY_CATEGORY"];
const outcomes: readonly MhsSemanticRelationshipOutcome[] = ["DUPLICATE", "NEAR_DUPLICATE", "RELATED_BUT_DISTINCT", "UNRELATED", "NEEDS_ADJUDICATION"];
type HumanRecord = { readonly provenance: "H" | "J"; readonly pairKey: string; readonly semanticScore: number; readonly semanticRelationship: MhsSemanticRelationshipOutcome; readonly allowBlockConflict: boolean };

export interface ReviewFloorImpactSummary {
  readonly reviewFloor: number; readonly totalPossiblePairs: 3655; readonly scoredPairCount: 3655;
  readonly routineReviewPairCount: number; readonly belowReviewFloorPairCount: number;
  readonly pairTypeCounts: Readonly<Record<PairType, number>>;
  readonly scoreRegionCounts: { readonly gte094: number; readonly gte085: number; readonly score084To085: number; readonly score083To084: number;
    readonly score082To083: number; readonly score081To082: number; readonly score080To081: number };
}
export interface HumanReplaySummary {
  readonly reviewedCount: number; readonly hCount: number; readonly jCount: number;
  readonly outcomeCounts: Readonly<Record<MhsSemanticRelationshipOutcome, number>>;
  readonly duplicateLikeCount: number; readonly allowBlockCount: number;
  readonly allowBlockOutcomeCounts: Readonly<Record<MhsSemanticRelationshipOutcome, number>>;
}
export interface MhsReviewFloorSemanticAuditPayload {
  readonly schemaVersion: typeof MHS_REVIEW_FLOOR_SEMANTIC_AUDIT_SCHEMA; readonly policyVersion: typeof STHN_SEMANTIC_REVIEW_POLICY_VERSION;
  readonly lineage: { readonly sourceSemanticAuditSha256: typeof MHS_SEMANTIC_SOURCE_SHA256; readonly sourceSemanticAuditPayloadDigest: typeof MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST;
    readonly scoresReusedWithoutInference: true };
  readonly sourceCandidateArtifactSha256: typeof MHS_CANDIDATE_ARTIFACT_SHA256; readonly sourceCandidatePayloadDigest: typeof MHS_CANDIDATE_PAYLOAD_DIGEST;
  readonly candidateMembershipDigest: string; readonly candidateCount: 86; readonly pairCount: 3655;
  readonly reviewBands: { readonly previousReviewFloor: 0.8; readonly routineReviewFloor: 0.85; readonly investigationBoundary: 0.85;
    readonly highConfidenceMinimum: 0.94; readonly authority: "REVIEW_SIGNALS_ONLY_NO_AUTOMATIC_MUTATION" };
  readonly priorStoredFindingCount: 1237; readonly routineReviewSignalCount: 19; readonly belowReviewFloorPairCount: 3636;
  readonly highConfidenceSignalCount: 0; readonly findings: readonly MhsSemanticFinding[]; readonly generatedAt: string;
  readonly candidateMutationApplied: false; readonly semanticGroupIdApplied: false; readonly trainingEligibleCount: 0;
}
export interface MhsReviewFloorSemanticAuditArtifact extends MhsReviewFloorSemanticAuditPayload { readonly semanticAuditPayloadDigest: string; }

export interface MhsReviewFloorAuthorizationPayload {
  readonly schemaVersion: typeof MHS_REVIEW_FLOOR_AUTHORIZATION_SCHEMA; readonly phase: "T6L-6J-L";
  readonly decision: "AUTHORIZE_0_85_REVIEW_FLOOR"; readonly oldReviewFloor: 0.8; readonly newReviewFloor: 0.85;
  readonly investigationBoundary: 0.85; readonly highConfidenceSignal: 0.94;
  readonly candidateArtifactSha256: typeof MHS_CANDIDATE_ARTIFACT_SHA256; readonly candidateMembershipDigest: string;
  readonly sourceSemanticAuditSha256: typeof MHS_SEMANTIC_SOURCE_SHA256; readonly hValidatedSha256: typeof MHS_SEMANTIC_I_VALIDATED_SHA256;
  readonly hPrecisionSha256: typeof MHS_SEMANTIC_I_PRECISION_SHA256; readonly jValidatedSha256: typeof MHS_K_VALIDATED_SHA256;
  readonly jAnalysisSha256: typeof MHS_K_ANALYSIS_SHA256; readonly jCompletedCsvSha256: typeof MHS_SEMANTIC_BOUNDARY_COMPLETED_SHA256;
  readonly jManifestSha256: typeof MHS_SEMANTIC_BOUNDARY_MANIFEST_SHA256; readonly replaySemanticAuditFilename: typeof MHS_REVIEW_FLOOR_SEMANTIC_AUDIT_FILENAME;
  readonly replaySemanticAuditSha256: string; readonly replaySemanticAuditPayloadDigest: string;
  readonly reviewedHPlusJCount: 225; readonly currentContractImpact: ReviewFloorImpactSummary; readonly proposedContractImpact: ReviewFloorImpactSummary;
  readonly exactPairCountDelta: { readonly routineReviewPairs: -1218; readonly belowReviewFloorPairs: 1218 };
  readonly humanEvidence: { readonly retained: HumanReplaySummary; readonly excluded: HumanReplaySummary; readonly duplicateLikeTotal: 2;
    readonly duplicateLikeRetained: 2; readonly duplicateLikeLost: 0 };
  readonly allowBlockImpact: { readonly allSemanticSignalsCurrent: number; readonly allSemanticSignalsProposed: number; readonly allSemanticSignalsExcluded: number;
    readonly reviewedCurrent: number; readonly reviewedRetained: number; readonly reviewedExcluded: number; readonly reviewedExcludedDuplicateLike: number };
  readonly productionCouplingVerification: { readonly productionRuntimeConsumesReviewFloor: false; readonly moderationThresholdChanged: false;
    readonly purpose: "MINIMUM_SEMANTIC_SIMILARITY_FOR_ROUTINE_DUPLICATE_NEAR_DUPLICATE_REVIEW" };
  readonly candidateMutationVerification: { readonly membershipChanged: false; readonly moderationJudgmentsChanged: false; readonly semanticScoresChanged: false;
    readonly candidatesMerged: false; readonly candidatesRemoved: false; readonly semanticGroupIdApplied: false; readonly trainingEligibleCount: 0 };
  readonly rationale: string; readonly limitations: readonly string[]; readonly generatedAt: string;
}
export interface MhsReviewFloorAuthorizationArtifact extends MhsReviewFloorAuthorizationPayload { readonly authorizationPayloadDigest: string; }

export interface ReviewFloorAuthorityPaths {
  readonly candidatePath: string; readonly semanticPath: string; readonly hValidatedPath: string; readonly hPrecisionPath: string;
  readonly jValidatedPath: string; readonly jAnalysisPath: string; readonly jCompletedPath: string; readonly jManifestPath: string;
}
export interface CreateReviewFloorAuthorizationOptions extends ReviewFloorAuthorityPaths {
  readonly candidateOutputDirectory: string; readonly reviewOutputDirectory: string; readonly generatedAt?: string;
  readonly publishAtomic?: (temporaryPath: string, targetPath: string) => void;
}

const strictInstant = (value: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value;
const digest = (payload: unknown): string => crypto.createHash("sha256").update(canonicalJson(payload)).digest("hex");
const readExact = <T>(filename: string, expectedSha: string, validator?: (value: T) => void): T => { const bytes = fs.readFileSync(filename); if (sha256(bytes) !== expectedSha) throw new Error(`Review-floor authority SHA-256 mismatch: ${path.basename(filename)}`); const value = JSON.parse(bytes.toString("utf8")) as T; validator?.(value); return value; };
const outcomeCounts = (records: readonly HumanRecord[]): Readonly<Record<MhsSemanticRelationshipOutcome, number>> => Object.fromEntries(outcomes.map((outcome) => [outcome, records.filter((record) => record.semanticRelationship === outcome).length])) as Readonly<Record<MhsSemanticRelationshipOutcome, number>>;
const findingPairType = (finding: MhsSemanticFinding): PairType => finding.allowBlockConflict ? "ALLOW_BLOCK" : finding.candidateADecision === "ALLOW" ? "ALLOW_ALLOW"
  : finding.candidateAPrimaryCategory === finding.candidateBPrimaryCategory ? "BLOCK_BLOCK_SAME_PRIMARY_CATEGORY" : "BLOCK_BLOCK_DIFFERENT_PRIMARY_CATEGORY";
const impact = (findings: readonly MhsSemanticFinding[], floor: number): ReviewFloorImpactSummary => { const retained = findings.filter((finding) => finding.similarity >= floor); return {
  reviewFloor: floor, totalPossiblePairs: 3655, scoredPairCount: 3655, routineReviewPairCount: retained.length, belowReviewFloorPairCount: 3655 - retained.length,
  pairTypeCounts: Object.fromEntries(pairTypes.map((type) => [type, retained.filter((finding) => findingPairType(finding) === type).length])) as Readonly<Record<PairType, number>>,
  scoreRegionCounts: { gte094: retained.filter((finding) => finding.similarity >= 0.94).length, gte085: retained.filter((finding) => finding.similarity >= 0.85).length,
    score084To085: retained.filter((finding) => finding.similarity >= 0.84 && finding.similarity < 0.85).length,
    score083To084: retained.filter((finding) => finding.similarity >= 0.83 && finding.similarity < 0.84).length,
    score082To083: retained.filter((finding) => finding.similarity >= 0.82 && finding.similarity < 0.83).length,
    score081To082: retained.filter((finding) => finding.similarity >= 0.81 && finding.similarity < 0.82).length,
    score080To081: retained.filter((finding) => finding.similarity >= 0.8 && finding.similarity < 0.81).length },
}; };
const humanSummary = (records: readonly HumanRecord[]): HumanReplaySummary => { const counts = outcomeCounts(records); const allowBlock = records.filter((record) => record.allowBlockConflict); return { reviewedCount: records.length,
  hCount: records.filter((record) => record.provenance === "H").length, jCount: records.filter((record) => record.provenance === "J").length, outcomeCounts: counts,
  duplicateLikeCount: counts.DUPLICATE + counts.NEAR_DUPLICATE, allowBlockCount: allowBlock.length, allowBlockOutcomeCounts: outcomeCounts(allowBlock) }; };

export const validateMhsReviewFloorSemanticAuditArtifact = (artifact: MhsReviewFloorSemanticAuditArtifact): void => { const { semanticAuditPayloadDigest, ...payload } = artifact;
  if (payload.schemaVersion !== MHS_REVIEW_FLOOR_SEMANTIC_AUDIT_SCHEMA || payload.policyVersion !== STHN_SEMANTIC_REVIEW_POLICY_VERSION
    || payload.lineage.sourceSemanticAuditSha256 !== MHS_SEMANTIC_SOURCE_SHA256 || payload.lineage.sourceSemanticAuditPayloadDigest !== MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST || !payload.lineage.scoresReusedWithoutInference
    || payload.sourceCandidateArtifactSha256 !== MHS_CANDIDATE_ARTIFACT_SHA256 || payload.sourceCandidatePayloadDigest !== MHS_CANDIDATE_PAYLOAD_DIGEST
    || payload.reviewBands.previousReviewFloor !== 0.8 || payload.reviewBands.routineReviewFloor !== 0.85 || payload.reviewBands.investigationBoundary !== 0.85 || payload.reviewBands.highConfidenceMinimum !== 0.94
    || payload.candidateCount !== 86 || payload.pairCount !== 3655 || payload.priorStoredFindingCount !== 1237 || payload.routineReviewSignalCount !== 19 || payload.belowReviewFloorPairCount !== 3636
    || payload.highConfidenceSignalCount !== 0 || payload.findings.length !== 19 || payload.findings.some((finding) => !isRoutineSemanticDuplicateReviewSignal(finding.similarity))
    || !strictInstant(payload.generatedAt) || payload.candidateMutationApplied || payload.semanticGroupIdApplied || payload.trainingEligibleCount !== 0 || semanticAuditPayloadDigest !== digest(payload)) throw new Error("Invalid authorized review-floor semantic audit");
};

export const validateMhsReviewFloorAuthorizationArtifact = (artifact: MhsReviewFloorAuthorizationArtifact): void => { const { authorizationPayloadDigest, ...payload } = artifact;
  if (payload.schemaVersion !== MHS_REVIEW_FLOOR_AUTHORIZATION_SCHEMA || payload.phase !== "T6L-6J-L" || payload.decision !== "AUTHORIZE_0_85_REVIEW_FLOOR"
    || payload.oldReviewFloor !== 0.8 || payload.newReviewFloor !== 0.85 || payload.investigationBoundary !== 0.85 || payload.highConfidenceSignal !== 0.94
    || payload.candidateArtifactSha256 !== MHS_CANDIDATE_ARTIFACT_SHA256 || payload.sourceSemanticAuditSha256 !== MHS_SEMANTIC_SOURCE_SHA256
    || payload.hValidatedSha256 !== MHS_SEMANTIC_I_VALIDATED_SHA256 || payload.hPrecisionSha256 !== MHS_SEMANTIC_I_PRECISION_SHA256
    || payload.jValidatedSha256 !== MHS_K_VALIDATED_SHA256 || payload.jAnalysisSha256 !== MHS_K_ANALYSIS_SHA256 || payload.jCompletedCsvSha256 !== MHS_SEMANTIC_BOUNDARY_COMPLETED_SHA256
    || payload.jManifestSha256 !== MHS_SEMANTIC_BOUNDARY_MANIFEST_SHA256 || payload.reviewedHPlusJCount !== 225 || payload.currentContractImpact.routineReviewPairCount !== 1237
    || payload.proposedContractImpact.routineReviewPairCount !== 19 || payload.exactPairCountDelta.routineReviewPairs !== -1218 || payload.humanEvidence.duplicateLikeRetained !== 2
    || payload.humanEvidence.duplicateLikeLost !== 0 || payload.humanEvidence.excluded.reviewedCount !== 206 || payload.humanEvidence.excluded.duplicateLikeCount !== 0
    || payload.productionCouplingVerification.productionRuntimeConsumesReviewFloor || payload.productionCouplingVerification.moderationThresholdChanged
    || Object.values(payload.candidateMutationVerification).some((value) => typeof value === "boolean" ? value : value !== 0) || !strictInstant(payload.generatedAt)
    || authorizationPayloadDigest !== digest(payload)) throw new Error("Invalid semantic review-floor authorization artifact");
};

export const createMhsSemanticReviewFloorAuthorization = (options: CreateReviewFloorAuthorizationOptions): { readonly semanticAuditPath: string; readonly semanticAuditSha256: string;
  readonly semanticAudit: MhsReviewFloorSemanticAuditArtifact; readonly authorizationPath: string; readonly authorizationSha256: string; readonly authorization: MhsReviewFloorAuthorizationArtifact } => {
  const candidate = readExact<MhsCandidateAdmissionArtifact>(options.candidatePath, MHS_CANDIDATE_ARTIFACT_SHA256, validateMhsCandidateAdmissionArtifact);
  const semantic = readExact<MhsSemanticAuditArtifact>(options.semanticPath, MHS_SEMANTIC_SOURCE_SHA256, validateMhsSemanticAuditArtifact);
  const h = readExact<MhsSemanticValidatedReviewArtifact>(options.hValidatedPath, MHS_SEMANTIC_I_VALIDATED_SHA256, validateMhsSemanticValidatedReviewArtifact);
  const hPrecision = readExact<{ readonly precisionPayloadDigest: string }>(options.hPrecisionPath, MHS_SEMANTIC_I_PRECISION_SHA256);
  const j = readExact<MhsSemanticBoundaryValidatedArtifact>(options.jValidatedPath, MHS_K_VALIDATED_SHA256, validateMhsSemanticBoundaryValidatedArtifact);
  const jAnalysis = readExact<MhsSemanticBoundaryAnalysisArtifact>(options.jAnalysisPath, MHS_K_ANALYSIS_SHA256, validateMhsSemanticBoundaryAnalysisArtifact);
  if (sha256(fs.readFileSync(options.jCompletedPath)) !== MHS_SEMANTIC_BOUNDARY_COMPLETED_SHA256 || sha256(fs.readFileSync(options.jManifestPath)) !== MHS_SEMANTIC_BOUNDARY_MANIFEST_SHA256) throw new Error("J completed or manifest authority changed");
  if (semantic.semanticAuditPayloadDigest !== MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST || h.validatedReviewPayloadDigest !== MHS_SEMANTIC_I_VALIDATED_PAYLOAD_DIGEST
    || hPrecision.precisionPayloadDigest !== MHS_SEMANTIC_I_PRECISION_PAYLOAD_DIGEST || j.validatedBoundaryPayloadDigest !== MHS_K_VALIDATED_PAYLOAD_DIGEST
    || jAnalysis.boundaryAnalysisPayloadDigest !== MHS_K_ANALYSIS_PAYLOAD_DIGEST || candidate.candidatePayloadDigest !== MHS_CANDIDATE_PAYLOAD_DIGEST) throw new Error("Review-floor payload authority changed");
  const admitted = candidate.rows.filter((row) => row.candidateAdmitted); const allowCount = admitted.filter((row) => row.reviewerDecision === "ALLOW").length; const blockCount = admitted.filter((row) => row.reviewerDecision === "BLOCK").length;
  if (admitted.length !== 86 || allowCount !== 58 || blockCount !== 28 || candidate.rows.some((row) => row.trainingEligible)) throw new Error("Review-floor candidate authority changed");
  const hKeys = new Set(h.records.map((record) => record.pairKey)); if (j.records.some((record) => hKeys.has(record.pairKey))) throw new Error("H/J overlap is non-zero");
  const human: HumanRecord[] = [...h.records.map((record) => ({ provenance: "H" as const, pairKey: record.pairKey, semanticScore: record.semanticScore, semanticRelationship: record.semanticRelationship,
    allowBlockConflict: record.decisionRelationship === "ALLOW_BLOCK" })), ...j.records.map((record) => ({ provenance: "J" as const, pairKey: record.pairKey, semanticScore: record.semanticScore,
    semanticRelationship: record.semanticRelationship, allowBlockConflict: record.pairType === "ALLOW_BLOCK" }))];
  const retainedHuman = human.filter((record) => record.semanticScore >= STHN_SEMANTIC_REVIEW_FLOOR); const excludedHuman = human.filter((record) => record.semanticScore < STHN_SEMANTIC_REVIEW_FLOOR);
  const retainedSummary = humanSummary(retainedHuman); const excludedSummary = humanSummary(excludedHuman); const allSummary = humanSummary(human);
  const current = impact(semantic.findings, STHN_SEMANTIC_PREVIOUS_REVIEW_FLOOR); const proposed = impact(semantic.findings, STHN_SEMANTIC_REVIEW_FLOOR);
  if (human.length !== 225 || retainedSummary.reviewedCount !== 19 || excludedSummary.reviewedCount !== 206 || allSummary.duplicateLikeCount !== 2 || retainedSummary.duplicateLikeCount !== 2 || excludedSummary.duplicateLikeCount !== 0
    || excludedSummary.outcomeCounts.NEEDS_ADJUDICATION !== 0 || current.routineReviewPairCount !== 1237 || proposed.routineReviewPairCount !== 19 || proposed.scoreRegionCounts.gte094 !== 0) throw new Error("DO_NOT_AUTHORIZE_0_85_REVIEW_FLOOR: replay safety condition failed");
  const generatedAt = options.generatedAt ?? new Date().toISOString(); if (!strictInstant(generatedAt)) throw new Error("Authorization timestamp must use strict UTC milliseconds");
  const retainedFindings = semantic.findings.filter((finding) => isRoutineSemanticDuplicateReviewSignal(finding.similarity));
  const semanticPayload: MhsReviewFloorSemanticAuditPayload = { schemaVersion: MHS_REVIEW_FLOOR_SEMANTIC_AUDIT_SCHEMA, policyVersion: STHN_SEMANTIC_REVIEW_POLICY_VERSION,
    lineage: { sourceSemanticAuditSha256: MHS_SEMANTIC_SOURCE_SHA256, sourceSemanticAuditPayloadDigest: MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST, scoresReusedWithoutInference: true },
    sourceCandidateArtifactSha256: MHS_CANDIDATE_ARTIFACT_SHA256, sourceCandidatePayloadDigest: MHS_CANDIDATE_PAYLOAD_DIGEST, candidateMembershipDigest: semantic.candidateMembershipDigest,
    candidateCount: 86, pairCount: 3655, reviewBands: { previousReviewFloor: 0.8, routineReviewFloor: 0.85, investigationBoundary: 0.85, highConfidenceMinimum: 0.94,
      authority: "REVIEW_SIGNALS_ONLY_NO_AUTOMATIC_MUTATION" }, priorStoredFindingCount: 1237, routineReviewSignalCount: 19, belowReviewFloorPairCount: 3636,
    highConfidenceSignalCount: 0, findings: retainedFindings, generatedAt, candidateMutationApplied: false, semanticGroupIdApplied: false, trainingEligibleCount: 0 };
  const semanticAudit: MhsReviewFloorSemanticAuditArtifact = { ...semanticPayload, semanticAuditPayloadDigest: digest(semanticPayload) }; validateMhsReviewFloorSemanticAuditArtifact(semanticAudit);
  const semanticSerialized = canonicalJson(semanticAudit); const semanticAuditSha256 = sha256(Buffer.from(semanticSerialized));
  const authorizationPayload: MhsReviewFloorAuthorizationPayload = { schemaVersion: MHS_REVIEW_FLOOR_AUTHORIZATION_SCHEMA, phase: "T6L-6J-L", decision: "AUTHORIZE_0_85_REVIEW_FLOOR",
    oldReviewFloor: 0.8, newReviewFloor: 0.85, investigationBoundary: 0.85, highConfidenceSignal: 0.94, candidateArtifactSha256: MHS_CANDIDATE_ARTIFACT_SHA256,
    candidateMembershipDigest: semantic.candidateMembershipDigest, sourceSemanticAuditSha256: MHS_SEMANTIC_SOURCE_SHA256, hValidatedSha256: MHS_SEMANTIC_I_VALIDATED_SHA256,
    hPrecisionSha256: MHS_SEMANTIC_I_PRECISION_SHA256, jValidatedSha256: MHS_K_VALIDATED_SHA256, jAnalysisSha256: MHS_K_ANALYSIS_SHA256,
    jCompletedCsvSha256: MHS_SEMANTIC_BOUNDARY_COMPLETED_SHA256, jManifestSha256: MHS_SEMANTIC_BOUNDARY_MANIFEST_SHA256,
    replaySemanticAuditFilename: MHS_REVIEW_FLOOR_SEMANTIC_AUDIT_FILENAME, replaySemanticAuditSha256: semanticAuditSha256, replaySemanticAuditPayloadDigest: semanticAudit.semanticAuditPayloadDigest,
    reviewedHPlusJCount: 225, currentContractImpact: current, proposedContractImpact: proposed, exactPairCountDelta: { routineReviewPairs: -1218, belowReviewFloorPairs: 1218 },
    humanEvidence: { retained: retainedSummary, excluded: excludedSummary, duplicateLikeTotal: 2, duplicateLikeRetained: 2, duplicateLikeLost: 0 },
    allowBlockImpact: { allSemanticSignalsCurrent: current.pairTypeCounts.ALLOW_BLOCK, allSemanticSignalsProposed: proposed.pairTypeCounts.ALLOW_BLOCK,
      allSemanticSignalsExcluded: current.pairTypeCounts.ALLOW_BLOCK - proposed.pairTypeCounts.ALLOW_BLOCK, reviewedCurrent: 75, reviewedRetained: retainedSummary.allowBlockCount,
      reviewedExcluded: excludedSummary.allowBlockCount, reviewedExcludedDuplicateLike: excludedSummary.allowBlockOutcomeCounts.DUPLICATE + excludedSummary.allowBlockOutcomeCounts.NEAR_DUPLICATE },
    productionCouplingVerification: { productionRuntimeConsumesReviewFloor: false, moderationThresholdChanged: false, purpose: "MINIMUM_SEMANTIC_SIMILARITY_FOR_ROUTINE_DUPLICATE_NEAR_DUPLICATE_REVIEW" },
    candidateMutationVerification: { membershipChanged: false, moderationJudgmentsChanged: false, semanticScoresChanged: false, candidatesMerged: false, candidatesRemoved: false,
      semanticGroupIdApplied: false, trainingEligibleCount: 0 }, rationale: "All replay and integrity gates passed: both known near-duplicates remain in routine review at 0.85, no known duplicate-like finding is lost, and no production, moderation, candidate, score, grouping, or eligibility coupling exists.",
    limitations: ["H and J are deterministic stratified samples, not population-random.", "Reviewed-sample retention is not global recall across 3,655 pairs.", "Future datasets may require recalibration.",
      "Semantic similarity never overrides human moderation judgment.", "The 0.94 signal remains unchanged and authorizes no automatic merge or deletion."], generatedAt };
  const authorization: MhsReviewFloorAuthorizationArtifact = { ...authorizationPayload, authorizationPayloadDigest: digest(authorizationPayload) }; validateMhsReviewFloorAuthorizationArtifact(authorization);
  const semanticAuditPath = path.join(options.candidateOutputDirectory, MHS_REVIEW_FLOOR_SEMANTIC_AUDIT_FILENAME); const authorizationPath = path.join(options.reviewOutputDirectory, MHS_REVIEW_FLOOR_AUTHORIZATION_FILENAME);
  if (fs.existsSync(semanticAuditPath) || fs.existsSync(authorizationPath)) throw new Error("Immutable review-floor artifact already exists");
  let semanticPublished = false;
  try {
    writeImmutableFileAtomic(semanticAuditPath, semanticSerialized, options.publishAtomic); semanticPublished = true;
    writeImmutableFileAtomic(authorizationPath, canonicalJson(authorization), options.publishAtomic);
  } catch (error) {
    // Roll back only the exact new first member if the two-artifact publication did
    // not reach its commit point. Pre-existing targets are rejected above.
    if (semanticPublished && fs.existsSync(semanticAuditPath)) fs.unlinkSync(semanticAuditPath);
    throw error;
  }
  return { semanticAuditPath, semanticAuditSha256, semanticAudit, authorizationPath, authorizationSha256: sha256(Buffer.from(canonicalJson(authorization))), authorization };
};
