import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalJson } from "./manifest";
import { MHS_CANDIDATE_ARTIFACT_SHA256 } from "./mhsCandidateIntegrityAudit";
import { MHS_SPLIT_MANIFEST_SHA256 } from "./mhsInternalTestFreeze";
import { MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256, MhsProposalStratum } from "./mhsTrainExpansionTrancheProposal";
import { MHS_INTERNAL_TEST_FREEZE_SHA256 } from "./mhsTrainingEligibilityReleasePlan";
import {
  MHS_V2_EXPANSION_ACQUISITION_SHA256, MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST,
  MHS_V2_EXPANSION_CANDIDATE_PAYLOAD_DIGEST, MHS_V2_EXPANSION_CANDIDATE_SHA256,
  MhsV2ExpansionAcquisitionArtifact, MhsV2ExpansionCandidateArtifact, validateMhsV2ExpansionArtifacts,
} from "./mhsV2ExpansionCandidateAcquisition";
import {
  AutomaticPiiFindingV1, screenSyntheticTextUnderPiiPolicy, TEXT_MODERATION_PII_DETECTOR_VERSION,
  TEXT_MODERATION_PII_POLICY_PAYLOAD_DIGEST, TEXT_MODERATION_PII_POLICY_SHA256,
  TEXT_MODERATION_PII_POLICY_VERSION, TextModerationPiiPolicyArtifact, validateTextModerationPiiPolicy,
} from "./textModerationPiiPolicy";

export const MHS_V2_EXPANSION_PII_SCREENING_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_EXPANSION_PII_SCREENING_V1" as const;
export const MHS_V2_EXPANSION_PII_SCREENING_VERSION = "MHS_V2_EXPANSION_PII_SCREENING_V1" as const;
export const MHS_V2_EXPANSION_PII_SCREENING_FILENAME = "mhs-v2-expansion-pii-screening-v1.json" as const;
export const MHS_V2_EXPANSION_PII_DISPOSITION_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_EXPANSION_PII_DISPOSITION_V1" as const;
export const MHS_V2_EXPANSION_PII_DISPOSITION_VERSION = "MHS_V2_EXPANSION_PII_DISPOSITION_V1" as const;
export const MHS_V2_EXPANSION_PII_DISPOSITION_FILENAME = "mhs-v2-expansion-pii-disposition-v1.json" as const;
export const MHS_V2_EXPANSION_PII_GENERATED_AT = "2026-09-15T01:00:00.000Z" as const;
export const MHS_V2_EXPANSION_PII_SCREENING_SHA256 = "70d00cd07cc36185fd09317c94ccf755a6d6aedf7fdfbedf9e621728e376b00b" as const;
export const MHS_V2_EXPANSION_PII_SCREENING_PAYLOAD_DIGEST = "eec681c0667ce4f6d6a7f0262975ec9fd8cd1af4c549d8a48c9b1123ed9f2098" as const;
export const MHS_V2_EXPANSION_PII_DISPOSITION_SHA256 = "b09f070bc81aeb7944b4ba5b6ffac82a156f6b6c3f4ab6da1077ae6fb2b1465f" as const;
export const MHS_V2_EXPANSION_PII_DISPOSITION_PAYLOAD_DIGEST = "c509a955f5e13dc519c2e8e5ec08c717dbf73c7db50dbe56be4984821759a5e5" as const;

const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const digest = (value: unknown): string => sha(canonicalJson(value));
const shaFile = (filename: string): string => sha(fs.readFileSync(filename));
type PiiScreenStatus = "NONE" | "REQUIRES_REVIEW";
type ReviewDisposition = "ELIGIBLE_FOR_REVIEW" | "REQUIRES_PII_REVIEW";

