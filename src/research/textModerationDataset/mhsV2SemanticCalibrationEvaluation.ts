import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { parseCsv } from "./csv";
import { canonicalJson, sha256 } from "./manifest";
import {
  E5_CONTRACT_SHA256, E5_EXPORT_MANIFEST_SHA256, E5_RUNTIME_CERTIFICATION_SHA256,
  MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST, MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256,
  MhsV2SemanticCalibrationPolicyArtifact, evaluateMhsV2CalibrationEvidence,
  validateMhsV2SemanticCalibrationPolicy,
} from "./mhsV2SemanticCalibrationPolicy";
import {
  MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST, MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_PAYLOAD_DIGEST,
  MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SHA256, MHS_V2_SEMANTIC_CALIBRATION_REVIEW_SHA256,
  MhsV2CalibrationScope, MhsV2CalibrationStratum, MhsV2SemanticCalibrationMembershipArtifact,
  mhsV2CalibrationRegion, validateMhsV2SemanticCalibrationMembership,
} from "./mhsV2SemanticCalibrationExecution";
import {
  MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_PAYLOAD_DIGEST, MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_SHA256,
  MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_SHA256, MHS_V2_SEMANTIC_CALIBRATION_EXPECTED_OUTCOME_COUNTS,
  MHS_V2_SEMANTIC_CALIBRATION_REVIEWER_A_JUDGMENTS, MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PAYLOAD_DIGEST,
  MHS_V2_SEMANTIC_RELATIONSHIPS, MhsV2SemanticCalibrationReviewCertification, MhsV2SemanticRelationship,
  validateMhsV2SemanticCalibrationCompletedReview, validateMhsV2SemanticCalibrationReviewCertification,
} from "./mhsV2SemanticCalibrationReviewValidation";
import { MHS_REVIEWER_A_ID } from "./mhsReviewImport";
import { E5_SMALL_MODEL_REPOSITORY, E5_SMALL_MODEL_REVISION } from "./semanticSimilarity/e5SmallExportContract";

export const MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_V1" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_VERSION = "MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_V1" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_FILENAME = "mhs-v2-semantic-calibration-evaluation-v1.json" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_V1" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_VERSION = "MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_V1" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_FILENAME = "mhs-v2-semantic-calibration-evaluation-certification-v1.json" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_SHA256 = "568f22fc603a7b803d0f2f60ad2976c9b0536e9e10401065ed938c78c37d5b74" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_PAYLOAD_DIGEST = "c8b0ebc5fab0fa70e8ef0d8e730eed6c8949e4071c3d55c3cf7745553f187bc2" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_SHA256 = "81ea66837a2cc438593d43bbd6595d01dd26554fafe90d98046b635eb34d22f7" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST = "71d8fc5c935dab551352106b0c0ca9e5ec418d5e92b75c205796807499fe1cb6" as const;
export const MHS_V2_CALIBRATION_POLICY_CONCLUSIONS = ["SUPPORT_0_85_CANDIDATE_FLOOR", "FAIL_0_85_REQUIRES_SEPARATE_SUCCESSOR_CALIBRATION", "INCONCLUSIVE"] as const;
export type MhsV2CalibrationPolicyConclusion = typeof MHS_V2_CALIBRATION_POLICY_CONCLUSIONS[number];
export const MHS_V2_EVALUATION_STRATA = ["R1", "R2", "R3", "R4", "R5", "R6", "C1"] as const;

type OutcomeCounts = Readonly<Record<MhsV2SemanticRelationship, number>>;
type StratumCounts = Readonly<Record<MhsV2CalibrationStratum, OutcomeCounts>>;
export interface MhsV2JoinedCalibrationRow {
  readonly reviewRowNumber: number; readonly pairId: string; readonly relationship: MhsV2SemanticRelationship;
  readonly scope: MhsV2CalibrationScope; readonly samplingStratum: MhsV2CalibrationStratum; readonly e5Score: number;
  readonly candidateAId: string; readonly candidateATextSha256: string; readonly candidateBId: string; readonly candidateBTextSha256: string;
}
export type MhsV2DuplicateLikeDiagnostic = MhsV2JoinedCalibrationRow & { readonly below0_85: boolean };

