import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PiiStatus, ProvenanceStagingRow } from "./contracts";
import { TEXT_DUPLICATE_NORMALIZATION_VERSION, textDuplicateFingerprint } from "./identity";
import { canonicalJson } from "./manifest";
import { MHS_REVIEW_PARENT_ARTIFACT_SHA256 } from "./mhsCandidateAdmission";
import { MHS_CANDIDATE_ARTIFACT_SHA256 } from "./mhsCandidateIntegrityAudit";
import { MHS_SPLIT_MANIFEST_SHA256 } from "./mhsInternalTestFreeze";
import { MhsReviewTrancheRow, validateMhsReviewTrancheRow } from "./mhsReviewTranche";
import {
  MHS_PINNED_SOURCE_ARTIFACT_SHA256, MHS_PINNED_SOURCE_REVISION, MHS_PROVENANCE_STAGING_SHA256,
  MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_PAYLOAD_DIGEST, MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256,
  MhsProposalMember, MhsTrainExpansionTrancheProposal, readMhsTrainExpansionTrancheProposal,
} from "./mhsTrainExpansionTrancheProposal";
import { MHS_TRAIN_EXPANSION_DESIGN_SHA256 } from "./mhsTrainExpansionDesign";
import { MHS_INTERNAL_TEST_FREEZE_SHA256, TEXT_MODERATION_ACQUISITION_MANIFEST_SHA256 } from "./mhsTrainingEligibilityReleasePlan";
import { MeasuringHateSpeechRecord } from "./validators";
import { stageMeasuringHateSpeech } from "./staging";

export const MHS_V2_EXPANSION_CANDIDATE_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_EXPANSION_CANDIDATE_V1" as const;
export const MHS_V2_EXPANSION_CANDIDATE_VERSION = "MHS_V2_EXPANSION_CANDIDATE_V1" as const;
export const MHS_V2_EXPANSION_CANDIDATE_FILENAME = "mhs-v2-expansion-candidates-v1.json" as const;
export const MHS_V2_EXPANSION_ACQUISITION_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_EXPANSION_CANDIDATE_ACQUISITION_V1" as const;
export const MHS_V2_EXPANSION_ACQUISITION_VERSION = "MHS_V2_EXPANSION_CANDIDATE_ACQUISITION_V1" as const;
export const MHS_V2_EXPANSION_ACQUISITION_FILENAME = "mhs-v2-expansion-candidate-acquisition-v1.json" as const;
export const MHS_V2_EXPANSION_CANDIDATE_SHA256 = "972dd6b681fe953e10cc66eeb5dd15091bed86b60df19171a46cf31d45a463d0" as const;
export const MHS_V2_EXPANSION_CANDIDATE_PAYLOAD_DIGEST = "1b507a77f64938b56018e506bb5ee9ea66b2b2c6f38e8b0611cf0520b564a21e" as const;
export const MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST = "80ee1fc913ee7be77f3326c12a58e3096635f940319954a3390ff3e006128d9a" as const;
export const MHS_V2_EXPANSION_ACQUISITION_SHA256 = "81f7252ad5ab22816bed6258bc5eff46dc30c5fbbfc3f0d93b4ce6327e94db44" as const;
export const MHS_V2_EXPANSION_ACQUISITION_PAYLOAD_DIGEST = "76a80aeccb459d5f6962c2a680c175d2c4431ca672920bcda9b0f5a845ca8efe" as const;

const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const digest = (value: unknown): string => sha(canonicalJson(value));
const shaFile = (filename: string): string => sha(fs.readFileSync(filename));
const tally = (values: readonly string[]): Record<string, number> => Object.fromEntries([...new Set(values)].sort().map((key) => [key, values.filter((value) => value === key).length]));

