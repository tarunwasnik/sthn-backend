import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalJson } from "./manifest";
import { TEXT_DUPLICATE_NORMALIZATION_VERSION, textDuplicateFingerprint } from "./identity";
import { MHS_CANDIDATE_ARTIFACT_SHA256, MHS_CANDIDATE_PAYLOAD_DIGEST, MHS_AUDITED_CANDIDATE_COUNT } from "./mhsCandidateIntegrityAudit";
import { MHS_REVIEW_PARENT_ARTIFACT_SHA256, MhsCandidateAdmissionArtifact, validateMhsCandidateAdmissionArtifact } from "./mhsCandidateAdmission";
import { MHS_CANDIDATE_MEMBERSHIP_DIGEST } from "./mhsSemanticGroupingOverlay";
import { MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST, MHS_REVIEW_TRANCHE_SIZE, MhsReviewAllocation, MhsReviewTrancheRow, validateMhsReviewTrancheRow } from "./mhsReviewTranche";
import { MHS_PIPELINE_DATA_INVESTIGATION_SHA256 } from "./mhsTrainingPipelineDataInvestigation";
import { MHS_TRAIN_EXPANSION_ACQUISITION_SEED, MHS_TRAIN_EXPANSION_DESIGN_SHA256, readMhsTrainExpansionDesign } from "./mhsTrainExpansionDesign";
import { TEXT_MODERATION_ACQUISITION_MANIFEST_SHA256 } from "./mhsTrainingEligibilityReleasePlan";

export const MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SCHEMA = "STHN_TEXT_MODERATION_MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_V1" as const;
export const MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_VERSION = "MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_V1" as const;
export const MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_FILENAME = "mhs-train-expansion-tranche-proposal-v1.json" as const;
export const MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256 = "8ddb255ef622b955647d669cb55d34f1dfaac43ff04bf13de348ddf82908e724" as const;
export const MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_PAYLOAD_DIGEST = "bec3b757fca9312234ab77888c136afb70ed620c87afe24e1e88558fdf1196cc" as const;
export const MHS_PINNED_SOURCE_REVISION = "5468f6e118396646b02a2f691e771f6b6d9502ea" as const;
export const MHS_PINNED_SOURCE_ARTIFACT_SHA256 = "0d65ce8cfb857f5db90e74ce295067bba7473fe12115715f9dd18d2a5f87e976" as const;
export const MHS_PROVENANCE_STAGING_SHA256 = "99a97dd8060b02d18a8562aea3b3148e61722613c9ed1102018752aa3a9eadef" as const;
export const MHS_CANDIDATE_INTEGRITY_SHA256 = "6d6cb13ddfe6f832fcd9e25899310a62dd0bd1498be022d4f3675d6076188383" as const;

export const MHS_PROPOSAL_STRATA = [
  "DISAGREEMENT_SOURCE_INCONSISTENCY_SIGNAL",
  "VIOLENCE_GENOCIDE_SIGNAL",
  "PROTECTED_DEHUMANIZATION_HIGH_SCORE_SIGNAL",
  "LOW_SCORE_CONTEXT_COUNTERSPEECH_SIGNAL",
  "NON_HATE_ABUSE_NO_CLEAR_TARGET_SIGNAL",
] as const;
export type MhsProposalStratum = typeof MHS_PROPOSAL_STRATA[number];
export const MHS_PROPOSAL_REQUESTED_COUNTS: Readonly<Record<MhsProposalStratum, number>> = {
  DISAGREEMENT_SOURCE_INCONSISTENCY_SIGNAL: 60,
  VIOLENCE_GENOCIDE_SIGNAL: 120,
  PROTECTED_DEHUMANIZATION_HIGH_SCORE_SIGNAL: 80,
  LOW_SCORE_CONTEXT_COUNTERSPEECH_SIGNAL: 70,
  NON_HATE_ABUSE_NO_CLEAR_TARGET_SIGNAL: 70,
};
const allocationToStratum: Readonly<Record<MhsReviewAllocation, MhsProposalStratum>> = {
  DISAGREEMENT_OR_SOURCE_INCONSISTENCY: "DISAGREEMENT_SOURCE_INCONSISTENCY_SIGNAL",
  VIOLENCE_OR_GENOCIDE: "VIOLENCE_GENOCIDE_SIGNAL",
  PROTECTED_DEHUMANIZATION_OR_HIGH_SCORE: "PROTECTED_DEHUMANIZATION_HIGH_SCORE_SIGNAL",
  LOW_SCORE_CONTEXT_OR_COUNTERSPEECH: "LOW_SCORE_CONTEXT_COUNTERSPEECH_SIGNAL",
  NON_HATE_ABUSE_OR_NO_CLEAR_PROTECTED_TARGET: "NON_HATE_ABUSE_NO_CLEAR_TARGET_SIGNAL",
};