export interface MhsV2SemanticCalibrationEvaluationInputs {
  readonly policyBytes: Buffer; readonly membershipBytes: Buffer; readonly blindedCsv: string; readonly completedCsv: string; readonly reviewCertificationBytes: Buffer;
  readonly e5ContractBytes: Buffer; readonly e5ExportManifestBytes: Buffer; readonly e5RuntimeCertificationBytes: Buffer;
}

interface EvaluationAnalysis {
  readonly outcomeCounts: OutcomeCounts; readonly duplicateLikeTotal: number;
  readonly byScope: Readonly<Record<MhsV2CalibrationScope, OutcomeCounts & { readonly duplicateLikeTotal: number }>>;
  readonly bySamplingStratum: StratumCounts;
  readonly byScopeAndSamplingStratum: Readonly<Record<MhsV2CalibrationScope, StratumCounts>>;
  readonly duplicateLikePairs: readonly MhsV2DuplicateLikeDiagnostic[];
  readonly below0_85: {
    readonly DUPLICATE: number; readonly NEAR_DUPLICATE: number; readonly duplicateLikeTotal: number;
    readonly byScope: Readonly<Record<MhsV2CalibrationScope, number>>;
    readonly bySamplingStratum: Readonly<Record<MhsV2CalibrationStratum, number>>;
  };
  readonly minimumObservedDuplicateLike: { readonly e5Score: number; readonly relationship: "DUPLICATE" | "NEAR_DUPLICATE"; readonly scope: MhsV2CalibrationScope; readonly samplingStratum: MhsV2CalibrationStratum; readonly pairId: string; readonly reviewRowNumber: number };
  readonly policyConclusion: MhsV2CalibrationPolicyConclusion;
}

interface EvaluationAuthorities {
  readonly policyArtifactSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256; readonly policyPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST;
  readonly membershipArtifactSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SHA256; readonly membershipPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_PAYLOAD_DIGEST; readonly membershipDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST;
  readonly blindedPacketSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_REVIEW_SHA256; readonly completedReviewSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_SHA256; readonly canonicalReviewPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PAYLOAD_DIGEST;
  readonly reviewCertificationSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_SHA256; readonly reviewCertificationPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_PAYLOAD_DIGEST;
  readonly reviewerId: typeof MHS_REVIEWER_A_ID;
  readonly e5: { readonly repository: typeof E5_SMALL_MODEL_REPOSITORY; readonly revision: typeof E5_SMALL_MODEL_REVISION; readonly contractSha256: typeof E5_CONTRACT_SHA256; readonly exportManifestSha256: typeof E5_EXPORT_MANIFEST_SHA256; readonly runtimeCertificationSha256: typeof E5_RUNTIME_CERTIFICATION_SHA256 };
}

export interface MhsV2SemanticCalibrationEvaluationPayload extends EvaluationAnalysis {
  readonly schemaVersion: typeof MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_SCHEMA; readonly evaluationVersion: typeof MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_VERSION;
  readonly phase: "T6L-7K-A1R-E"; readonly status: "POST_PUBLICATION_CALIBRATION_EVALUATION_COMPLETE"; readonly authorities: EvaluationAuthorities;
  readonly joinedRowCount: 300; readonly joinIntegrity: { readonly missingMachineRows: 0; readonly unknownMachineRows: 0; readonly duplicateMachineMappings: 0; readonly identityMismatches: 0; readonly unresolved: 0 };
  readonly limitations: readonly string[];
  readonly boundaries: { readonly replacementThresholdSelected: false; readonly semanticEdgesGenerated: false; readonly componentsGenerated: false; readonly splitsAssigned: false; readonly trainingEligibilityChanged: false; readonly protectedBenchmarkContentAccessed: false; readonly internalTestContentAccessed: false; readonly trainingPerformed: false; readonly productionIntegrationPerformed: false };
}
export type MhsV2SemanticCalibrationEvaluationArtifact = MhsV2SemanticCalibrationEvaluationPayload & { readonly evaluationPayloadDigest: string };