export interface MhsV2PiiScreeningRow {
  readonly candidateId: string;
  readonly textSha256: string;
  readonly candidateArtifactSha256: typeof MHS_V2_EXPANSION_CANDIDATE_SHA256;
  readonly policyArtifactSha256: typeof TEXT_MODERATION_PII_POLICY_SHA256;
  readonly policyVersion: typeof TEXT_MODERATION_PII_POLICY_VERSION;
  readonly detectorVersion: typeof TEXT_MODERATION_PII_DETECTOR_VERSION;
  readonly findingClasses: readonly AutomaticPiiFindingV1[];
  readonly findingCount: number;
  readonly piiStatus: PiiScreenStatus;
  readonly disposition: ReviewDisposition;
  readonly reasonCodes: readonly ("BOUNDED_V1_NEGATIVE_AUTO_CLEAR" | "SUPPORTED_V1_FINDING_REQUIRES_HUMAN_PII_REVIEW")[];
  readonly screeningRecordDigest: string;
}
interface MhsV2PiiScreeningPayload {
  readonly schemaVersion: typeof MHS_V2_EXPANSION_PII_SCREENING_SCHEMA;
  readonly screeningVersion: typeof MHS_V2_EXPANSION_PII_SCREENING_VERSION;
  readonly phase: "T6L-7I2A";
  readonly authorities: Readonly<Record<string, string>>;
  readonly clearanceScope: typeof TEXT_MODERATION_PII_DETECTOR_VERSION;
  readonly universalPrivacyCertification: false;
  readonly rows: readonly MhsV2PiiScreeningRow[];
  readonly statistics: { readonly candidateCount: 400; readonly findingCounts: Readonly<Record<AutomaticPiiFindingV1, number>>; readonly multiFindingCandidateCount: number; readonly zeroFindingCandidateCount: number };
  readonly limitations: readonly string[];
  readonly protections: Readonly<Record<string, boolean | number>>;
  readonly generatedAt: typeof MHS_V2_EXPANSION_PII_GENERATED_AT;
}
export type MhsV2PiiScreeningArtifact = MhsV2PiiScreeningPayload & { readonly screeningPayloadDigest: string };

export interface MhsV2PiiDispositionRow { readonly candidateId: string; readonly textSha256: string; readonly screeningRecordDigest: string; readonly piiStatus: PiiScreenStatus; readonly reviewDisposition: ReviewDisposition }
interface MhsV2PiiDispositionPayload {
  readonly schemaVersion: typeof MHS_V2_EXPANSION_PII_DISPOSITION_SCHEMA;
  readonly dispositionVersion: typeof MHS_V2_EXPANSION_PII_DISPOSITION_VERSION;
  readonly phase: "T6L-7I2A";
  readonly authorities: Readonly<Record<string, string>>;
  readonly candidateMembershipDigest: typeof MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST;
  readonly rows: readonly MhsV2PiiDispositionRow[];
  readonly piiStatusCounts: { readonly NONE: number; readonly REDACTED: 0; readonly REQUIRES_REVIEW: number; readonly EXCLUDE: 0; readonly total: 400 };
  readonly reviewDispositionCounts: { readonly ELIGIBLE_FOR_REVIEW: number; readonly REQUIRES_PII_REVIEW: number; readonly EXCLUDED: 0; readonly total: 400 };
  readonly eligibleByProposalStratum: Readonly<Record<MhsProposalStratum, number>>;
  readonly unresolvedByProposalStratum: Readonly<Record<MhsProposalStratum, number>>;
  readonly capacityAssessment: Readonly<Record<string, boolean | number | string>>;
  readonly partialReviewArchitecture: Readonly<Record<string, boolean | string>>;
  readonly finalAuthorizationDecision: "REQUIRE_T6L_7I2B_HUMAN_PII_DISPOSITION_BEFORE_T6L_7I3" | "AUTHORIZE_T6L_7I3_REVIEWER_A_REVIEW" | "DO_NOT_AUTHORIZE_T6L_7I3_REVIEWER_A_REVIEW";
  readonly protections: Readonly<Record<string, boolean | number>>;
  readonly generatedAt: typeof MHS_V2_EXPANSION_PII_GENERATED_AT;
}
export type MhsV2PiiDispositionArtifact = MhsV2PiiDispositionPayload & { readonly dispositionPayloadDigest: string };

