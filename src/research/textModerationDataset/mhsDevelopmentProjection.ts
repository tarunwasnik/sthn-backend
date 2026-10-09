import fs from "node:fs";
import path from "node:path";

import { DATASET_POLICY_VERSION } from "./contracts";
import { canonicalJson, sha256 } from "./manifest";
import { MHS_CANDIDATE_ARTIFACT_SHA256, MhsCandidateIntegrityAuditArtifact, validateMhsCandidateIntegrityAuditArtifact } from "./mhsCandidateIntegrityAudit";
import { MHS_CANDIDATE_INTEGRITY_SHA256 } from "./mhsReviewedSemanticApplicationContract";
import { MHS_CANDIDATE_MEMBERSHIP_DIGEST } from "./mhsSemanticGroupingOverlay";
import { MhsCandidateAdmissionArtifact, validateMhsCandidateAdmissionArtifact } from "./mhsCandidateAdmission";
import { MHS_SPLIT_MANIFEST_SHA256, MhsInternalTestFreezeArtifact, validateMhsInternalTestFreezeArtifact } from "./mhsInternalTestFreeze";
import { MhsSplitManifestArtifact, validateMhsSplitManifestArtifact } from "./mhsSplitManifest";
import { MHS_INTERNAL_TEST_FREEZE_SHA256, MHS_INTERNAL_TEST_PROTECTED_MEMBERSHIP_DIGEST, MhsTrainingEligibilityReleasePlanArtifact, validateMhsTrainingEligibilityReleasePlanArtifact } from "./mhsTrainingEligibilityReleasePlan";
import {
  MHS_DATASET_VERSION,
  MHS_RELEASE_VERSION,
  MHS_R_ELIGIBILITY_PLAN_SHA256,
  MHS_TRAINING_ELIGIBILITY_MANIFEST_FILENAME,
  MhsReleaseManifestArtifact,
  MhsTrainingEligibilityManifestArtifact,
  validateMhsReleaseManifestArtifact,
  validateMhsTrainingEligibilityManifestArtifact,
} from "./mhsDatasetRelease";

export const MHS_TRUSTED_DEVELOPMENT_PARTITIONING_PURPOSE = "TRUSTED_DEVELOPMENT_PROJECTION_PARTITIONING" as const;
export const MHS_DEVELOPMENT_PROJECTION_SCHEMA = "STHN_TEXT_MODERATION_MHS_DEVELOPMENT_TEXT_PROJECTION_V1" as const;
export const MHS_DEVELOPMENT_PROJECTION_VERSION = "MHS_DEVELOPMENT_TEXT_PROJECTION_V1" as const;
export const MHS_DEVELOPMENT_PROJECTION_FILENAME = "mhs-development-text-projection-v1.jsonl" as const;
export const MHS_DEVELOPMENT_PROJECTION_MANIFEST_SCHEMA = "STHN_TEXT_MODERATION_MHS_DEVELOPMENT_TEXT_PROJECTION_MANIFEST_V1" as const;
export const MHS_DEVELOPMENT_PROJECTION_MANIFEST_VERSION = "MHS_DEVELOPMENT_TEXT_PROJECTION_MANIFEST_V1" as const;
export const MHS_DEVELOPMENT_PROJECTION_MANIFEST_FILENAME = "mhs-development-text-projection-manifest-v1.json" as const;
export const MHS_RELEASE_MANIFEST_SHA256 = "d318d6ec929477beb77f624b47bd09280498a0d0e20426c89dfd1c0620034d96" as const;
export const MHS_RELEASE_MANIFEST_PAYLOAD_DIGEST = "d6f335e0a898dc8b75db2c32de4dee5116e6b70d6649445b750468700b44d471" as const;
export const MHS_ELIGIBILITY_MANIFEST_SHA256 = "2a7b930123607fdf14dd18be6c03f2976ab3d7e23977158e2a9a255214b97322" as const;
export const MHS_ELIGIBILITY_MANIFEST_PAYLOAD_DIGEST = "ae30718bcbe9d65db198769aa5f5d28188d3fa517365a89478a3a5cf75e5f655" as const;