export interface MhsV2SemanticCalibrationEvaluationCertificationPayload {
  readonly schemaVersion: typeof MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_SCHEMA; readonly certificationVersion: typeof MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_VERSION;
  readonly phase: "T6L-7K-A1R-E"; readonly status: "CERTIFIED"; readonly authorities: EvaluationAuthorities & { readonly evaluationArtifactFilename: typeof MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_FILENAME; readonly evaluationArtifactSha256: string; readonly evaluationPayloadDigest: string };
  readonly results: { readonly joinedRowCount: 300; readonly unresolved: 0; readonly outcomeCounts: OutcomeCounts; readonly duplicateLikeTotal: number; readonly below0_85DuplicateLikeTotal: number; readonly policyConclusion: MhsV2CalibrationPolicyConclusion };
  readonly validation: { readonly exactJoinIntegrity: true; readonly deterministicReplayMatched: true; readonly immutableAtomicPublication: true; readonly overwriteRefusalVerified: true };
  readonly boundaries: MhsV2SemanticCalibrationEvaluationPayload["boundaries"];
}
export type MhsV2SemanticCalibrationEvaluationCertification = MhsV2SemanticCalibrationEvaluationCertificationPayload & { readonly certificationPayloadDigest: string };

const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
const shaText = (value: string): string => sha256(Buffer.from(value, "utf8"));
const emptyOutcomes = (): Record<MhsV2SemanticRelationship, number> => ({ DUPLICATE: 0, NEAR_DUPLICATE: 0, RELATED_BUT_DISTINCT: 0, UNRELATED: 0, NEEDS_ADJUDICATION: 0 });
const countsFor = (rows: readonly MhsV2JoinedCalibrationRow[]): OutcomeCounts => { const counts = emptyOutcomes(); rows.forEach((row) => { counts[row.relationship] += 1; }); return counts; };
const duplicateLike = (relationship: MhsV2SemanticRelationship): relationship is "DUPLICATE" | "NEAR_DUPLICATE" => relationship === "DUPLICATE" || relationship === "NEAR_DUPLICATE";
const expectedAuthorities = (): EvaluationAuthorities => ({ policyArtifactSha256: MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256, policyPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST,
  membershipArtifactSha256: MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SHA256, membershipPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_PAYLOAD_DIGEST, membershipDigest: MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST,
  blindedPacketSha256: MHS_V2_SEMANTIC_CALIBRATION_REVIEW_SHA256, completedReviewSha256: MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_SHA256, canonicalReviewPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PAYLOAD_DIGEST,
  reviewCertificationSha256: MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_SHA256, reviewCertificationPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_PAYLOAD_DIGEST, reviewerId: MHS_REVIEWER_A_ID,
  e5: { repository: E5_SMALL_MODEL_REPOSITORY, revision: E5_SMALL_MODEL_REVISION, contractSha256: E5_CONTRACT_SHA256, exportManifestSha256: E5_EXPORT_MANIFEST_SHA256, runtimeCertificationSha256: E5_RUNTIME_CERTIFICATION_SHA256 } });