export const screenMhsV2CandidateText = (candidateId: string, text: string, textSha256: string): MhsV2PiiScreeningRow => {
  if (!candidateId || sha(text) !== textSha256) throw new Error(`PII screening input text binding mismatch: ${candidateId}`);
  const result = screenSyntheticTextUnderPiiPolicy(text);
  const piiStatus: PiiScreenStatus = result.automaticStatus, disposition: ReviewDisposition = piiStatus === "NONE" ? "ELIGIBLE_FOR_REVIEW" : "REQUIRES_PII_REVIEW";
  const base = { candidateId, textSha256, candidateArtifactSha256: MHS_V2_EXPANSION_CANDIDATE_SHA256, policyArtifactSha256: TEXT_MODERATION_PII_POLICY_SHA256, policyVersion: TEXT_MODERATION_PII_POLICY_VERSION, detectorVersion: TEXT_MODERATION_PII_DETECTOR_VERSION, findingClasses: result.findingClasses, findingCount: result.findingClasses.length, piiStatus, disposition, reasonCodes: [piiStatus === "NONE" ? "BOUNDED_V1_NEGATIVE_AUTO_CLEAR" as const : "SUPPORTED_V1_FINDING_REQUIRES_HUMAN_PII_REVIEW" as const] };
  return { ...base, screeningRecordDigest: digest(base) };
};