const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const digest = (...parts: readonly string[]): string => sha(JSON.stringify(parts));
const shaFile = (filename: string): string => sha(fs.readFileSync(filename));
const tally = (values: readonly string[]): Readonly<Record<string, number>> => Object.fromEntries([...new Set(values)].sort().map((key) => [key, values.filter((value) => value === key).length]));
const wordCount = (text: string): number => text.trim().split(/\s+/u).filter(Boolean).length;
const punctuationCount = (text: string): number => [...text].filter((value) => /\p{Punctuation}/u.test(value)).length;

interface CurrentIntegrityRow { readonly sourceRowId: string; readonly exactTextDigest: string; readonly normalizedFingerprint: string }
interface CurrentIntegrityArtifact { readonly rows: readonly CurrentIntegrityRow[] }
export interface MhsProposalMember {
  readonly proposalIndex: number;
  readonly sourceRowId: string;
  readonly selectionStratum: MhsProposalStratum;
  readonly parentAllocation: MhsReviewAllocation;
  readonly origin: "EXISTING_3000_ROW_TRANCHE_UNREVIEWED";
  readonly deterministicRank: string;
  readonly exactTextDigest: string;
  readonly normalizedTextFingerprint: string;
  readonly normalizationVersion: typeof TEXT_DUPLICATE_NORMALIZATION_VERSION;
  readonly piiSourceStatus: "REQUIRES_REVIEW";
  readonly sourceMeasurementsOnly: true;
  readonly sourceMeasurements: MhsReviewTrancheRow["sourceEvidenceSummary"] & { readonly membershipStrata: MhsReviewTrancheRow["membershipStrata"] };
  readonly structuralMetadata: { readonly characterCount: number; readonly wordCount: number; readonly punctuationCount: number };
  readonly finalSthnDecision: null;
  readonly finalSthnPrimaryCategory: null;
}
export interface MhsTrainExpansionTrancheProposalPayload {
  readonly schemaVersion: typeof MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SCHEMA;
  readonly proposalVersion: typeof MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_VERSION;
  readonly phase: "T6L-7I1";
  readonly authorities: Record<string, string>;
  readonly sourceAuthority: Record<string, unknown>;
  readonly sourceUniverse: Record<string, number>;
  readonly existingTrancheRelationship: Record<string, unknown>;
  readonly stratumDefinitions: Readonly<Record<MhsProposalStratum, Record<string, unknown>>>;
  readonly stratumPrecedence: typeof MHS_PROPOSAL_STRATA;
  readonly fullSourcePredicateInventory: Readonly<Record<MhsProposalStratum, Record<string, number>>>;
  readonly parentTrancheInventory: Readonly<Record<MhsProposalStratum, Record<string, number | boolean>>>;
  readonly deterministicSelection: Record<string, unknown>;
  readonly proposalMembers: readonly MhsProposalMember[];
  readonly selectedMembershipByStratum: Readonly<Record<MhsProposalStratum, readonly string[]>>;
  readonly exactNormalizedScreen: Record<string, unknown>;
  readonly piiSourceSideSummary: Record<string, unknown>;
  readonly contaminationStage: Record<string, unknown>;
  readonly diversitySummary: Record<string, unknown>;
  readonly v2CapacityAssessment: Record<string, unknown>;
  readonly reviewWorkload: Record<string, unknown>;
  readonly proposalCount: 400;
  readonly authorizationDecision: "AUTHORIZE_T6L_7I2_CANDIDATE_ACQUISITION";
  readonly boundaries: Record<string, boolean>;
  readonly generatedAt: string;
}
export type MhsTrainExpansionTrancheProposal = MhsTrainExpansionTrancheProposalPayload & { readonly proposalPayloadDigest: string };