const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
const exactBytes = (filename: string, expected: string): Buffer => { const bytes = fs.readFileSync(filename); if (sha256(bytes) !== expected) throw new Error(`7A0 authority SHA-256 mismatch: ${path.basename(filename)}`); return bytes; };
const readExact = <T>(filename: string, expected: string, validate: (value: T) => void): T => { const value = JSON.parse(exactBytes(filename, expected).toString("utf8")) as T; validate(value); return value; };
const strictInstant = (value: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value;
const jsonl = (rows: readonly MhsDevelopmentProjectionRow[]): string => `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;

export interface MhsDevelopmentProjectionRow {
  readonly schemaVersion: typeof MHS_DEVELOPMENT_PROJECTION_SCHEMA;
  readonly projectionVersion: typeof MHS_DEVELOPMENT_PROJECTION_VERSION;
  readonly policyVersion: typeof DATASET_POLICY_VERSION;
  readonly datasetVersion: typeof MHS_DATASET_VERSION;
  readonly releaseVersion: typeof MHS_RELEASE_VERSION;
  readonly exampleId: string;
  readonly candidateTextDigest: string;
  readonly text: string;
  readonly decision: "ALLOW" | "BLOCK";
  readonly primaryCategory: string | null;
  readonly secondaryCategories: readonly string[];
  readonly reasonCode: string;
  readonly language: "en";
  readonly script: "LATIN" | "MIXED" | "OTHER";
  readonly sourceDataset: "MEASURING_HATE_SPEECH";
  readonly sourceRevision: string;
  readonly sourceArtifactSha256: string;
  readonly split: "TRAIN" | "VALIDATION";
  readonly developmentStatus: "TRAINING_ELIGIBLE" | "VALIDATION_AUTHORIZED";
}

export interface MhsDevelopmentProjectionManifestPayload {
  readonly schemaVersion: typeof MHS_DEVELOPMENT_PROJECTION_MANIFEST_SCHEMA;
  readonly manifestVersion: typeof MHS_DEVELOPMENT_PROJECTION_MANIFEST_VERSION;
  readonly phase: "T6L-7A0";
  readonly status: "IMMUTABLE_AUTHORIZED_DEVELOPMENT_TEXT_PROJECTION";
  readonly trustedPurpose: typeof MHS_TRUSTED_DEVELOPMENT_PARTITIONING_PURPOSE;
  readonly datasetVersion: typeof MHS_DATASET_VERSION;
  readonly releaseVersion: typeof MHS_RELEASE_VERSION;
  readonly authorities: { readonly candidateArtifactSha256: typeof MHS_CANDIDATE_ARTIFACT_SHA256; readonly candidateMembershipDigest: typeof MHS_CANDIDATE_MEMBERSHIP_DIGEST; readonly candidateIntegrityArtifactSha256: typeof MHS_CANDIDATE_INTEGRITY_SHA256; readonly splitManifestSha256: typeof MHS_SPLIT_MANIFEST_SHA256; readonly internalTestFreezeSha256: typeof MHS_INTERNAL_TEST_FREEZE_SHA256; readonly rEligibilityPlanSha256: typeof MHS_R_ELIGIBILITY_PLAN_SHA256; readonly releaseManifestSha256: typeof MHS_RELEASE_MANIFEST_SHA256; readonly releaseManifestPayloadDigest: typeof MHS_RELEASE_MANIFEST_PAYLOAD_DIGEST; readonly eligibilityManifestSha256: typeof MHS_ELIGIBILITY_MANIFEST_SHA256; readonly eligibilityManifestPayloadDigest: typeof MHS_ELIGIBILITY_MANIFEST_PAYLOAD_DIGEST };
  readonly projection: { readonly relativePath: typeof MHS_DEVELOPMENT_PROJECTION_FILENAME; readonly sha256: string; readonly payloadDigest: string; readonly recordCount: 73; readonly trainCount: 60; readonly validationCount: 13; readonly ordering: "CANDIDATE_ID_ASCENDING"; readonly exactTextPreserved: true };
  readonly partition: { readonly admittedCandidateCount: 86; readonly developmentCount: 73; readonly protectedCount: 13; readonly intersectionCount: 0; readonly unionCount: 86; readonly missingCount: 0; readonly protectedMembershipDigest: typeof MHS_INTERNAL_TEST_PROTECTED_MEMBERSHIP_DIGEST; readonly protectedTextPublished: false; readonly protectedArtifactCreated: false };
  readonly ordinaryReaderContract: { readonly source: typeof MHS_DEVELOPMENT_PROJECTION_FILENAME; readonly monolithicCandidateAccess: "PROHIBITED"; readonly verifiesProjectionSha: true; readonly rejectsProtectedIdentity: true; readonly rejectsWrongRelease: true };
  readonly provenance: { readonly sourceDataset: "MEASURING_HATE_SPEECH"; readonly sourceRevision: string; readonly licenseIdentifier: "LICENSE.CC_BY_4_0"; readonly releaseManifestIsLicenseAuthority: true };
  readonly protections: { readonly candidateMutations: 0; readonly splitMutations: 0; readonly eligibilityMutations: 0; readonly internalTestTextReturned: false; readonly internalTestTextLogged: false; readonly frozen140Accessed: false; readonly trainingExecuted: false; readonly evaluationExecuted: false };
  readonly generatedAt: string;
}
export interface MhsDevelopmentProjectionManifestArtifact extends MhsDevelopmentProjectionManifestPayload { readonly manifestPayloadDigest: string }

const parseProjection = (contents: string): MhsDevelopmentProjectionRow[] => {
  if (!contents.endsWith("\n")) throw new Error("Malformed development projection");
  try { return contents.slice(0, -1).split("\n").filter(Boolean).map((line) => JSON.parse(line) as MhsDevelopmentProjectionRow); }
  catch { throw new Error("Malformed development projection"); }
};

export const validateMhsDevelopmentProjectionRows = (rows: readonly MhsDevelopmentProjectionRow[], manifest: MhsDevelopmentProjectionManifestArtifact, split: MhsSplitManifestArtifact, eligibility: MhsTrainingEligibilityManifestArtifact, freeze: MhsInternalTestFreezeArtifact): void => {
  const protectedIds = new Set(freeze.protectedCandidateIds); const membership = new Map(split.candidateMembershipIndex.map((row) => [row.candidateId, row])); const eligible = new Map(eligibility.entries.map((row) => [row.candidateId, row]));
  if (rows.length !== 73 || new Set(rows.map((row) => row.exampleId)).size !== 73 || rows.some((row, index) => index > 0 && rows[index - 1].exampleId.localeCompare(row.exampleId) >= 0)) throw new Error("Invalid development projection membership");
  let train = 0; let validation = 0;
  for (const row of rows) {
    if (protectedIds.has(row.exampleId)) throw new Error("Protected identity denied by development projection");
    const assigned = membership.get(row.exampleId); const authority = eligible.get(row.exampleId);
    if (!assigned || !authority || assigned.split !== row.split || authority.split !== row.split || authority.candidateTextDigest !== row.candidateTextDigest || sha256(Buffer.from(row.text, "utf8")) !== row.candidateTextDigest) throw new Error("Development projection authority mismatch");
    if (row.schemaVersion !== MHS_DEVELOPMENT_PROJECTION_SCHEMA || row.projectionVersion !== MHS_DEVELOPMENT_PROJECTION_VERSION || row.policyVersion !== DATASET_POLICY_VERSION || row.datasetVersion !== MHS_DATASET_VERSION || row.releaseVersion !== MHS_RELEASE_VERSION || row.sourceDataset !== "MEASURING_HATE_SPEECH" || !row.text || !row.reasonCode || row.language !== "en" || !["LATIN", "MIXED", "OTHER"].includes(row.script)) throw new Error("Malformed development projection row");
    if (row.split === "TRAIN" && row.developmentStatus === "TRAINING_ELIGIBLE" && authority.eligibility === "TRAINING_ELIGIBLE") train += 1;
    else if (row.split === "VALIDATION" && row.developmentStatus === "VALIDATION_AUTHORIZED" && authority.eligibility === "VALIDATION_AUTHORIZED") validation += 1;
    else throw new Error("Development projection status mismatch");
    if ((row.decision === "ALLOW") !== (row.primaryCategory === null && row.secondaryCategories.length === 0) || !["ALLOW", "BLOCK"].includes(row.decision)) throw new Error("Development projection label mismatch");
  }
  if (train !== 60 || validation !== 13 || manifest.projection.trainCount !== train || manifest.projection.validationCount !== validation) throw new Error("Development projection split count mismatch");
};

export const validateMhsDevelopmentProjectionManifest = (artifact: MhsDevelopmentProjectionManifestArtifact): void => {
  const { manifestPayloadDigest, ...payload } = artifact;
  if (payload.schemaVersion !== MHS_DEVELOPMENT_PROJECTION_MANIFEST_SCHEMA || payload.manifestVersion !== MHS_DEVELOPMENT_PROJECTION_MANIFEST_VERSION || payload.phase !== "T6L-7A0" || payload.status !== "IMMUTABLE_AUTHORIZED_DEVELOPMENT_TEXT_PROJECTION" || payload.trustedPurpose !== MHS_TRUSTED_DEVELOPMENT_PARTITIONING_PURPOSE || payload.datasetVersion !== MHS_DATASET_VERSION || payload.releaseVersion !== MHS_RELEASE_VERSION
    || payload.authorities.candidateArtifactSha256 !== MHS_CANDIDATE_ARTIFACT_SHA256 || payload.authorities.candidateMembershipDigest !== MHS_CANDIDATE_MEMBERSHIP_DIGEST || payload.authorities.candidateIntegrityArtifactSha256 !== MHS_CANDIDATE_INTEGRITY_SHA256 || payload.authorities.splitManifestSha256 !== MHS_SPLIT_MANIFEST_SHA256 || payload.authorities.internalTestFreezeSha256 !== MHS_INTERNAL_TEST_FREEZE_SHA256 || payload.authorities.rEligibilityPlanSha256 !== MHS_R_ELIGIBILITY_PLAN_SHA256 || payload.authorities.releaseManifestSha256 !== MHS_RELEASE_MANIFEST_SHA256 || payload.authorities.releaseManifestPayloadDigest !== MHS_RELEASE_MANIFEST_PAYLOAD_DIGEST || payload.authorities.eligibilityManifestSha256 !== MHS_ELIGIBILITY_MANIFEST_SHA256 || payload.authorities.eligibilityManifestPayloadDigest !== MHS_ELIGIBILITY_MANIFEST_PAYLOAD_DIGEST
    || payload.projection.relativePath !== MHS_DEVELOPMENT_PROJECTION_FILENAME || !/^[a-f0-9]{64}$/.test(payload.projection.sha256) || !/^[a-f0-9]{64}$/.test(payload.projection.payloadDigest) || payload.projection.recordCount !== 73 || payload.projection.trainCount !== 60 || payload.projection.validationCount !== 13 || payload.projection.ordering !== "CANDIDATE_ID_ASCENDING" || !payload.projection.exactTextPreserved
    || payload.partition.admittedCandidateCount !== 86 || payload.partition.developmentCount !== 73 || payload.partition.protectedCount !== 13 || payload.partition.intersectionCount !== 0 || payload.partition.unionCount !== 86 || payload.partition.missingCount !== 0 || payload.partition.protectedMembershipDigest !== MHS_INTERNAL_TEST_PROTECTED_MEMBERSHIP_DIGEST || payload.partition.protectedTextPublished || payload.partition.protectedArtifactCreated
    || payload.ordinaryReaderContract.monolithicCandidateAccess !== "PROHIBITED" || payload.protections.candidateMutations || payload.protections.splitMutations || payload.protections.eligibilityMutations || payload.protections.internalTestTextReturned || payload.protections.internalTestTextLogged || payload.protections.frozen140Accessed || payload.protections.trainingExecuted || payload.protections.evaluationExecuted || !strictInstant(payload.generatedAt) || manifestPayloadDigest !== digest(payload)) throw new Error("Invalid development projection manifest");
};

export interface MhsDevelopmentProjectionAuthorityPaths { readonly splitManifestPath: string; readonly internalTestFreezePath: string; readonly releaseManifestPath: string; readonly eligibilityManifestPath: string }

const readOrdinaryAuthorities = (paths: MhsDevelopmentProjectionAuthorityPaths): { split: MhsSplitManifestArtifact; freeze: MhsInternalTestFreezeArtifact; release: MhsReleaseManifestArtifact; eligibility: MhsTrainingEligibilityManifestArtifact } => {
  const split = readExact<MhsSplitManifestArtifact>(paths.splitManifestPath, MHS_SPLIT_MANIFEST_SHA256, validateMhsSplitManifestArtifact); const freeze = readExact<MhsInternalTestFreezeArtifact>(paths.internalTestFreezePath, MHS_INTERNAL_TEST_FREEZE_SHA256, validateMhsInternalTestFreezeArtifact); const eligibility = readExact<MhsTrainingEligibilityManifestArtifact>(paths.eligibilityManifestPath, MHS_ELIGIBILITY_MANIFEST_SHA256, validateMhsTrainingEligibilityManifestArtifact); const release = readExact<MhsReleaseManifestArtifact>(paths.releaseManifestPath, MHS_RELEASE_MANIFEST_SHA256, (value) => validateMhsReleaseManifestArtifact(value, eligibility)); return { split, freeze, release, eligibility };
};

export const readMhsDevelopmentProjection = (projectionPath: string, manifestPath: string, authorityPaths: MhsDevelopmentProjectionAuthorityPaths): readonly MhsDevelopmentProjectionRow[] => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as MhsDevelopmentProjectionManifestArtifact; validateMhsDevelopmentProjectionManifest(manifest); const authorities = readOrdinaryAuthorities(authorityPaths); if (manifest.releaseVersion !== authorities.release.releaseVersion || manifest.datasetVersion !== authorities.release.datasetVersion) throw new Error("Stale development projection release");
  const bytes = fs.readFileSync(projectionPath); if (sha256(bytes) !== manifest.projection.sha256) throw new Error("Development projection SHA-256 mismatch"); const rows = parseProjection(bytes.toString("utf8")); if (digest(rows) !== manifest.projection.payloadDigest) throw new Error("Development projection payload mismatch"); validateMhsDevelopmentProjectionRows(rows, manifest, authorities.split, authorities.eligibility, authorities.freeze); return rows;
};

export const readMhsDevelopmentProjectionCandidate = (candidateId: string, projectionPath: string, manifestPath: string, authorityPaths: MhsDevelopmentProjectionAuthorityPaths): MhsDevelopmentProjectionRow => {
  const rows = readMhsDevelopmentProjection(projectionPath, manifestPath, authorityPaths); const row = rows.find((item) => item.exampleId === candidateId); if (!row) throw new Error("Candidate is unavailable to ordinary development tooling"); return row;
};

export interface CreateMhsDevelopmentProjectionOptions extends MhsDevelopmentProjectionAuthorityPaths { readonly purpose: typeof MHS_TRUSTED_DEVELOPMENT_PARTITIONING_PURPOSE; readonly candidatePath: string; readonly candidateIntegrityPath: string; readonly rEligibilityPlanPath: string; readonly outputDirectory: string; readonly generatedAt?: string; readonly publishPair?: (projectionTemporaryPath: string, projectionTargetPath: string, manifestTemporaryPath: string, manifestTargetPath: string) => void }

const publishDefault = (projectionTemporaryPath: string, projectionTargetPath: string, manifestTemporaryPath: string, manifestTargetPath: string): void => { fs.renameSync(projectionTemporaryPath, projectionTargetPath); fs.renameSync(manifestTemporaryPath, manifestTargetPath); };
const publishPair = (directory: string, projectionContents: string, manifestContents: string, publish = publishDefault): { projectionPath: string; manifestPath: string } => {
  fs.mkdirSync(directory, { recursive: true }); const projectionPath = path.join(directory, MHS_DEVELOPMENT_PROJECTION_FILENAME); const manifestPath = path.join(directory, MHS_DEVELOPMENT_PROJECTION_MANIFEST_FILENAME); if (fs.existsSync(projectionPath) || fs.existsSync(manifestPath)) throw new Error("Development projection already exists; overwrite refused"); const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`; const projectionTemporaryPath = `${projectionPath}.${token}.partial`; const manifestTemporaryPath = `${manifestPath}.${token}.partial`;
  try { fs.writeFileSync(projectionTemporaryPath, projectionContents, { encoding: "utf8", flag: "wx" }); fs.writeFileSync(manifestTemporaryPath, manifestContents, { encoding: "utf8", flag: "wx" }); publish(projectionTemporaryPath, projectionPath, manifestTemporaryPath, manifestPath); if (!fs.existsSync(projectionPath) || !fs.existsSync(manifestPath)) throw new Error("Incomplete projection publication"); return { projectionPath, manifestPath }; }
  catch (error) { for (const [filename, expected] of [[projectionPath, projectionContents], [manifestPath, manifestContents]] as const) if (fs.existsSync(filename) && fs.readFileSync(filename, "utf8") === expected) fs.rmSync(filename, { force: true }); throw error; }
  finally { for (const filename of [projectionTemporaryPath, manifestTemporaryPath]) fs.rmSync(filename, { force: true }); }
};