export const screenMhsV2ExpansionCandidates = (candidate: MhsV2ExpansionCandidateArtifact, acquisition: MhsV2ExpansionAcquisitionArtifact, policy: TextModerationPiiPolicyArtifact): { screening: MhsV2PiiScreeningArtifact; disposition: MhsV2PiiDispositionArtifact } => {
  validateMhsV2ExpansionArtifacts(candidate, acquisition); validateTextModerationPiiPolicy(policy);
  if (sha(canonicalJson(candidate)) !== MHS_V2_EXPANSION_CANDIDATE_SHA256 || candidate.candidatePayloadDigest !== MHS_V2_EXPANSION_CANDIDATE_PAYLOAD_DIGEST || sha(canonicalJson(acquisition)) !== MHS_V2_EXPANSION_ACQUISITION_SHA256 || sha(canonicalJson(policy)) !== TEXT_MODERATION_PII_POLICY_SHA256 || policy.policyPayloadDigest !== TEXT_MODERATION_PII_POLICY_PAYLOAD_DIGEST) throw new Error("PII screening upstream authority mismatch");
  const rows = candidate.rows.map((row) => screenMhsV2CandidateText(row.candidateId, row.text, row.exactTextDigest));
  if (rows.length !== 400 || new Set(rows.map((row) => row.candidateId)).size !== 400) throw new Error("PII screening did not cover each candidate exactly once");
  const findingCounts = Object.fromEntries((["EMAIL_PATTERN", "PHONE_PATTERN_STRONG", "IPV4_PATTERN_VALID", "AMBIGUOUS_NUMERIC_PATTERN"] as const).map((finding) => [finding, rows.filter((row) => row.findingClasses.includes(finding)).length])) as Record<AutomaticPiiFindingV1, number>;
  const screeningPayload: MhsV2PiiScreeningPayload = { schemaVersion: MHS_V2_EXPANSION_PII_SCREENING_SCHEMA, screeningVersion: MHS_V2_EXPANSION_PII_SCREENING_VERSION, phase: "T6L-7I2A", authorities: { policyArtifactSha256: TEXT_MODERATION_PII_POLICY_SHA256, policyPayloadDigest: TEXT_MODERATION_PII_POLICY_PAYLOAD_DIGEST, candidateArtifactSha256: MHS_V2_EXPANSION_CANDIDATE_SHA256, candidatePayloadDigest: MHS_V2_EXPANSION_CANDIDATE_PAYLOAD_DIGEST, candidateMembershipDigest: MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST, acquisitionManifestSha256: MHS_V2_EXPANSION_ACQUISITION_SHA256 }, clearanceScope: TEXT_MODERATION_PII_DETECTOR_VERSION, universalPrivacyCertification: false, rows, statistics: { candidateCount: 400, findingCounts, multiFindingCandidateCount: rows.filter((row) => row.findingCount > 1).length, zeroFindingCandidateCount: rows.filter((row) => row.findingCount === 0).length }, limitations: [...policy.knownLimitations], protections: { rawMatchesPersisted: false, candidateTextPersisted: false, candidateMutations: 0, automaticExclusions: 0, automaticRedactions: 0, moderationLabelsGenerated: 0, humanReviewsPerformed: 0, semanticWorkPerformed: false, modelInferencePerformed: false, trainingPerformed: false, internalTestAccessed: false, frozen140Accessed: false }, generatedAt: MHS_V2_EXPANSION_PII_GENERATED_AT };
  const screening: MhsV2PiiScreeningArtifact = { ...screeningPayload, screeningPayloadDigest: digest(screeningPayload) };
  const screeningSha = sha(canonicalJson(screening));
  const dispositionRows: MhsV2PiiDispositionRow[] = rows.map((row) => ({ candidateId: row.candidateId, textSha256: row.textSha256, screeningRecordDigest: row.screeningRecordDigest, piiStatus: row.piiStatus, reviewDisposition: row.disposition }));
  const none = rows.filter((row) => row.piiStatus === "NONE").length, unresolved = 400 - none;
  const strata = [...new Set(candidate.rows.map((row) => row.selectionStratum))].sort() as MhsProposalStratum[];
  const candidateById = new Map(candidate.rows.map((row) => [row.candidateId, row]));
  const by = (disposition: ReviewDisposition) => Object.fromEntries(strata.map((stratum) => [stratum, dispositionRows.filter((row) => row.reviewDisposition === disposition && candidateById.get(row.candidateId)?.selectionStratum === stratum).length])) as Record<MhsProposalStratum, number>;
  const eligibleByProposalStratum = by("ELIGIBLE_FOR_REVIEW"), unresolvedByProposalStratum = by("REQUIRES_PII_REVIEW");
  const capacityPlausible = none >= 140 && (eligibleByProposalStratum.VIOLENCE_GENOCIDE_SIGNAL ?? 0) >= 15 && Object.values(eligibleByProposalStratum).every((count) => count > 0);
  const finalAuthorizationDecision = unresolved > 0 ? "REQUIRE_T6L_7I2B_HUMAN_PII_DISPOSITION_BEFORE_T6L_7I3" as const : capacityPlausible ? "AUTHORIZE_T6L_7I3_REVIEWER_A_REVIEW" as const : "DO_NOT_AUTHORIZE_T6L_7I3_REVIEWER_A_REVIEW" as const;
  const dispositionPayload: MhsV2PiiDispositionPayload = { schemaVersion: MHS_V2_EXPANSION_PII_DISPOSITION_SCHEMA, dispositionVersion: MHS_V2_EXPANSION_PII_DISPOSITION_VERSION, phase: "T6L-7I2A", authorities: { policyArtifactSha256: TEXT_MODERATION_PII_POLICY_SHA256, candidateArtifactSha256: MHS_V2_EXPANSION_CANDIDATE_SHA256, acquisitionManifestSha256: MHS_V2_EXPANSION_ACQUISITION_SHA256, proposalSha256: MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256, screeningArtifactSha256: screeningSha, screeningPayloadDigest: screening.screeningPayloadDigest }, candidateMembershipDigest: MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST, rows: dispositionRows, piiStatusCounts: { NONE: none, REDACTED: 0, REQUIRES_REVIEW: unresolved, EXCLUDE: 0, total: 400 }, reviewDispositionCounts: { ELIGIBLE_FOR_REVIEW: none, REQUIRES_PII_REVIEW: unresolved, EXCLUDED: 0, total: 400 }, eligibleByProposalStratum, unresolvedByProposalStratum, capacityAssessment: { status: capacityPlausible ? "PLAUSIBLE_CAPACITY_NOT_LABEL_GUARANTEE" : "INSUFFICIENT_REVIEWABLE_CAPACITY", eligibleCandidateCount: none, targetNewAllow: 70, targetNewBlock: 70, threatOrViolenceSourceEnvelopeFloor: 15, sourceMeasurementsInterpretedAsLabels: false }, partialReviewArchitecture: { architectureSafe: false, reason: "Existing Reviewer A packet requires fixed bounded membership and does not support arbitrary eligible-subset progression without a new authority.", fullTranchePiiResolutionRequired: true }, finalAuthorizationDecision, protections: { candidateMutations: 0, automaticExclusions: 0, automaticRedactions: 0, moderationLabelsGenerated: 0, humanPiiReviewsPerformed: 0, humanModerationReviewsPerformed: 0, semanticWorkPerformed: false, modelInferencePerformed: false, trainingPerformed: false, currentSplitsMutated: false, v1CandidateMutated: false, internalTestAccessed: false, frozen140Accessed: false }, generatedAt: MHS_V2_EXPANSION_PII_GENERATED_AT };
  const disposition: MhsV2PiiDispositionArtifact = { ...dispositionPayload, dispositionPayloadDigest: digest(dispositionPayload) };
  validateMhsV2PiiArtifacts(screening, disposition, candidate); return { screening, disposition };
};