export type MhsV2CandidateStatus = "ELIGIBLE_FOR_REVIEW" | "QUARANTINED" | "EXCLUDED";
interface CurrentIntegrityRow { readonly sourceRowId: string; readonly exactTextDigest: string; readonly normalizedFingerprint: string }
interface CurrentIntegrityArtifact { readonly rows: readonly CurrentIntegrityRow[] }
export interface MhsV2ExpansionCandidateRow {
  readonly candidateId: string;
  readonly sourceRowId: string;
  readonly proposalIndex: number;
  readonly selectionStratum: MhsProposalMember["selectionStratum"];
  readonly origin: MhsProposalMember["origin"];
  readonly sourceDataset: "MEASURING_HATE_SPEECH";
  readonly text: string;
  readonly exactTextDigest: string;
  readonly normalizedTextFingerprint: string;
  readonly normalizationVersion: typeof TEXT_DUPLICATE_NORMALIZATION_VERSION;
  readonly sourceIdentityRecomputed: true;
  readonly sourceRevision: typeof MHS_PINNED_SOURCE_REVISION;
  readonly proposalSha256: typeof MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256;
  readonly sourceMeasurementsOnly: true;
  readonly sourceMeasurements: MhsProposalMember["sourceMeasurements"];
  readonly language: string;
  readonly script: ProvenanceStagingRow["script"];
  readonly piiStatus: PiiStatus;
  readonly piiTypes: readonly [];
  readonly piiScreeningMethod: "NO_AUTHORIZED_AUTOMATIC_DETECTOR_AVAILABLE";
  readonly candidateStatus: MhsV2CandidateStatus;
  readonly quarantineReasons: readonly string[];
  readonly lineageRootId: string;
  readonly transformationHistory: readonly [];
  readonly humanReviewState: "UNREVIEWED";
  readonly finalSthnDecision: null;
  readonly finalSthnPrimaryCategory: null;
  readonly trainingEligible: false;
}
export interface MhsV2ExpansionCandidatePayload {
  readonly schemaVersion: typeof MHS_V2_EXPANSION_CANDIDATE_SCHEMA;
  readonly candidateVersion: typeof MHS_V2_EXPANSION_CANDIDATE_VERSION;
  readonly phase: "T6L-7I2";
  readonly proposalSha256: typeof MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256;
  readonly proposalPayloadDigest: typeof MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_PAYLOAD_DIGEST;
  readonly sourceArtifactSha256: typeof MHS_PINNED_SOURCE_ARTIFACT_SHA256;
  readonly candidateCount: 400;
  readonly membershipDigest: string;
  readonly rows: readonly MhsV2ExpansionCandidateRow[];
  readonly createdAt: string;
}
export type MhsV2ExpansionCandidateArtifact = MhsV2ExpansionCandidatePayload & { readonly candidatePayloadDigest: string };

export interface MhsV2ExpansionAcquisitionPayload {
  readonly schemaVersion: typeof MHS_V2_EXPANSION_ACQUISITION_SCHEMA;
  readonly acquisitionVersion: typeof MHS_V2_EXPANSION_ACQUISITION_VERSION;
  readonly phase: "T6L-7I2";
  readonly status: "ACQUIRED_WITH_QUARANTINE";
  readonly authorities: Readonly<Record<string, string>>;
  readonly sourceResolution: Readonly<Record<string, number | string | boolean>>;
  readonly identityIntegrity: Readonly<Record<string, number | string | boolean>>;
  readonly textIntegrity: Readonly<Record<string, number | string | boolean>>;
  readonly duplicateAudit: Readonly<Record<string, number | string | boolean>>;
  readonly piiAudit: Readonly<Record<string, number | string | boolean>>;
  readonly statusCounts: { readonly eligibleForReview: number; readonly quarantined: number; readonly excluded: number; readonly total: 400 };
  readonly statusByStratum: Readonly<Record<string, Readonly<Record<MhsV2CandidateStatus, number>>>>;
  readonly reviewCapacity: Readonly<Record<string, number | string | boolean>>;
  readonly acquisitionDecision: "DO_NOT_AUTHORIZE_T6L_7I3_REVIEWER_A_REVIEW";
  readonly blocker: string;
  readonly exactNextPhase: "T6L-7I2A_PII_SCREENING_AND_DISPOSITION";
  readonly boundaries: Readonly<Record<string, boolean>>;
  readonly candidateArtifactSha256: string;
  readonly candidatePayloadDigest: string;
  readonly candidateMembershipDigest: string;
  readonly createdAt: string;
}
export type MhsV2ExpansionAcquisitionArtifact = MhsV2ExpansionAcquisitionPayload & { readonly acquisitionPayloadDigest: string };

const membershipDigest = (rows: readonly MhsV2ExpansionCandidateRow[]): string => digest(rows.map((row) => [row.candidateId, row.exactTextDigest, row.candidateStatus]));

export const recomputeMhsSourceRows = (annotations: readonly MeasuringHateSpeechRecord[], retrievedAt: string): readonly ProvenanceStagingRow[] =>
  stageMeasuringHateSpeech(annotations, retrievedAt).rows;