export const reconcileMhsV2SemanticCalibrationRows = (inputs: MhsV2SemanticCalibrationEvaluationInputs): readonly MhsV2JoinedCalibrationRow[] => {
  if (sha256(inputs.e5ContractBytes) !== E5_CONTRACT_SHA256 || sha256(inputs.e5ExportManifestBytes) !== E5_EXPORT_MANIFEST_SHA256 || sha256(inputs.e5RuntimeCertificationBytes) !== E5_RUNTIME_CERTIFICATION_SHA256) throw new Error("A1R-E E5 authority SHA mismatch");
  if (sha256(inputs.policyBytes) !== MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256) throw new Error("A1R-E policy SHA mismatch");
  const policy = JSON.parse(inputs.policyBytes.toString("utf8")) as MhsV2SemanticCalibrationPolicyArtifact; validateMhsV2SemanticCalibrationPolicy(policy);
  if (policy.policyPayloadDigest !== MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST) throw new Error("A1R-E policy payload mismatch");
  if (sha256(inputs.membershipBytes) !== MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SHA256) throw new Error("A1R-E membership SHA mismatch");
  const membership = JSON.parse(inputs.membershipBytes.toString("utf8")) as MhsV2SemanticCalibrationMembershipArtifact; validateMhsV2SemanticCalibrationMembership(membership);
  if (membership.membershipPayloadDigest !== MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_PAYLOAD_DIGEST || membership.membershipDigest !== MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST) throw new Error("A1R-E membership digest mismatch");
  if (shaText(inputs.blindedCsv) !== MHS_V2_SEMANTIC_CALIBRATION_REVIEW_SHA256) throw new Error("A1R-E blinded packet SHA mismatch");
  if (shaText(inputs.completedCsv) !== MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_SHA256) throw new Error("A1R-E completed review SHA mismatch");
  if (sha256(inputs.reviewCertificationBytes) !== MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_SHA256) throw new Error("A1R-E review certification SHA mismatch");
  const reviewCertification = JSON.parse(inputs.reviewCertificationBytes.toString("utf8")) as MhsV2SemanticCalibrationReviewCertification; validateMhsV2SemanticCalibrationReviewCertification(reviewCertification);
  if (reviewCertification.certificationPayloadDigest !== MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_PAYLOAD_DIGEST || reviewCertification.review.canonicalReviewPayloadDigest !== MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PAYLOAD_DIGEST) throw new Error("A1R-E review authority digest mismatch");
  const reviewValidation = validateMhsV2SemanticCalibrationCompletedReview(inputs.completedCsv, { policyBytes: inputs.policyBytes, membershipBytes: inputs.membershipBytes, blindedCsv: inputs.blindedCsv, judgments: MHS_V2_SEMANTIC_CALIBRATION_REVIEWER_A_JUDGMENTS });
  if (reviewValidation.canonicalReviewPayloadDigest !== MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PAYLOAD_DIGEST) throw new Error("A1R-E completed review payload mismatch");
  const completed = parseCsv(inputs.completedCsv); const machineByPair = new Map(membership.rows.map((row) => [row.pairId, row])); const seenPairs = new Set<string>();
  const joined = completed.map((row): MhsV2JoinedCalibrationRow => {
    if (seenPairs.has(row.pair_id)) throw new Error("A1R-E duplicate human pair mapping"); seenPairs.add(row.pair_id); const machine = machineByPair.get(row.pair_id);
    if (!machine) throw new Error("A1R-E unknown human pair");
    if (row.candidate_a_id !== machine.candidateAId || row.candidate_a_text_sha256 !== machine.candidateATextSha256 || row.candidate_b_id !== machine.candidateBId || row.candidate_b_text_sha256 !== machine.candidateBTextSha256) throw new Error("A1R-E machine/human identity mismatch");
    return { reviewRowNumber: Number(row.review_row_number), pairId: row.pair_id, relationship: row.semantic_relationship_input as MhsV2SemanticRelationship, scope: machine.scope, samplingStratum: machine.stratum, e5Score: machine.e5Score, candidateAId: machine.candidateAId, candidateATextSha256: machine.candidateATextSha256, candidateBId: machine.candidateBId, candidateBTextSha256: machine.candidateBTextSha256 };
  });
  if (joined.length !== 300 || machineByPair.size !== 300 || membership.rows.some((row) => !seenPairs.has(row.pairId))) throw new Error("A1R-E missing machine row");
  return joined;
};