export const createMhsDevelopmentProjection = (options: CreateMhsDevelopmentProjectionOptions): { readonly projectionPath: string; readonly projectionSha256: string; readonly manifestPath: string; readonly manifestSha256: string; readonly manifest: MhsDevelopmentProjectionManifestArtifact; readonly protectedCount: 13 } => {
  if (options.purpose !== MHS_TRUSTED_DEVELOPMENT_PARTITIONING_PURPOSE) throw new Error("Trusted projection purpose denied");
  const authorityPaths = [options.candidatePath, options.candidateIntegrityPath, options.splitManifestPath, options.internalTestFreezePath, options.rEligibilityPlanPath, options.releaseManifestPath, options.eligibilityManifestPath]; const before = new Map(authorityPaths.map((filename) => [filename, fs.readFileSync(filename)]));
  const integrity = readExact<MhsCandidateIntegrityAuditArtifact>(options.candidateIntegrityPath, MHS_CANDIDATE_INTEGRITY_SHA256, validateMhsCandidateIntegrityAuditArtifact); const ordinary = readOrdinaryAuthorities(options); const plan = readExact<MhsTrainingEligibilityReleasePlanArtifact>(options.rEligibilityPlanPath, MHS_R_ELIGIBILITY_PLAN_SHA256, validateMhsTrainingEligibilityReleasePlanArtifact);
  const developmentIds = new Set(ordinary.eligibility.entries.filter((row) => row.eligibility === "TRAINING_ELIGIBLE" || row.eligibility === "VALIDATION_AUTHORIZED").map((row) => row.candidateId)); const protectedIds = new Set(ordinary.freeze.protectedCandidateIds); const union = new Set([...developmentIds, ...protectedIds]); if (developmentIds.size !== 73 || protectedIds.size !== 13 || [...developmentIds].some((id) => protectedIds.has(id)) || union.size !== 86 || ordinary.split.candidateMembershipIndex.some((row) => !union.has(row.candidateId)) || plan.counts.trainQualifying !== 60 || plan.counts.validationReady !== 13) throw new Error("Candidate partition authority mismatch");
  // The only explicitly authorized monolithic-content read. Protected rows are validated but never returned, logged, or serialized.
  const candidate = readExact<MhsCandidateAdmissionArtifact>(options.candidatePath, MHS_CANDIDATE_ARTIFACT_SHA256, validateMhsCandidateAdmissionArtifact); const admitted = candidate.rows.filter((row) => row.candidateAdmitted); if (admitted.length !== 86 || new Set(admitted.map((row) => row.sourceRowId)).size !== 86 || admitted.some((row) => !union.has(row.sourceRowId))) throw new Error("Monolithic candidate partition mismatch");
  const integrityById = new Map(integrity.rows.map((row) => [row.sourceRowId, row])); const membershipById = new Map(ordinary.split.candidateMembershipIndex.map((row) => [row.candidateId, row])); const eligibilityById = new Map(ordinary.eligibility.entries.map((row) => [row.candidateId, row]));
  const rows = admitted.filter((row) => developmentIds.has(row.sourceRowId)).map((row): MhsDevelopmentProjectionRow => { const audit = integrityById.get(row.sourceRowId); const membership = membershipById.get(row.sourceRowId); const eligibility = eligibilityById.get(row.sourceRowId); if (!audit || !membership || !eligibility || !row.reviewedText || sha256(Buffer.from(row.reviewedText, "utf8")) !== row.textDigest || audit.textDigest !== row.textDigest || !["TRAIN", "VALIDATION"].includes(membership.split)) throw new Error("Authorized candidate projection mismatch"); return { schemaVersion: MHS_DEVELOPMENT_PROJECTION_SCHEMA, projectionVersion: MHS_DEVELOPMENT_PROJECTION_VERSION, policyVersion: DATASET_POLICY_VERSION, datasetVersion: MHS_DATASET_VERSION, releaseVersion: MHS_RELEASE_VERSION, exampleId: row.sourceRowId, candidateTextDigest: row.textDigest, text: row.reviewedText, decision: row.reviewerDecision as "ALLOW" | "BLOCK", primaryCategory: row.primaryCategory, secondaryCategories: row.secondaryCategories, reasonCode: row.reasonCode, language: audit.language, script: audit.script, sourceDataset: "MEASURING_HATE_SPEECH", sourceRevision: ordinary.release.source.revision, sourceArtifactSha256: ordinary.release.source.acquiredArtifactSha256, split: membership.split as "TRAIN" | "VALIDATION", developmentStatus: eligibility.eligibility as "TRAINING_ELIGIBLE" | "VALIDATION_AUTHORIZED" }; }).sort((a, b) => a.exampleId.localeCompare(b.exampleId));
  const projectionContents = jsonl(rows); const projectionSha256 = sha256(Buffer.from(projectionContents, "utf8")); const projectionPayloadDigest = digest(rows); const generatedAt = options.generatedAt ?? new Date().toISOString();
  const payload: MhsDevelopmentProjectionManifestPayload = { schemaVersion: MHS_DEVELOPMENT_PROJECTION_MANIFEST_SCHEMA, manifestVersion: MHS_DEVELOPMENT_PROJECTION_MANIFEST_VERSION, phase: "T6L-7A0", status: "IMMUTABLE_AUTHORIZED_DEVELOPMENT_TEXT_PROJECTION", trustedPurpose: MHS_TRUSTED_DEVELOPMENT_PARTITIONING_PURPOSE, datasetVersion: MHS_DATASET_VERSION, releaseVersion: MHS_RELEASE_VERSION, authorities: { candidateArtifactSha256: MHS_CANDIDATE_ARTIFACT_SHA256, candidateMembershipDigest: MHS_CANDIDATE_MEMBERSHIP_DIGEST, candidateIntegrityArtifactSha256: MHS_CANDIDATE_INTEGRITY_SHA256, splitManifestSha256: MHS_SPLIT_MANIFEST_SHA256, internalTestFreezeSha256: MHS_INTERNAL_TEST_FREEZE_SHA256, rEligibilityPlanSha256: MHS_R_ELIGIBILITY_PLAN_SHA256, releaseManifestSha256: MHS_RELEASE_MANIFEST_SHA256, releaseManifestPayloadDigest: MHS_RELEASE_MANIFEST_PAYLOAD_DIGEST, eligibilityManifestSha256: MHS_ELIGIBILITY_MANIFEST_SHA256, eligibilityManifestPayloadDigest: MHS_ELIGIBILITY_MANIFEST_PAYLOAD_DIGEST }, projection: { relativePath: MHS_DEVELOPMENT_PROJECTION_FILENAME, sha256: projectionSha256, payloadDigest: projectionPayloadDigest, recordCount: 73, trainCount: 60, validationCount: 13, ordering: "CANDIDATE_ID_ASCENDING", exactTextPreserved: true }, partition: { admittedCandidateCount: 86, developmentCount: 73, protectedCount: 13, intersectionCount: 0, unionCount: 86, missingCount: 0, protectedMembershipDigest: MHS_INTERNAL_TEST_PROTECTED_MEMBERSHIP_DIGEST, protectedTextPublished: false, protectedArtifactCreated: false }, ordinaryReaderContract: { source: MHS_DEVELOPMENT_PROJECTION_FILENAME, monolithicCandidateAccess: "PROHIBITED", verifiesProjectionSha: true, rejectsProtectedIdentity: true, rejectsWrongRelease: true }, provenance: { sourceDataset: "MEASURING_HATE_SPEECH", sourceRevision: ordinary.release.source.revision, licenseIdentifier: "LICENSE.CC_BY_4_0", releaseManifestIsLicenseAuthority: true }, protections: { candidateMutations: 0, splitMutations: 0, eligibilityMutations: 0, internalTestTextReturned: false, internalTestTextLogged: false, frozen140Accessed: false, trainingExecuted: false, evaluationExecuted: false }, generatedAt };
  const manifest: MhsDevelopmentProjectionManifestArtifact = { ...payload, manifestPayloadDigest: digest(payload) }; validateMhsDevelopmentProjectionManifest(manifest); validateMhsDevelopmentProjectionRows(rows, manifest, ordinary.split, ordinary.eligibility, ordinary.freeze); for (const filename of authorityPaths) if (!before.get(filename)!.equals(fs.readFileSync(filename))) throw new Error("Upstream authority mutation detected"); const manifestContents = canonicalJson(manifest); const published = publishPair(options.outputDirectory, projectionContents, manifestContents, options.publishPair); return { ...published, projectionSha256, manifestSha256: sha256(Buffer.from(manifestContents, "utf8")), manifest, protectedCount: 13 };
};
