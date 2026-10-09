import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import { MHS_DEVELOPMENT_PROJECTION_MANIFEST_PAYLOAD_DIGEST, MHS_DEVELOPMENT_PROJECTION_MANIFEST_SHA256, MHS_DEVELOPMENT_PROJECTION_PAYLOAD_DIGEST, MHS_DEVELOPMENT_PROJECTION_SHA256 } from "./mhsMaterialization";
import { MHS_SEMANTIC_BOUNDARY_REUSE_CAP, MHS_SEMANTIC_I_PRECISION_SHA256, MHS_SEMANTIC_I_VALIDATED_SHA256, MHS_SEMANTIC_H_MANIFEST_SHA256 } from "./mhsSemanticBoundaryReviewPacket";
import { MHS_K_ANALYSIS_SHA256, MHS_K_VALIDATED_SHA256 } from "./mhsSemanticReviewFloorAuthorization";
import { MHS_SEMANTIC_SOURCE_SHA256 } from "./mhsSemanticReviewPacket";
import { MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST, MHS_V2_EXPANSION_CANDIDATE_PAYLOAD_DIGEST, MHS_V2_EXPANSION_CANDIDATE_SHA256 } from "./mhsV2ExpansionCandidateAcquisition";
import { MHS_V2_EXPANSION_CONSOLIDATION_MEMBERSHIP_DIGEST, MHS_V2_EXPANSION_CONSOLIDATION_PAYLOAD_DIGEST, MHS_V2_EXPANSION_CONSOLIDATION_SHA256 } from "./mhsV2ExpansionConsolidation";
import { MHS_V2_REVIEW_BATCH_PLAN_PAYLOAD_DIGEST, MHS_V2_REVIEW_BATCH_PLAN_SHA256, MHS_V2_REVIEW_UNIVERSE_PAYLOAD_DIGEST, MHS_V2_REVIEW_UNIVERSE_SHA256 } from "./mhsV2ExpansionReviewerA";
import { E5_SMALL_MODEL_REPOSITORY, E5_SMALL_MODEL_REVISION } from "./semanticSimilarity/e5SmallExportContract";
import { E5_SELECTED_PREFIX_POLICY_VERSION } from "./semanticSimilarity/e5SemanticCalibration";

export const MHS_V2_SEMANTIC_CALIBRATION_POLICY_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SEMANTIC_CALIBRATION_POLICY_V1" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_POLICY_VERSION = "MHS_V2_SEMANTIC_CALIBRATION_POLICY_V1" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_POLICY_FILENAME = "mhs-v2-semantic-calibration-policy-v1.json" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256 = "937aa5e8d33eee25cbfb58f3b71c9179e21b72e8a56c6c403b8a968fc899b9ca" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST = "c3bf0d686993fa6ec24dd10ff2f639c236c3e2783762cf89bc29d2d07eea0eaf" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_SEED = "STHN-T6L-7K-A1R-P-V2-SEMANTIC-CALIBRATION-2026-09-18" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_REUSE_CAP = MHS_SEMANTIC_BOUNDARY_REUSE_CAP;
export const E5_CONTRACT_SHA256 = "00205e452a7f5a22e0ddb1e2bfab6b1916d5eeddeb3b0da17ae9c333991070f9" as const;
export const E5_EXPORT_MANIFEST_SHA256 = "af28451d28ca3de53d914988536a2ad97ff13b1b03766dd1bfe798ec7671ae12" as const;
export const E5_RUNTIME_CERTIFICATION_SHA256 = "5cb4f8a5a626becfa6853347180c54f778d1cdc186477a145ce794431795f5fe" as const;
export const MHS_L_AUTHORIZATION_SHA256 = "ba6ea90d6770c38a5912379f98b2937920c5b054a810c982f14dcc8fc19cb864" as const;
export const MHS_L_REPLAY_SHA256 = "8d4603f6c51b0acca962f16d4085ddceb3166413f5f8052cd68fac81bf130fe4" as const;
export const MHS_SPLIT_SHA256 = "f9f2598cd63da5a64997c7741461b76ac738db0f41b9be44ba75822cb1deb37f" as const;
export const MHS_INTERNAL_TEST_FREEZE_SHA256 = "11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36" as const;
export const FROZEN_140_SHA256 = "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747" as const;