export const buildMhsV2ExpansionCandidateAcquisition = (proposal: MhsTrainExpansionTrancheProposal, parent: readonly MhsReviewTrancheRow[], sourceRows: readonly ProvenanceStagingRow[], currentIntegrity: CurrentIntegrityArtifact, createdAt: string): { candidate: MhsV2ExpansionCandidateArtifact; acquisition: MhsV2ExpansionAcquisitionArtifact } => {
  if (proposal.proposalMembers.length !== 400 || parent.length !== 3000 || sourceRows.length !== 39565 || currentIntegrity.rows.length !== 86) throw new Error("T6L-7I2 source authority count mismatch");
  parent.forEach(validateMhsReviewTrancheRow);
  const parentById = new Map(parent.map((row) => [row.sourceRowId, row]));
  const sourceById = new Map(sourceRows.map((row) => [row.sourceRowId, row]));
  const currentExact = new Set(currentIntegrity.rows.map((row) => row.exactTextDigest));
  const currentNormalized = new Set(currentIntegrity.rows.map((row) => row.normalizedFingerprint));
  const seenExact = new Set<string>(), seenNormalized = new Set<string>();
  let withinExact = 0, withinNormalized = 0, currentExactMatches = 0, currentNormalizedMatches = 0;
  const rows = proposal.proposalMembers.map((member): MhsV2ExpansionCandidateRow => {
    const parentRow = parentById.get(member.sourceRowId), source = sourceById.get(member.sourceRowId);
    if (!parentRow || !source) throw new Error(`Unresolved proposal source identity: ${member.sourceRowId}`);
    const exactTextDigest = sha(source.text), normalizedTextFingerprint = textDuplicateFingerprint(source.text);
    if (source.text !== parentRow.text || exactTextDigest !== parentRow.textDigest || exactTextDigest !== member.exactTextDigest || normalizedTextFingerprint !== member.normalizedTextFingerprint) throw new Error(`Source text or measurement authority mismatch: ${member.sourceRowId}`);
    if (source.sourceDataset !== "MEASURING_HATE_SPEECH" || source.transformationHistory.length !== 0) throw new Error(`Source lineage mismatch: ${member.sourceRowId}`);
    if (canonicalJson({ ...parentRow.sourceEvidenceSummary, membershipStrata: parentRow.membershipStrata }) !== canonicalJson(member.sourceMeasurements)) throw new Error(`Source measurement mismatch: ${member.sourceRowId}`);
    if (seenExact.has(exactTextDigest)) withinExact++; if (seenNormalized.has(normalizedTextFingerprint)) withinNormalized++;
    if (currentExact.has(exactTextDigest)) currentExactMatches++; if (currentNormalized.has(normalizedTextFingerprint)) currentNormalizedMatches++;
    seenExact.add(exactTextDigest); seenNormalized.add(normalizedTextFingerprint);
    return { candidateId: member.sourceRowId, sourceRowId: member.sourceRowId, proposalIndex: member.proposalIndex, selectionStratum: member.selectionStratum, origin: member.origin, sourceDataset: "MEASURING_HATE_SPEECH", text: source.text, exactTextDigest, normalizedTextFingerprint, normalizationVersion: TEXT_DUPLICATE_NORMALIZATION_VERSION, sourceIdentityRecomputed: true, sourceRevision: MHS_PINNED_SOURCE_REVISION, proposalSha256: MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256, sourceMeasurementsOnly: true, sourceMeasurements: member.sourceMeasurements, language: source.language, script: source.script, piiStatus: "REQUIRES_REVIEW", piiTypes: [], piiScreeningMethod: "NO_AUTHORIZED_AUTOMATIC_DETECTOR_AVAILABLE", candidateStatus: "QUARANTINED", quarantineReasons: ["PII_STATUS_REQUIRES_REVIEW"], lineageRootId: member.sourceRowId, transformationHistory: [], humanReviewState: "UNREVIEWED", finalSthnDecision: null, finalSthnPrimaryCategory: null, trainingEligible: false };
  });
  const memberDigest = membershipDigest(rows);
  const candidatePayload: MhsV2ExpansionCandidatePayload = { schemaVersion: MHS_V2_EXPANSION_CANDIDATE_SCHEMA, candidateVersion: MHS_V2_EXPANSION_CANDIDATE_VERSION, phase: "T6L-7I2", proposalSha256: MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256, proposalPayloadDigest: MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_PAYLOAD_DIGEST, sourceArtifactSha256: MHS_PINNED_SOURCE_ARTIFACT_SHA256, candidateCount: 400, membershipDigest: memberDigest, rows, createdAt };
  const candidate: MhsV2ExpansionCandidateArtifact = { ...candidatePayload, candidatePayloadDigest: digest(candidatePayload) };
  const candidateSerialized = canonicalJson(candidate), candidateSha256 = sha(candidateSerialized);
  const byStratum = Object.fromEntries([...new Set(rows.map((row) => row.selectionStratum))].sort().map((stratum) => [stratum, { ELIGIBLE_FOR_REVIEW: rows.filter((row) => row.selectionStratum === stratum && row.candidateStatus === "ELIGIBLE_FOR_REVIEW").length, QUARANTINED: rows.filter((row) => row.selectionStratum === stratum && row.candidateStatus === "QUARANTINED").length, EXCLUDED: rows.filter((row) => row.selectionStratum === stratum && row.candidateStatus === "EXCLUDED").length }]));
  const acquisitionPayload: MhsV2ExpansionAcquisitionPayload = { schemaVersion: MHS_V2_EXPANSION_ACQUISITION_SCHEMA, acquisitionVersion: MHS_V2_EXPANSION_ACQUISITION_VERSION, phase: "T6L-7I2", status: "ACQUIRED_WITH_QUARANTINE", authorities: { expansionDesignSha256: MHS_TRAIN_EXPANSION_DESIGN_SHA256, proposalSha256: MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256, proposalPayloadDigest: MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_PAYLOAD_DIGEST, acquisitionManifestSha256: TEXT_MODERATION_ACQUISITION_MANIFEST_SHA256, pinnedSourceArtifactSha256: MHS_PINNED_SOURCE_ARTIFACT_SHA256, pinnedSourceRevision: MHS_PINNED_SOURCE_REVISION, provenanceStagingSha256: MHS_PROVENANCE_STAGING_SHA256, parentTrancheSha256: MHS_REVIEW_PARENT_ARTIFACT_SHA256, currentV1CandidateSha256: MHS_CANDIDATE_ARTIFACT_SHA256, currentCandidateIntegritySha256: "6d6cb13ddfe6f832fcd9e25899310a62dd0bd1498be022d4f3675d6076188383", currentSplitManifestSha256: MHS_SPLIT_MANIFEST_SHA256, currentInternalTestFreezeSha256: MHS_INTERNAL_TEST_FREEZE_SHA256 }, sourceResolution: { requested: 400, resolved: rows.length, missing: 0, exactSourceTextRecovered: true, proposalOrderPreserved: true }, identityIntegrity: { canonicalCandidateIdentity: "candidateId equals stable sourceRowId", recomputedSourceIdentities: 400, identityMismatches: 0, uniqueCandidateIds: new Set(rows.map((row) => row.candidateId)).size }, textIntegrity: { exactUtf8DigestAlgorithm: "SHA-256", exactTextMatchesSource: 400, textMutations: 0, transformations: 0, sourceMeasurementMismatches: 0, sourceMeasurementsAreFinalSthnLabels: false }, duplicateAudit: { normalizationVersion: TEXT_DUPLICATE_NORMALIZATION_VERSION, withinCandidateExactMatches: withinExact, withinCandidateNormalizedMatches: withinNormalized, currentLifecycleRowsCompared: currentIntegrity.rows.length, currentLifecycleExactMatches: currentExactMatches, currentLifecycleNormalizedMatches: currentNormalizedMatches, protectedContentAccessed: false, semanticSimilarityExecuted: false }, piiAudit: { taxonomy: "NONE|REDACTED|REQUIRES_REVIEW|EXCLUDE", automaticDetectorAvailable: false, automaticallyResolved: 0, unresolvedRequiresReview: 400, redactionsApplied: 0, exclusionsApplied: 0, unknownOrBlankStates: 0 }, statusCounts: { eligibleForReview: 0, quarantined: 400, excluded: 0, total: 400 }, statusByStratum: byStratum, reviewCapacity: { requestedRows: 400, eligibleRows: 0, capacityPlausible: false, reason: "All acquired rows remain quarantined until an authorized PII disposition process resolves them." }, acquisitionDecision: "DO_NOT_AUTHORIZE_T6L_7I3_REVIEWER_A_REVIEW", blocker: "No authorized automatic PII detector exists; all 400 rows retain REQUIRES_REVIEW and cannot enter a Reviewer A moderation packet.", exactNextPhase: "T6L-7I2A_PII_SCREENING_AND_DISPOSITION", boundaries: { humanModerationLabelsCreated: false, humanReviewPerformed: false, humanReviewPacketCreated: false, sourceMeasurementsTreatedAsFinalLabels: false, semanticE5Executed: false, internalTestAccessed: false, frozen140Accessed: false, trainSplitMutated: false, validationSplitMutated: false, internalTestSplitMutated: false, datasetMaterialized: false, trainingPerformed: false, evaluationPerformed: false, productionIntegrated: false }, candidateArtifactSha256: candidateSha256, candidatePayloadDigest: candidate.candidatePayloadDigest, candidateMembershipDigest: memberDigest, createdAt };
  const acquisition: MhsV2ExpansionAcquisitionArtifact = { ...acquisitionPayload, acquisitionPayloadDigest: digest(acquisitionPayload) };
  validateMhsV2ExpansionArtifacts(candidate, acquisition);
  return { candidate, acquisition };
};