const definitions: MhsTrainExpansionTrancheProposalPayload["stratumDefinitions"] = {
  DISAGREEMENT_SOURCE_INCONSISTENCY_SIGNAL: { sourceFields: ["hatespeech", "hate_speech_score", "dehumanize", "insult", "humiliate", "violence", "genocide", "attack_defend"], predicate: "disagreement.band === HIGH OR existing SOURCE_INCONSISTENCY predicate", targetCount: 60, finalLabelMeaning: "NONE_SOURCE_SELECTION_ONLY" },
  VIOLENCE_GENOCIDE_SIGNAL: { sourceFields: ["violence", "genocide"], predicate: "mean(violence) >= 1 OR mean(genocide) >= 1", targetCount: 120, finalLabelMeaning: "NONE_SOURCE_SELECTION_ONLY" },
  PROTECTED_DEHUMANIZATION_HIGH_SCORE_SIGNAL: { sourceFields: ["target_race", "target_religion", "target_origin", "target_gender", "target_sexuality", "target_disability", "dehumanize", "hate_speech_score"], predicate: "hasClearProtectedTarget AND (mean(dehumanize) >= 1 OR hate_speech_score > 0.5)", targetCount: 80, finalLabelMeaning: "NONE_SOURCE_SELECTION_ONLY" },
  LOW_SCORE_CONTEXT_COUNTERSPEECH_SIGNAL: { sourceFields: ["hate_speech_score", "hatespeech", "attack_defend", "text lexical context signal"], predicate: "hate_speech_score < -1 AND (existing CONTEXT_CANDIDATE predicate OR mean(attack_defend) < 2)", targetCount: 70, terminology: "COUNTERSPEECH_IS_A_CONTEXT_CANDIDATE_SIGNAL_NOT_A_SOURCE_LABEL", finalLabelMeaning: "NONE_SOURCE_SELECTION_ONLY" },
  NON_HATE_ABUSE_NO_CLEAR_TARGET_SIGNAL: { sourceFields: ["hate_speech_score", "hatespeech", "insult", "humiliate", "protected target rates"], predicate: "existing NON_HATE_ABUSE_CANDIDATE predicate OR no protected target family has >= 0.5 agreement", targetCount: 70, finalLabelMeaning: "NONE_SOURCE_SELECTION_ONLY" },
};
const fullSourcePredicateInventory: MhsTrainExpansionTrancheProposalPayload["fullSourcePredicateInventory"] = {
  DISAGREEMENT_SOURCE_INCONSISTENCY_SIGNAL: { rawMatching: 14665, exclusiveByPrecedence: 14665, removedAdmitted: 38, removedOtherLifecycle: 6, eligibleExclusive: 14621 },
  VIOLENCE_GENOCIDE_SIGNAL: { rawMatching: 15308, exclusiveByPrecedence: 7990, removedAdmitted: 16, removedOtherLifecycle: 4, eligibleExclusive: 7970 },
  PROTECTED_DEHUMANIZATION_HIGH_SCORE_SIGNAL: { rawMatching: 30514, exclusiveByPrecedence: 9363, removedAdmitted: 17, removedOtherLifecycle: 4, eligibleExclusive: 9342 },
  LOW_SCORE_CONTEXT_COUNTERSPEECH_SIGNAL: { rawMatching: 11024, exclusiveByPrecedence: 4647, removedAdmitted: 13, removedOtherLifecycle: 0, eligibleExclusive: 4634 },
  NON_HATE_ABUSE_NO_CLEAR_TARGET_SIGNAL: { rawMatching: 6150, exclusiveByPrecedence: 689, removedAdmitted: 2, removedOtherLifecycle: 0, eligibleExclusive: 687 },
};