export const MHS_V2_CALIBRATION_REGIONS = ["R1", "R2", "R3", "R4", "R5", "R6"] as const;
export type MhsV2CalibrationRegion = typeof MHS_V2_CALIBRATION_REGIONS[number];
export const MHS_V2_CALIBRATION_OUTCOMES = ["DUPLICATE", "NEAR_DUPLICATE", "RELATED_BUT_DISTINCT", "UNRELATED", "NEEDS_ADJUDICATION"] as const;

export interface MhsV2SemanticCalibrationAuthorityHashes {
  readonly v2Candidate: string; readonly reviewUniverse: string; readonly operationalPlan: string; readonly consolidation: string;
  readonly e5Contract: string; readonly e5ExportManifest: string; readonly e5RuntimeCertification: string; readonly gSemanticAudit: string;
  readonly hManifest: string; readonly hValidated: string; readonly hAnalysis: string; readonly jManifest: string; readonly jValidated: string;
  readonly jAnalysis: string; readonly lAuthorization: string; readonly lReplay: string; readonly developmentProjectionManifest: string;
  readonly developmentProjection: string; readonly splitManifest: string; readonly internalTestFreezeMetadata: string; readonly frozen140Artifact: string;
}

export const MHS_V2_SEMANTIC_CALIBRATION_EXPECTED_HASHES: MhsV2SemanticCalibrationAuthorityHashes = {
  v2Candidate: MHS_V2_EXPANSION_CANDIDATE_SHA256, reviewUniverse: MHS_V2_REVIEW_UNIVERSE_SHA256, operationalPlan: MHS_V2_REVIEW_BATCH_PLAN_SHA256,
  consolidation: MHS_V2_EXPANSION_CONSOLIDATION_SHA256, e5Contract: E5_CONTRACT_SHA256, e5ExportManifest: E5_EXPORT_MANIFEST_SHA256,
  e5RuntimeCertification: E5_RUNTIME_CERTIFICATION_SHA256, gSemanticAudit: MHS_SEMANTIC_SOURCE_SHA256, hManifest: MHS_SEMANTIC_H_MANIFEST_SHA256,
  hValidated: MHS_SEMANTIC_I_VALIDATED_SHA256, hAnalysis: MHS_SEMANTIC_I_PRECISION_SHA256, jManifest: "173fa2aa57a2a3c457677561b58f8223831274c1f77eed2aa21ecfd8435e295f",
  jValidated: MHS_K_VALIDATED_SHA256, jAnalysis: MHS_K_ANALYSIS_SHA256, lAuthorization: MHS_L_AUTHORIZATION_SHA256, lReplay: MHS_L_REPLAY_SHA256,
  developmentProjectionManifest: MHS_DEVELOPMENT_PROJECTION_MANIFEST_SHA256, developmentProjection: MHS_DEVELOPMENT_PROJECTION_SHA256,
  splitManifest: MHS_SPLIT_SHA256, internalTestFreezeMetadata: MHS_INTERNAL_TEST_FREEZE_SHA256, frozen140Artifact: FROZEN_140_SHA256,
};

const regionDefinitions = {
  R1: { minimumInclusive: 0.85, maximumExclusive: null, scopeAQuota: 30, scopeBQuota: 10, totalQuota: 40 },
  R2: { minimumInclusive: 0.84, maximumExclusive: 0.85, scopeAQuota: 30, scopeBQuota: 10, totalQuota: 40 },
  R3: { minimumInclusive: 0.83, maximumExclusive: 0.84, scopeAQuota: 30, scopeBQuota: 10, totalQuota: 40 },
  R4: { minimumInclusive: 0.82, maximumExclusive: 0.83, scopeAQuota: 30, scopeBQuota: 10, totalQuota: 40 },
  R5: { minimumInclusive: 0.8, maximumExclusive: 0.82, scopeAQuota: 30, scopeBQuota: 10, totalQuota: 40 },
  R6: { minimumInclusive: 0.78, maximumExclusive: 0.8, scopeAQuota: 25, scopeBQuota: 15, totalQuota: 40 },
} as const;