export const validateMhsV2ExpansionArtifacts = (candidate: MhsV2ExpansionCandidateArtifact, acquisition: MhsV2ExpansionAcquisitionArtifact): void => {
  const { candidatePayloadDigest, ...candidatePayload } = candidate; const { acquisitionPayloadDigest, ...acquisitionPayload } = acquisition;
  if (candidate.schemaVersion !== MHS_V2_EXPANSION_CANDIDATE_SCHEMA || candidate.candidateVersion !== MHS_V2_EXPANSION_CANDIDATE_VERSION || candidate.phase !== "T6L-7I2" || candidate.candidateCount !== 400 || candidate.rows.length !== 400 || candidatePayloadDigest !== digest(candidatePayload)) throw new Error("Invalid V2 expansion candidate artifact");
  if (new Set(candidate.rows.map((row) => row.candidateId)).size !== 400 || candidate.membershipDigest !== membershipDigest(candidate.rows) || candidate.rows.some((row) => row.candidateId !== row.sourceRowId || row.lineageRootId !== row.sourceRowId || row.sourceDataset !== "MEASURING_HATE_SPEECH" || row.sourceRevision !== MHS_PINNED_SOURCE_REVISION || row.proposalSha256 !== MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256 || !row.sourceIdentityRecomputed || sha(row.text) !== row.exactTextDigest || textDuplicateFingerprint(row.text) !== row.normalizedTextFingerprint || row.piiStatus !== "REQUIRES_REVIEW" || row.candidateStatus !== "QUARANTINED" || row.humanReviewState !== "UNREVIEWED" || row.finalSthnDecision !== null || row.finalSthnPrimaryCategory !== null || row.trainingEligible || row.transformationHistory.length !== 0)) throw new Error("Invalid V2 expansion candidate row");
  if (acquisition.schemaVersion !== MHS_V2_EXPANSION_ACQUISITION_SCHEMA || acquisition.acquisitionVersion !== MHS_V2_EXPANSION_ACQUISITION_VERSION || acquisition.statusCounts.total !== 400 || acquisition.statusCounts.eligibleForReview !== 0 || acquisition.statusCounts.quarantined !== 400 || acquisition.statusCounts.excluded !== 0 || acquisition.acquisitionDecision !== "DO_NOT_AUTHORIZE_T6L_7I3_REVIEWER_A_REVIEW" || acquisitionPayloadDigest !== digest(acquisitionPayload)) throw new Error("Invalid V2 acquisition artifact");
  if (acquisition.candidateArtifactSha256 !== sha(canonicalJson(candidate)) || acquisition.candidatePayloadDigest !== candidate.candidatePayloadDigest || acquisition.candidateMembershipDigest !== candidate.membershipDigest || Object.values(acquisition.boundaries).some(Boolean)) throw new Error("V2 paired authority mismatch");
};