export const buildMhsTrainExpansionTrancheProposal = (parent: readonly MhsReviewTrancheRow[], candidate: MhsCandidateAdmissionArtifact, integrity: CurrentIntegrityArtifact, generatedAt: string): MhsTrainExpansionTrancheProposal => {
  if (parent.length !== MHS_REVIEW_TRANCHE_SIZE || candidate.rows.length !== 100 || candidate.rows.filter((row) => row.candidateAdmitted).length !== MHS_AUDITED_CANDIDATE_COUNT || integrity.rows.length !== MHS_AUDITED_CANDIDATE_COUNT) throw new Error("Proposal source lifecycle authority mismatch");
  parent.forEach(validateMhsReviewTrancheRow); validateMhsCandidateAdmissionArtifact(candidate);
  const lifecycleIds = new Set(candidate.rows.map((row) => row.sourceRowId));
  const admittedIds = new Set(candidate.rows.filter((row) => row.candidateAdmitted).map((row) => row.sourceRowId));
  const currentExact = new Set(integrity.rows.map((row) => row.exactTextDigest));
  const currentNormalized = new Set(integrity.rows.map((row) => row.normalizedFingerprint));
  const selected: MhsProposalMember[] = [];
  const selectedExact = new Set(currentExact), selectedNormalized = new Set(currentNormalized);
  const parentInventory = {} as Record<MhsProposalStratum, Record<string, number | boolean>>;
  for (const stratum of MHS_PROPOSAL_STRATA) {
    const allocations = (Object.entries(allocationToStratum) as [MhsReviewAllocation, MhsProposalStratum][]).filter(([, value]) => value === stratum).map(([key]) => key);
    const raw = parent.filter((row) => allocations.includes(row.allocation));
    const remaining = raw.filter((row) => !lifecycleIds.has(row.sourceRowId));
    let exactOverlapCurrent = 0, normalizedOverlapCurrent = 0;
    const eligible = remaining.filter((row) => {
      if (currentExact.has(row.textDigest)) { exactOverlapCurrent++; return false; }
      if (currentNormalized.has(textDuplicateFingerprint(row.text))) { normalizedOverlapCurrent++; return false; }
      return true;
    });
    const ranked = [...eligible].sort((left, right) => left.sourceRowId.localeCompare(right.sourceRowId)).map((row) => ({ row, rank: digest(MHS_TRAIN_EXPANSION_ACQUISITION_SEED, MHS_PINNED_SOURCE_REVISION, row.sourceRowId) }))
      .sort((left, right) => left.rank.localeCompare(right.rank) || left.row.sourceRowId.localeCompare(right.row.sourceRowId));
    const picked: MhsProposalMember[] = [];
    for (const { row, rank } of ranked) {
      const normalized = textDuplicateFingerprint(row.text);
      if (selectedExact.has(row.textDigest) || selectedNormalized.has(normalized)) continue;
      picked.push({ proposalIndex: 0, sourceRowId: row.sourceRowId, selectionStratum: stratum, parentAllocation: row.allocation, origin: "EXISTING_3000_ROW_TRANCHE_UNREVIEWED", deterministicRank: rank, exactTextDigest: row.textDigest, normalizedTextFingerprint: normalized, normalizationVersion: TEXT_DUPLICATE_NORMALIZATION_VERSION, piiSourceStatus: "REQUIRES_REVIEW", sourceMeasurementsOnly: true, sourceMeasurements: { ...row.sourceEvidenceSummary, membershipStrata: row.membershipStrata }, structuralMetadata: { characterCount: row.text.length, wordCount: wordCount(row.text), punctuationCount: punctuationCount(row.text) }, finalSthnDecision: null, finalSthnPrimaryCategory: null });
      selectedExact.add(row.textDigest); selectedNormalized.add(normalized);
      if (picked.length === MHS_PROPOSAL_REQUESTED_COUNTS[stratum]) break;
    }
    if (picked.length !== MHS_PROPOSAL_REQUESTED_COUNTS[stratum]) throw new Error(`Proposal stratum underflow: ${stratum}`);
    selected.push(...picked);
    parentInventory[stratum] = { rawParentAllocation: raw.length, removedAdmitted: raw.filter((row) => admittedIds.has(row.sourceRowId)).length, removedOtherLifecycle: raw.filter((row) => lifecycleIds.has(row.sourceRowId) && !admittedIds.has(row.sourceRowId)).length, exactTextOverlapCurrent: exactOverlapCurrent, normalizedTextOverlapCurrent: normalizedOverlapCurrent, eligibleAfterLifecycleAndCurrentDuplicateScreen: eligible.length, requested: MHS_PROPOSAL_REQUESTED_COUNTS[stratum], feasible: eligible.length >= MHS_PROPOSAL_REQUESTED_COUNTS[stratum], selected: picked.length };
  }
  const members = selected.map((row, index) => ({ ...row, proposalIndex: index + 1 }));
  if (members.length !== 400 || new Set(members.map((row) => row.sourceRowId)).size !== 400 || members.some((row) => lifecycleIds.has(row.sourceRowId))) throw new Error("Proposal membership overlap or count mismatch");
  const selectedMembershipByStratum = Object.fromEntries(MHS_PROPOSAL_STRATA.map((stratum) => [stratum, members.filter((row) => row.selectionStratum === stratum).map((row) => row.sourceRowId)])) as unknown as MhsTrainExpansionTrancheProposalPayload["selectedMembershipByStratum"];
  const lengths = members.map((row) => row.structuralMetadata.wordCount), characters = members.map((row) => row.structuralMetadata.characterCount);
  const payload: MhsTrainExpansionTrancheProposalPayload = {
    schemaVersion: MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SCHEMA, proposalVersion: MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_VERSION, phase: "T6L-7I1",
    authorities: { expansionDesignSha256: MHS_TRAIN_EXPANSION_DESIGN_SHA256, t6l7hInvestigationSha256: MHS_PIPELINE_DATA_INVESTIGATION_SHA256, acquisitionManifestSha256: TEXT_MODERATION_ACQUISITION_MANIFEST_SHA256, sourceArtifactSha256: MHS_PINNED_SOURCE_ARTIFACT_SHA256, provenanceStagingSha256: MHS_PROVENANCE_STAGING_SHA256, existingTrancheSha256: MHS_REVIEW_PARENT_ARTIFACT_SHA256, existingTrancheMembershipDigest: MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST, currentCandidateSha256: MHS_CANDIDATE_ARTIFACT_SHA256, currentCandidatePayloadDigest: MHS_CANDIDATE_PAYLOAD_DIGEST, currentCandidateMembershipDigest: MHS_CANDIDATE_MEMBERSHIP_DIGEST, currentCandidateIntegritySha256: MHS_CANDIDATE_INTEGRITY_SHA256 },
    sourceAuthority: { sourceId: "MEASURING_HATE_SPEECH", artifactPath: "dataset-research/text-moderation/MEASURING_HATE_SPEECH/train-00000-of-00001.parquet", sourceRevision: MHS_PINNED_SOURCE_REVISION, annotationRows: 135556, groupedSourceRows: 39565, stableSourceIdentity: "sourceRowId(MEASURING_HATE_SPEECH, pinnedRevision, comment_id)", license: "CC_BY_4_0", sourceMeasurementsAreFinalSthnLabels: false },
    sourceUniverse: { totalSourceIdentities: 39565, currentAdmittedIdentities: 86, outsideCurrentAdmittedIdentities: 39479, otherCurrentLifecycleIdentities: 14, proposalEligibleAfterLifecycleExclusions: 39465, unmatchedByFivePredicates: 2211 },
    existingTrancheRelationship: { parentCount: 3000, processedPilotCount: 100, unreviewedCount: 2900, outsideExistingTrancheCount: 36565, policy: "REUSE_EXISTING_UNREVIEWED_TRANCHE_FIRST", selectedFromExistingTranche: 400, selectedFromOutsideTranche: 0, parentAllocationPreservedAsPrimaryProposalStratum: true },
    stratumDefinitions: definitions, stratumPrecedence: MHS_PROPOSAL_STRATA, fullSourcePredicateInventory, parentTrancheInventory: parentInventory,
    deterministicSelection: { seed: MHS_TRAIN_EXPANSION_ACQUISITION_SEED, ambientRandomnessUsed: false, canonicalIdentityOrder: "SOURCE_ROW_ID_ASCENDING_BEFORE_RANKING", rankFormula: "sha256(JSON.stringify([seed, sourceRevision, sourceRowId]))", rankSort: "ASCENDING_RANK_THEN_SOURCE_ROW_ID", overlapRouting: "FROZEN_PARENT_PRIMARY_ALLOCATION", exactAndNormalizedDuplicatesSkipped: true, membershipDigest: digest(...members.map((row) => `${row.selectionStratum}:${row.sourceRowId}:${row.deterministicRank}`)) },
    proposalMembers: members, selectedMembershipByStratum,
    exactNormalizedScreen: { normalizationVersion: TEXT_DUPLICATE_NORMALIZATION_VERSION, currentAdmittedCompared: 86, exactTextOverlapsWithCurrent: 0, normalizedTextOverlapsWithCurrent: 0, selectedExactDuplicateCollisions: 0, selectedNormalizedDuplicateCollisions: 0, exactDuplicateSourceIdentityCount: 0, semanticInferencePerformed: false },
    piiSourceSideSummary: { NONE: 0, REDACTED: 0, REQUIRES_REVIEW: 400, EXCLUDE: 0, disposition: "QUARANTINE_PENDING_T6L_7I2_PII_INTEGRITY_SCREEN", manualRedactionPerformed: false },
    contaminationStage: { status: "REQUIRED_IN_T6L_7I2_OR_7I4", reason: "Existing protected detector accepts candidate-stage inputs; proposal-stage direct protected-text access is unauthorized.", internalTestTextAccessed: false, frozen140TextAccessed: false, protectedAuthorityMutation: false },
    diversitySummary: { origin: { EXISTING_3000_ROW_TRANCHE_UNREVIEWED: 400, OUTSIDE_EXISTING_TRANCHE: 0 }, wordLength: { minimum: Math.min(...lengths), maximum: Math.max(...lengths), shortLe5: lengths.filter((value) => value <= 5).length, longGte40: lengths.filter((value) => value >= 40).length }, characterLength: { minimum: Math.min(...characters), maximum: Math.max(...characters) }, scoreBands: tally(members.map((row) => row.sourceMeasurements.membershipStrata.includes("HIGH_SCORE") ? "HIGH_SCORE" : row.sourceMeasurements.membershipStrata.includes("LOW_SCORE") ? "LOW_SCORE" : "MIDDLE_SCORE")), disagreementBands: tally(members.map((row) => row.sourceMeasurements.disagreement.band)), protectedFamilySignals: tally(members.flatMap((row) => row.sourceMeasurements.target.protectedFamilies.length ? row.sourceMeasurements.target.protectedFamilies : ["NO_CLEAR_PROTECTED_TARGET"])), membershipStrata: tally(members.flatMap((row) => row.sourceMeasurements.membershipStrata)), fullTextEmbedded: false, artificialTextTransformations: 0 },
    v2CapacityAssessment: { status: "PLAUSIBLE_CAPACITY_NOT_LABEL_GUARANTEE", targetNewAllow: 70, targetNewBlock: 70, threatOrViolenceFutureFloor: 15, evidence: { mappingAudit: { reviewed: 300, ALLOW: 106, BLOCK: 172, NEEDS_ADJUDICATION: 21, categorySignalsAfterHumanReview: { ABUSIVE_OR_HARASSING: 54, HATE: 68, PROFANITY: 2, SEXUAL: 29, THREAT_OR_VIOLENCE: 25 }, violenceStratumThreatFindings: { threat: 25, sampled: 145 } }, pilot: { reviewed: 100, admittedAllow: 58, admittedBlock: 28, unresolvedOrPiiBlocked: 14, admittedCategories: { ABUSIVE_OR_HARASSING: 9, HATE: 5, PROFANITY: 4, SEXUAL: 9, THREAT_OR_VIOLENCE: 1 } } }, caveats: ["Source strata do not guarantee ALLOW/BLOCK or category outcomes.", "MHS exposes no native profanity or final STHN sexual-category measurement.", "Reviewer A outcomes and all admission gates remain authoritative."], authorizeCandidateAcquisition: true },
    reviewWorkload: { proposalRows: 400, reviewerAMaximumFutureDecisions: 400, reviewPacketCreated: false, humanReviewPerformed: false, reviewPhase: "T6L-7I3_AFTER_T6L-7I2" },
    proposalCount: 400, authorizationDecision: "AUTHORIZE_T6L_7I2_CANDIDATE_ACQUISITION",
    boundaries: { acquisitionPerformed: false, candidatesCreated: false, humanReviewPacketCreated: false, humanReviewPerformed: false, finalLabelsAssigned: false, currentTrainMutated: false, validationMutated: false, internalTestMutated: false, internalTestAccessed: false, frozen140Mutated: false, frozen140Accessed: false, semanticInferencePerformed: false, semanticThresholdsChanged: false, trainingPerformed: false, run3Designed: false, otherSourceOnboardingPerformed: false, productionIntegrationPerformed: false },
    generatedAt,
  };
  return { ...payload, proposalPayloadDigest: sha(canonicalJson(payload)) };
};