export interface MhsV2SemanticCalibrationPolicyPayload {
  readonly schemaVersion: typeof MHS_V2_SEMANTIC_CALIBRATION_POLICY_SCHEMA; readonly policyVersion: typeof MHS_V2_SEMANTIC_CALIBRATION_POLICY_VERSION;
  readonly phase: "T6L-7K-A1R-P"; readonly status: "IMMUTABLE_PRE_SCORING_POLICY_AUTHORITY"; readonly authorities: MhsV2SemanticCalibrationAuthorityHashes & {
    readonly v2CandidatePayloadDigest: typeof MHS_V2_EXPANSION_CANDIDATE_PAYLOAD_DIGEST; readonly v2CandidateMembershipDigest: typeof MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST;
    readonly reviewUniversePayloadDigest: typeof MHS_V2_REVIEW_UNIVERSE_PAYLOAD_DIGEST; readonly operationalPlanPayloadDigest: typeof MHS_V2_REVIEW_BATCH_PLAN_PAYLOAD_DIGEST;
    readonly consolidationPayloadDigest: typeof MHS_V2_EXPANSION_CONSOLIDATION_PAYLOAD_DIGEST; readonly consolidationMembershipDigest: typeof MHS_V2_EXPANSION_CONSOLIDATION_MEMBERSHIP_DIGEST;
    readonly developmentProjectionPayloadDigest: typeof MHS_DEVELOPMENT_PROJECTION_PAYLOAD_DIGEST; readonly developmentProjectionManifestPayloadDigest: typeof MHS_DEVELOPMENT_PROJECTION_MANIFEST_PAYLOAD_DIGEST;
  };
  readonly e5: { readonly repository: typeof E5_SMALL_MODEL_REPOSITORY; readonly revision: typeof E5_SMALL_MODEL_REVISION; readonly scoringPolicyVersion: typeof E5_SELECTED_PREFIX_POLICY_VERSION; readonly pooling: "ATTENTION_MASK_AWARE_MEAN"; readonly normalization: "L2"; readonly similarity: "COSINE"; readonly aggregation: "SYMMETRIC_BIDIRECTIONAL_MEAN"; readonly automaticEdgeAuthority: false };
  readonly searchScopes: { readonly A: { readonly identity: "V2_TO_V2"; readonly candidateCount: 400; readonly pairCount: 79800; readonly pairIdentity: "SCOPE_A::<LEXICAL_MIN_V2_ID>::<LEXICAL_MAX_V2_ID>" }; readonly B: { readonly identity: "V2_TO_HISTORICAL_ORDINARY_DEVELOPMENT"; readonly v2CandidateCount: 400; readonly historicalCandidateCount: 73; readonly historicalTrainCount: 60; readonly historicalValidationCount: 13; readonly pairCount: 29200; readonly pairIdentity: "SCOPE_B::<V2_ID>::<HISTORICAL_DEVELOPMENT_ID>" }; readonly totalPairCount: 109000 };
  readonly reviewDesign: { readonly totalReviewPairs: 300; readonly scopeAReviewPairs: 220; readonly scopeBReviewPairs: 80; readonly scoreSelectedPairs: 240; readonly scoreAgnosticControlPairs: 60; readonly scopeAControlPairs: 45; readonly scopeBControlPairs: 15; readonly regions: typeof regionDefinitions; readonly lowerScoreSelectedBoundary: 0.78 };
  readonly sampling: { readonly seed: typeof MHS_V2_SEMANTIC_CALIBRATION_SEED; readonly candidateReuseCap: 8; readonly runtimeRandomnessAllowed: false; readonly controlSelection: "C1_FIRST_HASH_RANK_FULL_SCOPE_WITHOUT_SCORE"; readonly scoreSelection: "FIXED_SCOPE_REGION_ORDER_DESCENDING_SCORE_SEEDED_HASH_TIEBREAK"; readonly selectionOrder: readonly ["SCOPE_A_C1", "SCOPE_B_C1", "SCOPE_A_R1_TO_R6", "SCOPE_B_R1_TO_R6"]; readonly controlsDisjointFromScoreSelected: true; readonly reversedPairsProhibited: true; readonly silentQuotaRedistributionAllowed: false };
  readonly reviewerBlindness: { readonly exactScoreHidden: true; readonly regionHidden: true; readonly controlStatusHidden: true; readonly scopeHiddenExceptInherentIdentity: true; readonly moderationDecisionHidden: true; readonly moderationCategoryHidden: true; readonly moderationReasonHidden: true; readonly sourceLabelsAndMeasurementsHidden: true; readonly modelPredictionsHidden: true; readonly splitHidden: true; readonly protectedMembershipHidden: true; readonly trainingEligibilityHidden: true };
  readonly outcomes: typeof MHS_V2_CALIBRATION_OUTCOMES; readonly duplicateLikeOutcomes: readonly ["DUPLICATE", "NEAR_DUPLICATE"];
  readonly evidenceRules: { readonly completion: "ALL_300_VALID_RESOLVED_OUTCOMES_REQUIRED"; readonly support: readonly string[]; readonly failure: "ANY_RESOLVED_DUPLICATE_LIKE_PAIR_BELOW_0_85"; readonly aboveFloorDuplicateLikeFails: false; readonly inconclusive: readonly string[]; readonly automaticSuccessorThresholdAllowed: false };
  readonly exclusions: { readonly internalTestCandidateCount: 13; readonly internalTestContentAccessed: false; readonly frozen140ContentAccessed: false; readonly moderationLabelsUsedForSampling: false; readonly moderationLabelsUsedForReview: false };
  readonly limitations: readonly string[]; readonly preScoringProof: { readonly e5Executed: false; readonly embeddingsCreated: false; readonly v2ScoresCreated: false; readonly scoreDistributionInspected: false; readonly pairMembershipSelected: false; readonly reviewerCsvCreated: false; readonly humanReviewPerformed: false; readonly thresholdAuthorized: false; readonly candidateTextIncluded: false; readonly trainValidationAssigned: false; readonly trainingEligibilityChanged: false };
}
export interface MhsV2SemanticCalibrationPolicyArtifact extends MhsV2SemanticCalibrationPolicyPayload { readonly policyPayloadDigest: string }