export const validateMhsV2PiiArtifacts = (screening: MhsV2PiiScreeningArtifact, disposition: MhsV2PiiDispositionArtifact, candidate: MhsV2ExpansionCandidateArtifact): void => {
  const { screeningPayloadDigest, ...screeningPayload } = screening, { dispositionPayloadDigest, ...dispositionPayload } = disposition;
  if (screening.schemaVersion !== MHS_V2_EXPANSION_PII_SCREENING_SCHEMA || screening.screeningVersion !== MHS_V2_EXPANSION_PII_SCREENING_VERSION || screening.rows.length !== 400 || screeningPayloadDigest !== digest(screeningPayload) || new Set(screening.rows.map((row) => row.candidateId)).size !== 400) throw new Error("Invalid V2 PII screening artifact");
  const candidates = new Map(candidate.rows.map((row) => [row.candidateId, row]));
  for (const row of screening.rows) { const source = candidates.get(row.candidateId); const { screeningRecordDigest, ...base } = row; if (!source || source.exactTextDigest !== row.textSha256 || row.detectorVersion !== TEXT_MODERATION_PII_DETECTOR_VERSION || row.findingCount !== row.findingClasses.length || screeningRecordDigest !== digest(base) || (row.findingCount === 0) !== (row.piiStatus === "NONE") || (row.piiStatus === "NONE") !== (row.disposition === "ELIGIBLE_FOR_REVIEW")) throw new Error("Invalid V2 PII screening row"); }
  if (disposition.schemaVersion !== MHS_V2_EXPANSION_PII_DISPOSITION_SCHEMA || disposition.dispositionVersion !== MHS_V2_EXPANSION_PII_DISPOSITION_VERSION || disposition.rows.length !== 400 || dispositionPayloadDigest !== digest(dispositionPayload) || disposition.authorities.screeningArtifactSha256 !== sha(canonicalJson(screening)) || disposition.authorities.screeningPayloadDigest !== screening.screeningPayloadDigest) throw new Error("Invalid V2 PII disposition artifact");
  const screenById = new Map(screening.rows.map((row) => [row.candidateId, row]));
  for (const row of disposition.rows) { const screened = screenById.get(row.candidateId); if (!screened || screened.textSha256 !== row.textSha256 || screened.screeningRecordDigest !== row.screeningRecordDigest || screened.piiStatus !== row.piiStatus || screened.disposition !== row.reviewDisposition) throw new Error("Invalid V2 PII disposition row"); }
  if (disposition.piiStatusCounts.NONE + disposition.piiStatusCounts.REDACTED + disposition.piiStatusCounts.REQUIRES_REVIEW + disposition.piiStatusCounts.EXCLUDE !== 400 || disposition.reviewDispositionCounts.ELIGIBLE_FOR_REVIEW + disposition.reviewDispositionCounts.REQUIRES_PII_REVIEW + disposition.reviewDispositionCounts.EXCLUDED !== 400 || disposition.piiStatusCounts.REDACTED !== 0 || disposition.piiStatusCounts.EXCLUDE !== 0 || disposition.reviewDispositionCounts.EXCLUDED !== 0) throw new Error("Invalid V2 PII disposition counts");
  const expected = disposition.piiStatusCounts.REQUIRES_REVIEW > 0 ? "REQUIRE_T6L_7I2B_HUMAN_PII_DISPOSITION_BEFORE_T6L_7I3" : disposition.capacityAssessment.status === "PLAUSIBLE_CAPACITY_NOT_LABEL_GUARANTEE" ? "AUTHORIZE_T6L_7I3_REVIEWER_A_REVIEW" : "DO_NOT_AUTHORIZE_T6L_7I3_REVIEWER_A_REVIEW";
  if (disposition.finalAuthorizationDecision !== expected || Object.values(screening.protections).some((value) => value !== false && value !== 0) || Object.values(disposition.protections).some((value) => value !== false && value !== 0)) throw new Error("V2 PII authorization or protection boundary mismatch");
};