export interface MhsV2ExpansionPaths { readonly design: string; readonly proposal: string; readonly acquisitionManifest: string; readonly parentTranche: string; readonly sourceArtifact: string; readonly provenanceStaging: string; readonly currentCandidate: string; readonly currentCandidateIntegrity: string; readonly splitManifest: string; readonly internalTestFreeze: string }
export const verifyMhsV2ExpansionAuthorities = (paths: MhsV2ExpansionPaths): { proposal: MhsTrainExpansionTrancheProposal; parent: readonly MhsReviewTrancheRow[]; currentIntegrity: CurrentIntegrityArtifact } => {
  const checks: readonly [string, string][] = [[paths.design, MHS_TRAIN_EXPANSION_DESIGN_SHA256], [paths.proposal, MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256], [paths.acquisitionManifest, TEXT_MODERATION_ACQUISITION_MANIFEST_SHA256], [paths.parentTranche, MHS_REVIEW_PARENT_ARTIFACT_SHA256], [paths.sourceArtifact, MHS_PINNED_SOURCE_ARTIFACT_SHA256], [paths.provenanceStaging, MHS_PROVENANCE_STAGING_SHA256], [paths.currentCandidate, MHS_CANDIDATE_ARTIFACT_SHA256], [paths.currentCandidateIntegrity, "6d6cb13ddfe6f832fcd9e25899310a62dd0bd1498be022d4f3675d6076188383"], [paths.splitManifest, MHS_SPLIT_MANIFEST_SHA256], [paths.internalTestFreeze, MHS_INTERNAL_TEST_FREEZE_SHA256]];
  checks.forEach(([filename, expected]) => { if (shaFile(filename) !== expected) throw new Error(`T6L-7I2 authority SHA mismatch: ${path.basename(filename)}`); });
  const proposal = readMhsTrainExpansionTrancheProposal(paths.proposal);
  const parent = fs.readFileSync(paths.parentTranche, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as MhsReviewTrancheRow);
  const currentIntegrity = JSON.parse(fs.readFileSync(paths.currentCandidateIntegrity, "utf8")) as CurrentIntegrityArtifact;
  return { proposal, parent, currentIntegrity };
};