const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
const expectedAuthorities = (): MhsV2SemanticCalibrationPolicyPayload["authorities"] => ({ ...MHS_V2_SEMANTIC_CALIBRATION_EXPECTED_HASHES,
  v2CandidatePayloadDigest: MHS_V2_EXPANSION_CANDIDATE_PAYLOAD_DIGEST, v2CandidateMembershipDigest: MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST,
  reviewUniversePayloadDigest: MHS_V2_REVIEW_UNIVERSE_PAYLOAD_DIGEST, operationalPlanPayloadDigest: MHS_V2_REVIEW_BATCH_PLAN_PAYLOAD_DIGEST,
  consolidationPayloadDigest: MHS_V2_EXPANSION_CONSOLIDATION_PAYLOAD_DIGEST, consolidationMembershipDigest: MHS_V2_EXPANSION_CONSOLIDATION_MEMBERSHIP_DIGEST,
  developmentProjectionPayloadDigest: MHS_DEVELOPMENT_PROJECTION_PAYLOAD_DIGEST, developmentProjectionManifestPayloadDigest: MHS_DEVELOPMENT_PROJECTION_MANIFEST_PAYLOAD_DIGEST });

export const createMhsV2SemanticCalibrationPolicy = (hashes: MhsV2SemanticCalibrationAuthorityHashes): MhsV2SemanticCalibrationPolicyArtifact => {
  if (canonicalJson(hashes) !== canonicalJson(MHS_V2_SEMANTIC_CALIBRATION_EXPECTED_HASHES)) throw new Error("A1R-P frozen authority hash mismatch");
  const payload: MhsV2SemanticCalibrationPolicyPayload = { schemaVersion: MHS_V2_SEMANTIC_CALIBRATION_POLICY_SCHEMA, policyVersion: MHS_V2_SEMANTIC_CALIBRATION_POLICY_VERSION,
    phase: "T6L-7K-A1R-P", status: "IMMUTABLE_PRE_SCORING_POLICY_AUTHORITY", authorities: expectedAuthorities(),
    e5: { repository: E5_SMALL_MODEL_REPOSITORY, revision: E5_SMALL_MODEL_REVISION, scoringPolicyVersion: E5_SELECTED_PREFIX_POLICY_VERSION, pooling: "ATTENTION_MASK_AWARE_MEAN", normalization: "L2", similarity: "COSINE", aggregation: "SYMMETRIC_BIDIRECTIONAL_MEAN", automaticEdgeAuthority: false },
    searchScopes: { A: { identity: "V2_TO_V2", candidateCount: 400, pairCount: 79800, pairIdentity: "SCOPE_A::<LEXICAL_MIN_V2_ID>::<LEXICAL_MAX_V2_ID>" }, B: { identity: "V2_TO_HISTORICAL_ORDINARY_DEVELOPMENT", v2CandidateCount: 400, historicalCandidateCount: 73, historicalTrainCount: 60, historicalValidationCount: 13, pairCount: 29200, pairIdentity: "SCOPE_B::<V2_ID>::<HISTORICAL_DEVELOPMENT_ID>" }, totalPairCount: 109000 },
    reviewDesign: { totalReviewPairs: 300, scopeAReviewPairs: 220, scopeBReviewPairs: 80, scoreSelectedPairs: 240, scoreAgnosticControlPairs: 60, scopeAControlPairs: 45, scopeBControlPairs: 15, regions: regionDefinitions, lowerScoreSelectedBoundary: 0.78 },
    sampling: { seed: MHS_V2_SEMANTIC_CALIBRATION_SEED, candidateReuseCap: MHS_V2_SEMANTIC_CALIBRATION_REUSE_CAP, runtimeRandomnessAllowed: false, controlSelection: "C1_FIRST_HASH_RANK_FULL_SCOPE_WITHOUT_SCORE", scoreSelection: "FIXED_SCOPE_REGION_ORDER_DESCENDING_SCORE_SEEDED_HASH_TIEBREAK", selectionOrder: ["SCOPE_A_C1", "SCOPE_B_C1", "SCOPE_A_R1_TO_R6", "SCOPE_B_R1_TO_R6"], controlsDisjointFromScoreSelected: true, reversedPairsProhibited: true, silentQuotaRedistributionAllowed: false },
    reviewerBlindness: { exactScoreHidden: true, regionHidden: true, controlStatusHidden: true, scopeHiddenExceptInherentIdentity: true, moderationDecisionHidden: true, moderationCategoryHidden: true, moderationReasonHidden: true, sourceLabelsAndMeasurementsHidden: true, modelPredictionsHidden: true, splitHidden: true, protectedMembershipHidden: true, trainingEligibilityHidden: true },
    outcomes: MHS_V2_CALIBRATION_OUTCOMES, duplicateLikeOutcomes: ["DUPLICATE", "NEAR_DUPLICATE"],
    evidenceRules: { completion: "ALL_300_VALID_RESOLVED_OUTCOMES_REQUIRED", support: ["ALL_300_RESOLVED", "INTEGRITY_AND_MEMBERSHIP_VALID", "NO_DUPLICATE_LIKE_BELOW_0_85", "NO_BELOW_FLOOR_C1_DUPLICATE_LIKE", "ALL_SCOPE_REGION_CONTROL_QUOTAS_EXACT", "NO_PROTECTED_OR_MODERATION_LABEL_INFLUENCE", "REVIEWER_BLINDNESS_PRESERVED"], failure: "ANY_RESOLVED_DUPLICATE_LIKE_PAIR_BELOW_0_85", aboveFloorDuplicateLikeFails: false, inconclusive: ["FEWER_THAN_300_UNIQUE_PAIRS", "SCOPE_OR_REGION_QUOTA_UNAVAILABLE", "REUSE_CAP_OR_DETERMINISM_UNSATISFIED", "MISSING_INVALID_OR_NEEDS_ADJUDICATION_REVIEW", "BLINDNESS_OR_IDENTITY_OR_INTEGRITY_FAILURE", "AUTHORITY_OR_E5_CONTRACT_CHANGE", "SAMPLING_PROTOCOL_DEVIATION", "PROTECTED_OR_MODERATION_LABEL_CONTAMINATION", "EVIDENCE_NOT_REPRODUCIBLE"], automaticSuccessorThresholdAllowed: false },
    exclusions: { internalTestCandidateCount: 13, internalTestContentAccessed: false, frozen140ContentAccessed: false, moderationLabelsUsedForSampling: false, moderationLabelsUsedForReview: false },
    limitations: ["Bounded deterministic calibration audit; not a random population sample.", "Supports only this V2 universe, the two authorized non-protected scopes, the 300-pair design, and the pinned E5 contract.", "Does not prove exhaustive global or universal semantic-equivalence recall.", "Does not apply to protected evaluation sets or future datasets.", "Similarity never creates an automatic duplicate classification or semantic edge."],
    preScoringProof: { e5Executed: false, embeddingsCreated: false, v2ScoresCreated: false, scoreDistributionInspected: false, pairMembershipSelected: false, reviewerCsvCreated: false, humanReviewPerformed: false, thresholdAuthorized: false, candidateTextIncluded: false, trainValidationAssigned: false, trainingEligibilityChanged: false } };
  const artifact = { ...payload, policyPayloadDigest: digest(payload) }; validateMhsV2SemanticCalibrationPolicy(artifact); return artifact;
};