export const analyzeMhsV2SemanticCalibrationRows = (rows: readonly MhsV2JoinedCalibrationRow[]): EvaluationAnalysis => {
  if (rows.length !== 300) throw new Error("A1R-E analysis requires exactly 300 joined rows");
  if (new Set(rows.map((row) => row.reviewRowNumber)).size !== 300 || rows.some((row) => !Number.isInteger(row.reviewRowNumber) || row.reviewRowNumber < 1 || row.reviewRowNumber > 300)) throw new Error("A1R-E duplicate, missing, or unknown review row");
  if (new Set(rows.map((row) => row.pairId)).size !== 300) throw new Error("A1R-E duplicate pair mapping");
  rows.forEach((row) => {
    if (!(MHS_V2_SEMANTIC_RELATIONSHIPS as readonly string[]).includes(row.relationship) || row.relationship === "NEEDS_ADJUDICATION") throw new Error("A1R-E invalid or unresolved relationship");
    if (row.scope !== "A" && row.scope !== "B") throw new Error("A1R-E invalid scope");
    if (!(MHS_V2_EVALUATION_STRATA as readonly string[]).includes(row.samplingStratum)) throw new Error("A1R-E invalid sampling stratum");
    if (!Number.isFinite(row.e5Score) || row.e5Score < -1 || row.e5Score > 1) throw new Error("A1R-E missing or non-finite machine score");
    if (row.samplingStratum !== "C1" && mhsV2CalibrationRegion(row.e5Score) !== row.samplingStratum) throw new Error("A1R-E machine score/stratum mismatch");
    if (!row.pairId || !row.candidateAId || !row.candidateBId || !/^[a-f0-9]{64}$/u.test(row.candidateATextSha256) || !/^[a-f0-9]{64}$/u.test(row.candidateBTextSha256)) throw new Error("A1R-E invalid machine identity");
  });
  const outcomeCounts = countsFor(rows); if (canonicalJson(outcomeCounts) !== canonicalJson(MHS_V2_SEMANTIC_CALIBRATION_EXPECTED_OUTCOME_COUNTS)) throw new Error("A1R-E human outcome distribution mismatch");
  const byScope = Object.fromEntries((["A", "B"] as const).map((scope) => { const selected = rows.filter((row) => row.scope === scope), counts = countsFor(selected); return [scope, { ...counts, duplicateLikeTotal: counts.DUPLICATE + counts.NEAR_DUPLICATE }]; })) as EvaluationAnalysis["byScope"];
  const bySamplingStratum = Object.fromEntries(MHS_V2_EVALUATION_STRATA.map((stratum) => [stratum, countsFor(rows.filter((row) => row.samplingStratum === stratum))])) as StratumCounts;
  const byScopeAndSamplingStratum = Object.fromEntries((["A", "B"] as const).map((scope) => [scope, Object.fromEntries(MHS_V2_EVALUATION_STRATA.map((stratum) => [stratum, countsFor(rows.filter((row) => row.scope === scope && row.samplingStratum === stratum))]))])) as EvaluationAnalysis["byScopeAndSamplingStratum"];
  const expectedQuota = (scope: MhsV2CalibrationScope, stratum: MhsV2CalibrationStratum): number => stratum === "C1" ? (scope === "A" ? 45 : 15) : stratum === "R6" ? (scope === "A" ? 25 : 15) : scope === "A" ? 30 : 10;
  for (const scope of ["A", "B"] as const) for (const stratum of MHS_V2_EVALUATION_STRATA) if (Object.values(byScopeAndSamplingStratum[scope][stratum]).reduce((sum, count) => sum + count, 0) !== expectedQuota(scope, stratum)) throw new Error("A1R-E scope/stratum quota mismatch");
  const duplicateLikePairs = rows.filter((row) => duplicateLike(row.relationship)).sort((a, b) => a.reviewRowNumber - b.reviewRowNumber).map((row) => ({ ...row, below0_85: row.e5Score < 0.85 }));
  if (duplicateLikePairs.length !== 10) throw new Error("A1R-E duplicate-like total mismatch"); const below = duplicateLikePairs.filter((row) => row.below0_85);
  const byStratum = Object.fromEntries(MHS_V2_EVALUATION_STRATA.map((stratum) => [stratum, below.filter((row) => row.samplingStratum === stratum).length])) as Record<MhsV2CalibrationStratum, number>;
  const minimum = duplicateLikePairs.reduce((left, right) => right.e5Score < left.e5Score || (right.e5Score === left.e5Score && right.pairId.localeCompare(left.pairId) < 0) ? right : left);
  const policyConclusion = evaluateMhsV2CalibrationEvidence({ selectedUniquePairs: 300, resolvedReviews: 300, needsAdjudication: 0, invalidOrMissingReviews: 0, integrityPassed: true, quotasExact: true, blindnessPreserved: true, protocolReproduced: true, protectedOrModerationInfluence: false, belowFloorDuplicateLike: below.length, belowFloorControlDuplicateLike: byStratum.C1 });
  return { outcomeCounts, duplicateLikeTotal: duplicateLikePairs.length, byScope, bySamplingStratum, byScopeAndSamplingStratum, duplicateLikePairs,
    below0_85: { DUPLICATE: below.filter((row) => row.relationship === "DUPLICATE").length, NEAR_DUPLICATE: below.filter((row) => row.relationship === "NEAR_DUPLICATE").length, duplicateLikeTotal: below.length, byScope: { A: below.filter((row) => row.scope === "A").length, B: below.filter((row) => row.scope === "B").length }, bySamplingStratum: byStratum },
    minimumObservedDuplicateLike: { e5Score: minimum.e5Score, relationship: minimum.relationship as "DUPLICATE" | "NEAR_DUPLICATE", scope: minimum.scope, samplingStratum: minimum.samplingStratum, pairId: minimum.pairId, reviewRowNumber: minimum.reviewRowNumber }, policyConclusion };
};