type PairPublisher = (candidateTemporary: string, candidateTarget: string, acquisitionTemporary: string, acquisitionTarget: string) => void;
const defaultPairPublisher: PairPublisher = (candidateTemporary, candidateTarget, acquisitionTemporary, acquisitionTarget) => { fs.renameSync(candidateTemporary, candidateTarget); fs.renameSync(acquisitionTemporary, acquisitionTarget); };
export const publishMhsV2ExpansionPair = (candidate: MhsV2ExpansionCandidateArtifact, acquisition: MhsV2ExpansionAcquisitionArtifact, outputDirectory: string, publish: PairPublisher = defaultPairPublisher): { candidatePath: string; acquisitionPath: string } => {
  validateMhsV2ExpansionArtifacts(candidate, acquisition); fs.mkdirSync(outputDirectory, { recursive: true });
  const candidatePath = path.join(outputDirectory, MHS_V2_EXPANSION_CANDIDATE_FILENAME), acquisitionPath = path.join(outputDirectory, MHS_V2_EXPANSION_ACQUISITION_FILENAME);
  if (fs.existsSync(candidatePath) || fs.existsSync(acquisitionPath)) throw new Error("V2 expansion paired authority exists; overwrite refused");
  const token = `${process.pid}-${crypto.randomBytes(8).toString("hex")}`, candidateTemp = `${candidatePath}.${token}.partial`, acquisitionTemp = `${acquisitionPath}.${token}.partial`;
  const candidateText = canonicalJson(candidate), acquisitionText = canonicalJson(acquisition);
  try { fs.writeFileSync(candidateTemp, candidateText, { flag: "wx" }); fs.writeFileSync(acquisitionTemp, acquisitionText, { flag: "wx" }); publish(candidateTemp, candidatePath, acquisitionTemp, acquisitionPath); if (!fs.existsSync(candidatePath) || !fs.existsSync(acquisitionPath) || fs.readFileSync(candidatePath, "utf8") !== candidateText || fs.readFileSync(acquisitionPath, "utf8") !== acquisitionText) throw new Error("Incomplete V2 expansion paired publication"); return { candidatePath, acquisitionPath }; }
  catch (error) { for (const [filename, expected] of [[candidatePath, candidateText], [acquisitionPath, acquisitionText]] as const) if (fs.existsSync(filename) && fs.readFileSync(filename, "utf8") === expected) fs.rmSync(filename, { force: true }); throw error; }
  finally { fs.rmSync(candidateTemp, { force: true }); fs.rmSync(acquisitionTemp, { force: true }); }
};

export const summarizeV2CandidateDistributions = (rows: readonly MhsV2ExpansionCandidateRow[]): Record<string, Record<string, number>> => ({ stratum: tally(rows.map((row) => row.selectionStratum)), language: tally(rows.map((row) => row.language)), script: tally(rows.map((row) => row.script)), pii: tally(rows.map((row) => row.piiStatus)), status: tally(rows.map((row) => row.candidateStatus)) });