export const validateMhsV2SemanticCalibrationPolicy = (artifact: MhsV2SemanticCalibrationPolicyArtifact): void => {
  const { policyPayloadDigest, ...payload } = artifact; const json = canonicalJson(payload);
  if (payload.schemaVersion !== MHS_V2_SEMANTIC_CALIBRATION_POLICY_SCHEMA || payload.policyVersion !== MHS_V2_SEMANTIC_CALIBRATION_POLICY_VERSION || payload.phase !== "T6L-7K-A1R-P" || payload.status !== "IMMUTABLE_PRE_SCORING_POLICY_AUTHORITY"
    || canonicalJson(payload.authorities) !== canonicalJson(expectedAuthorities()) || payload.searchScopes.A.pairCount !== 79800 || payload.searchScopes.B.pairCount !== 29200 || payload.searchScopes.totalPairCount !== 109000
    || payload.reviewDesign.totalReviewPairs !== 300 || payload.reviewDesign.scopeAReviewPairs !== 220 || payload.reviewDesign.scopeBReviewPairs !== 80 || payload.reviewDesign.scoreSelectedPairs !== 240 || payload.reviewDesign.scoreAgnosticControlPairs !== 60
    || MHS_V2_CALIBRATION_REGIONS.some((region) => payload.reviewDesign.regions[region].totalQuota !== 40) || payload.reviewDesign.lowerScoreSelectedBoundary !== 0.78 || payload.sampling.candidateReuseCap !== 8
    || Object.values(payload.reviewerBlindness).some((value) => value !== true) || payload.outcomes.join("|") !== MHS_V2_CALIBRATION_OUTCOMES.join("|")
    || Object.values(payload.preScoringProof).some(Boolean) || payload.exclusions.internalTestContentAccessed || payload.exclusions.frozen140ContentAccessed || payload.exclusions.moderationLabelsUsedForSampling || payload.exclusions.moderationLabelsUsedForReview
    || /"text"\s*:|candidateAText|candidateBText|observedScore|semanticScore/u.test(json) || policyPayloadDigest !== MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST || policyPayloadDigest !== digest(payload)) throw new Error("Invalid MHS V2 semantic calibration policy authority");
};