export const validateMhsTrainExpansionTrancheProposal = (artifact: MhsTrainExpansionTrancheProposal): void => {
  const { proposalPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SCHEMA || artifact.proposalVersion !== MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_VERSION || artifact.phase !== "T6L-7I1" || artifact.authorities.expansionDesignSha256 !== MHS_TRAIN_EXPANSION_DESIGN_SHA256 || artifact.authorities.acquisitionManifestSha256 !== TEXT_MODERATION_ACQUISITION_MANIFEST_SHA256 || artifact.authorities.sourceArtifactSha256 !== MHS_PINNED_SOURCE_ARTIFACT_SHA256 || artifact.sourceAuthority.sourceRevision !== MHS_PINNED_SOURCE_REVISION) throw new Error("Proposal authority mismatch");
  if (artifact.sourceUniverse.totalSourceIdentities !== 39565 || artifact.sourceUniverse.currentAdmittedIdentities !== 86 || artifact.sourceUniverse.outsideCurrentAdmittedIdentities !== 39479 || artifact.sourceUniverse.proposalEligibleAfterLifecycleExclusions !== 39465 || artifact.proposalCount !== 400 || artifact.proposalMembers.length !== 400) throw new Error("Proposal universe/count mismatch");
  if (JSON.stringify(artifact.stratumPrecedence) !== JSON.stringify(MHS_PROPOSAL_STRATA) || MHS_PROPOSAL_STRATA.some((stratum) => artifact.selectedMembershipByStratum[stratum].length !== MHS_PROPOSAL_REQUESTED_COUNTS[stratum] || artifact.parentTrancheInventory[stratum].feasible !== true)) throw new Error("Proposal stratum mismatch");
  if (new Set(artifact.proposalMembers.map((row) => row.sourceRowId)).size !== 400 || artifact.proposalMembers.some((row) => !row.sourceMeasurementsOnly || row.finalSthnDecision !== null || row.finalSthnPrimaryCategory !== null || row.piiSourceStatus !== "REQUIRES_REVIEW")) throw new Error("Proposal membership/label boundary mismatch");
  if (artifact.exactNormalizedScreen.exactTextOverlapsWithCurrent !== 0 || artifact.exactNormalizedScreen.normalizedTextOverlapsWithCurrent !== 0 || artifact.contaminationStage.status !== "REQUIRED_IN_T6L_7I2_OR_7I4" || artifact.v2CapacityAssessment.status !== "PLAUSIBLE_CAPACITY_NOT_LABEL_GUARANTEE" || artifact.authorizationDecision !== "AUTHORIZE_T6L_7I2_CANDIDATE_ACQUISITION") throw new Error("Proposal integrity/capacity mismatch");
  if (Object.values(artifact.boundaries).some(Boolean) || proposalPayloadDigest !== sha(canonicalJson(payload)) || !/^[0-9a-f]{64}$/u.test(proposalPayloadDigest) || new Date(artifact.generatedAt).toISOString() !== artifact.generatedAt) throw new Error("Proposal canonical/boundary mismatch");
};