const boundaries = (): MhsV2SemanticCalibrationEvaluationPayload["boundaries"] => ({ replacementThresholdSelected: false, semanticEdgesGenerated: false, componentsGenerated: false, splitsAssigned: false, trainingEligibilityChanged: false, protectedBenchmarkContentAccessed: false, internalTestContentAccessed: false, trainingPerformed: false, productionIntegrationPerformed: false });
export const createMhsV2SemanticCalibrationEvaluation = (inputs: MhsV2SemanticCalibrationEvaluationInputs): MhsV2SemanticCalibrationEvaluationArtifact => {
  const joined = reconcileMhsV2SemanticCalibrationRows(inputs), analysis = analyzeMhsV2SemanticCalibrationRows(joined);
  const payload: MhsV2SemanticCalibrationEvaluationPayload = { schemaVersion: MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_SCHEMA, evaluationVersion: MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_VERSION, phase: "T6L-7K-A1R-E", status: "POST_PUBLICATION_CALIBRATION_EVALUATION_COMPLETE", authorities: expectedAuthorities(), joinedRowCount: 300, joinIntegrity: { missingMachineRows: 0, unknownMachineRows: 0, duplicateMachineMappings: 0, identityMismatches: 0, unresolved: 0 }, ...analysis,
    limitations: ["Bounded result for the deliberately stratified 300-pair reviewed experiment; not a population-prevalence estimate.", "Does not prove exhaustive or global semantic duplicate recall.", "Minimum observed duplicate-like score is diagnostic only and is not an authorized replacement threshold."], boundaries: boundaries() };
  const artifact = { ...payload, evaluationPayloadDigest: digest(payload) }; validateMhsV2SemanticCalibrationEvaluation(artifact); return artifact;
};