export interface MhsV2CalibrationEvidenceSummary { readonly selectedUniquePairs: number; readonly resolvedReviews: number; readonly needsAdjudication: number; readonly invalidOrMissingReviews: number; readonly integrityPassed: boolean; readonly quotasExact: boolean; readonly blindnessPreserved: boolean; readonly protocolReproduced: boolean; readonly protectedOrModerationInfluence: boolean; readonly belowFloorDuplicateLike: number; readonly belowFloorControlDuplicateLike: number }
export const evaluateMhsV2CalibrationEvidence = (evidence: MhsV2CalibrationEvidenceSummary): "SUPPORT_0_85_CANDIDATE_FLOOR" | "FAIL_0_85_REQUIRES_SEPARATE_SUCCESSOR_CALIBRATION" | "INCONCLUSIVE" => {
  if (evidence.selectedUniquePairs !== 300 || evidence.resolvedReviews !== 300 || evidence.needsAdjudication !== 0 || evidence.invalidOrMissingReviews !== 0 || !evidence.integrityPassed || !evidence.quotasExact || !evidence.blindnessPreserved || !evidence.protocolReproduced || evidence.protectedOrModerationInfluence) return "INCONCLUSIVE";
  if (evidence.belowFloorDuplicateLike > 0 || evidence.belowFloorControlDuplicateLike > 0) return "FAIL_0_85_REQUIRES_SEPARATE_SUCCESSOR_CALIBRATION";
  return "SUPPORT_0_85_CANDIDATE_FLOOR";
};

type AtomicPublisher = (temporaryPath: string, targetPath: string) => void;
export const publishMhsV2SemanticCalibrationPolicy = (artifact: MhsV2SemanticCalibrationPolicyArtifact, outputDirectory: string, publish: AtomicPublisher = fs.renameSync): string => {
  validateMhsV2SemanticCalibrationPolicy(artifact); fs.mkdirSync(outputDirectory, { recursive: true }); const target = path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_POLICY_FILENAME);
  if (fs.existsSync(target)) throw new Error("MHS V2 semantic calibration policy exists; overwrite refused"); const serialized = canonicalJson(artifact), temporary = `${target}.${process.pid}.partial`;
  try { fs.writeFileSync(temporary, serialized, { flag: "wx" }); publish(temporary, target); if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== serialized) throw new Error("Incomplete calibration policy publication"); return target; }
  catch (error) { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === serialized) fs.rmSync(target, { force: true }); throw error; }
  finally { fs.rmSync(temporary, { force: true }); }
};