export interface ProposalPaths { readonly design: string; readonly acquisitionManifest: string; readonly sourceArtifact: string; readonly staging: string; readonly parentTranche: string; readonly candidate: string; readonly candidateIntegrity: string }
export const verifyMhsTrainExpansionProposalAuthorities = (paths: ProposalPaths): { readonly parent: readonly MhsReviewTrancheRow[]; readonly candidate: MhsCandidateAdmissionArtifact; readonly integrity: CurrentIntegrityArtifact } => {
  const checks: readonly [string, string][] = [[paths.design, MHS_TRAIN_EXPANSION_DESIGN_SHA256], [paths.acquisitionManifest, TEXT_MODERATION_ACQUISITION_MANIFEST_SHA256], [paths.sourceArtifact, MHS_PINNED_SOURCE_ARTIFACT_SHA256], [paths.staging, MHS_PROVENANCE_STAGING_SHA256], [paths.parentTranche, MHS_REVIEW_PARENT_ARTIFACT_SHA256], [paths.candidate, MHS_CANDIDATE_ARTIFACT_SHA256], [paths.candidateIntegrity, MHS_CANDIDATE_INTEGRITY_SHA256]];
  checks.forEach(([filename, expected]) => { if (shaFile(filename) !== expected) throw new Error(`Proposal authority SHA mismatch: ${path.basename(filename)}`); });
  const design = readMhsTrainExpansionDesign(paths.design, false); if (design.authorizationDecision !== "AUTHORIZE_TRAIN_DATA_EXPANSION_ACQUISITION") throw new Error("Expansion design did not authorize proposal");
  const parent = fs.readFileSync(paths.parentTranche, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as MhsReviewTrancheRow);
  const candidate = JSON.parse(fs.readFileSync(paths.candidate, "utf8")) as MhsCandidateAdmissionArtifact;
  const integrity = JSON.parse(fs.readFileSync(paths.candidateIntegrity, "utf8")) as CurrentIntegrityArtifact;
  return { parent, candidate, integrity };
};