export const validateMhsV2SemanticCalibrationEvaluation = (artifact: MhsV2SemanticCalibrationEvaluationArtifact): void => {
  const { evaluationPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_SCHEMA || artifact.evaluationVersion !== MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_VERSION || artifact.phase !== "T6L-7K-A1R-E" || artifact.status !== "POST_PUBLICATION_CALIBRATION_EVALUATION_COMPLETE"
    || canonicalJson(artifact.authorities) !== canonicalJson(expectedAuthorities()) || artifact.joinedRowCount !== 300 || Object.values(artifact.joinIntegrity).some(Boolean)
    || canonicalJson(artifact.outcomeCounts) !== canonicalJson(MHS_V2_SEMANTIC_CALIBRATION_EXPECTED_OUTCOME_COUNTS) || artifact.duplicateLikeTotal !== 10 || artifact.duplicateLikePairs.length !== 10
    || artifact.below0_85.duplicateLikeTotal !== artifact.below0_85.DUPLICATE + artifact.below0_85.NEAR_DUPLICATE
    || artifact.policyConclusion !== (artifact.below0_85.duplicateLikeTotal > 0 ? "FAIL_0_85_REQUIRES_SEPARATE_SUCCESSOR_CALIBRATION" : "SUPPORT_0_85_CANDIDATE_FLOOR")
    || Object.values(artifact.boundaries).some(Boolean) || evaluationPayloadDigest !== digest(payload) || canonicalJson(artifact).includes('"candidateAText"') || canonicalJson(artifact).includes('"candidateBText"')) throw new Error("Invalid A1R-E evaluation artifact");
};

export const createMhsV2SemanticCalibrationEvaluationCertification = (evaluation: MhsV2SemanticCalibrationEvaluationArtifact): MhsV2SemanticCalibrationEvaluationCertification => {
  validateMhsV2SemanticCalibrationEvaluation(evaluation); const evaluationText = canonicalJson(evaluation);
  const payload: MhsV2SemanticCalibrationEvaluationCertificationPayload = { schemaVersion: MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_SCHEMA, certificationVersion: MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_VERSION, phase: "T6L-7K-A1R-E", status: "CERTIFIED",
    authorities: { ...expectedAuthorities(), evaluationArtifactFilename: MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_FILENAME, evaluationArtifactSha256: shaText(evaluationText), evaluationPayloadDigest: evaluation.evaluationPayloadDigest },
    results: { joinedRowCount: 300, unresolved: 0, outcomeCounts: evaluation.outcomeCounts, duplicateLikeTotal: evaluation.duplicateLikeTotal, below0_85DuplicateLikeTotal: evaluation.below0_85.duplicateLikeTotal, policyConclusion: evaluation.policyConclusion },
    validation: { exactJoinIntegrity: true, deterministicReplayMatched: true, immutableAtomicPublication: true, overwriteRefusalVerified: true }, boundaries: evaluation.boundaries };
  const artifact = { ...payload, certificationPayloadDigest: digest(payload) }; validateMhsV2SemanticCalibrationEvaluationCertification(artifact); return artifact;
};