export interface MhsV2PiiAuthorityPaths { readonly policy: string; readonly candidate: string; readonly acquisition: string; readonly proposal: string; readonly v1Candidate: string; readonly splitManifest: string; readonly internalTestFreeze: string }
export const readMhsV2PiiAuthorities = (paths: MhsV2PiiAuthorityPaths): { policy: TextModerationPiiPolicyArtifact; candidate: MhsV2ExpansionCandidateArtifact; acquisition: MhsV2ExpansionAcquisitionArtifact } => {
  const checks: readonly [string, string][] = [[paths.policy, TEXT_MODERATION_PII_POLICY_SHA256], [paths.candidate, MHS_V2_EXPANSION_CANDIDATE_SHA256], [paths.acquisition, MHS_V2_EXPANSION_ACQUISITION_SHA256], [paths.proposal, MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256], [paths.v1Candidate, MHS_CANDIDATE_ARTIFACT_SHA256], [paths.splitManifest, MHS_SPLIT_MANIFEST_SHA256], [paths.internalTestFreeze, MHS_INTERNAL_TEST_FREEZE_SHA256]];
  checks.forEach(([filename, expected]) => { if (shaFile(filename) !== expected) throw new Error(`T6L-7I2A authority mismatch: ${path.basename(filename)}`); });
  const policy = JSON.parse(fs.readFileSync(paths.policy, "utf8")) as TextModerationPiiPolicyArtifact, candidate = JSON.parse(fs.readFileSync(paths.candidate, "utf8")) as MhsV2ExpansionCandidateArtifact, acquisition = JSON.parse(fs.readFileSync(paths.acquisition, "utf8")) as MhsV2ExpansionAcquisitionArtifact;
  validateTextModerationPiiPolicy(policy); validateMhsV2ExpansionArtifacts(candidate, acquisition); return { policy, candidate, acquisition };
};

type PairPublisher = (screeningTemporary: string, screeningTarget: string, dispositionTemporary: string, dispositionTarget: string) => void;
const defaultPublisher: PairPublisher = (screeningTemporary, screeningTarget, dispositionTemporary, dispositionTarget) => { fs.renameSync(screeningTemporary, screeningTarget); fs.renameSync(dispositionTemporary, dispositionTarget); };
export const publishMhsV2PiiPair = (screening: MhsV2PiiScreeningArtifact, disposition: MhsV2PiiDispositionArtifact, candidate: MhsV2ExpansionCandidateArtifact, outputDirectory: string, publish: PairPublisher = defaultPublisher): { screeningPath: string; dispositionPath: string } => {
  validateMhsV2PiiArtifacts(screening, disposition, candidate); fs.mkdirSync(outputDirectory, { recursive: true });
  const screeningPath = path.join(outputDirectory, MHS_V2_EXPANSION_PII_SCREENING_FILENAME), dispositionPath = path.join(outputDirectory, MHS_V2_EXPANSION_PII_DISPOSITION_FILENAME);
  if (fs.existsSync(screeningPath) || fs.existsSync(dispositionPath)) throw new Error("V2 PII authority exists; overwrite refused");
  const token = `${process.pid}-${crypto.randomBytes(8).toString("hex")}`, screeningTemporary = `${screeningPath}.${token}.partial`, dispositionTemporary = `${dispositionPath}.${token}.partial`, screeningText = canonicalJson(screening), dispositionText = canonicalJson(disposition);
  try { fs.writeFileSync(screeningTemporary, screeningText, { flag: "wx" }); fs.writeFileSync(dispositionTemporary, dispositionText, { flag: "wx" }); publish(screeningTemporary, screeningPath, dispositionTemporary, dispositionPath); if (!fs.existsSync(screeningPath) || !fs.existsSync(dispositionPath) || fs.readFileSync(screeningPath, "utf8") !== screeningText || fs.readFileSync(dispositionPath, "utf8") !== dispositionText) throw new Error("Incomplete V2 PII paired publication"); return { screeningPath, dispositionPath }; }
  catch (error) { for (const [filename, expected] of [[screeningPath, screeningText], [dispositionPath, dispositionText]] as const) if (fs.existsSync(filename) && fs.readFileSync(filename, "utf8") === expected) fs.rmSync(filename, { force: true }); throw error; }
  finally { fs.rmSync(screeningTemporary, { force: true }); fs.rmSync(dispositionTemporary, { force: true }); }
};