export const readMhsTrainExpansionTrancheProposal = (filename: string): MhsTrainExpansionTrancheProposal => {
  const bytes = fs.readFileSync(filename); if (sha(bytes) !== MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256) throw new Error("Proposal artifact SHA-256 mismatch");
  const artifact = JSON.parse(bytes.toString("utf8")) as MhsTrainExpansionTrancheProposal; validateMhsTrainExpansionTrancheProposal(artifact); return artifact;
};
export const publishMhsTrainExpansionTrancheProposal = (bytes: Buffer, target: string, publish: (temporary: string, target: string) => void = fs.renameSync): void => {
  if (fs.existsSync(target)) throw new Error("Proposal artifact exists; overwrite refused"); fs.mkdirSync(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}-${Date.now()}.partial`;
  try { fs.writeFileSync(temporary, bytes, { flag: "wx" }); publish(temporary, target); if (!fs.existsSync(target)) throw new Error("Proposal publication incomplete"); }
  catch (error) { fs.rmSync(target, { force: true }); throw error; } finally { fs.rmSync(temporary, { force: true }); }
};
export const serializeMhsTrainExpansionTrancheProposal = (artifact: MhsTrainExpansionTrancheProposal): Buffer => Buffer.from(canonicalJson(artifact), "utf8");