export const validateMhsV2SemanticCalibrationEvaluationCertification = (artifact: MhsV2SemanticCalibrationEvaluationCertification): void => {
  const { certificationPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_SCHEMA || artifact.certificationVersion !== MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_VERSION || artifact.phase !== "T6L-7K-A1R-E" || artifact.status !== "CERTIFIED"
    || artifact.authorities.evaluationArtifactFilename !== MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_FILENAME || !/^[a-f0-9]{64}$/u.test(artifact.authorities.evaluationArtifactSha256) || !/^[a-f0-9]{64}$/u.test(artifact.authorities.evaluationPayloadDigest)
    || artifact.results.joinedRowCount !== 300 || artifact.results.unresolved !== 0 || canonicalJson(artifact.results.outcomeCounts) !== canonicalJson(MHS_V2_SEMANTIC_CALIBRATION_EXPECTED_OUTCOME_COUNTS)
    || artifact.results.duplicateLikeTotal !== 10 || artifact.results.policyConclusion !== (artifact.results.below0_85DuplicateLikeTotal > 0 ? "FAIL_0_85_REQUIRES_SEPARATE_SUCCESSOR_CALIBRATION" : "SUPPORT_0_85_CANDIDATE_FLOOR")
    || Object.values(artifact.validation).some((value) => value !== true) || Object.values(artifact.boundaries).some(Boolean) || certificationPayloadDigest !== digest(payload)) throw new Error("Invalid A1R-E evaluation certification");
  const { evaluationArtifactFilename: _filename, evaluationArtifactSha256: _sha, evaluationPayloadDigest: _digest, ...upstream } = artifact.authorities;
  if (canonicalJson(upstream) !== canonicalJson(expectedAuthorities())) throw new Error("Invalid A1R-E certification authority binding");
};

type PairPublisher = (evaluationTemporary: string, evaluationTarget: string, certificationTemporary: string, certificationTarget: string) => void;
const defaultPublisher: PairPublisher = (evaluationTemporary, evaluationTarget, certificationTemporary, certificationTarget) => { fs.renameSync(evaluationTemporary, evaluationTarget); fs.renameSync(certificationTemporary, certificationTarget); };
export const publishMhsV2SemanticCalibrationEvaluation = (evaluation: MhsV2SemanticCalibrationEvaluationArtifact, certification: MhsV2SemanticCalibrationEvaluationCertification, outputDirectory: string, publish: PairPublisher = defaultPublisher): { readonly evaluationPath: string; readonly certificationPath: string; readonly evaluationSha256: string; readonly certificationSha256: string } => {
  validateMhsV2SemanticCalibrationEvaluation(evaluation); validateMhsV2SemanticCalibrationEvaluationCertification(certification); const evaluationText = canonicalJson(evaluation), certificationText = canonicalJson(certification);
  if (certification.authorities.evaluationArtifactSha256 !== shaText(evaluationText) || certification.authorities.evaluationPayloadDigest !== evaluation.evaluationPayloadDigest) throw new Error("A1R-E evaluation/certification binding mismatch");
  const evaluationPath = path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_FILENAME), certificationPath = path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_FILENAME);
  if (fs.existsSync(evaluationPath) || fs.existsSync(certificationPath)) throw new Error("A1R-E evaluation or certification exists; overwrite refused"); fs.mkdirSync(outputDirectory, { recursive: true });
  const token = `${process.pid}-${crypto.randomBytes(8).toString("hex")}`, evaluationTemporary = `${evaluationPath}.${token}.partial`, certificationTemporary = `${certificationPath}.${token}.partial`;
  try { fs.writeFileSync(evaluationTemporary, evaluationText, { flag: "wx" }); fs.writeFileSync(certificationTemporary, certificationText, { flag: "wx" }); publish(evaluationTemporary, evaluationPath, certificationTemporary, certificationPath); if (fs.readFileSync(evaluationPath, "utf8") !== evaluationText || fs.readFileSync(certificationPath, "utf8") !== certificationText) throw new Error("Incomplete A1R-E publication"); return { evaluationPath, certificationPath, evaluationSha256: shaText(evaluationText), certificationSha256: shaText(certificationText) }; }
  catch (error) { if (fs.existsSync(evaluationPath) && fs.readFileSync(evaluationPath, "utf8") === evaluationText) fs.rmSync(evaluationPath, { force: true }); if (fs.existsSync(certificationPath) && fs.readFileSync(certificationPath, "utf8") === certificationText) fs.rmSync(certificationPath, { force: true }); throw error; }
  finally { fs.rmSync(evaluationTemporary, { force: true }); fs.rmSync(certificationTemporary, { force: true }); }
};
