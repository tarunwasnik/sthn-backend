import fs from "node:fs";
import path from "node:path";
import { TEXT_DUPLICATE_NORMALIZATION_VERSION, textDuplicateFingerprint } from "./identity";
import { canonicalJson, sha256 } from "./manifest";
import {
  MHS_CANDIDATE_ADMISSION_POLICY_VERSION, MHS_CANDIDATE_ADMISSION_SCHEMA_VERSION, MHS_CANDIDATE_ARTIFACT_FILENAME,
  MHS_REVIEW_PARENT_ARTIFACT_SHA256, MHS_REVIEW_RESOLUTION_ARTIFACT_SHA256, MHS_REVIEW_RESOLUTION_PAYLOAD_DIGEST,
  MhsCandidateAdmissionArtifact, MhsCandidateAdmissionRow, validateMhsCandidateAdmissionArtifact,
} from "./mhsCandidateAdmission";
import { MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST, MHS_REVIEW_PILOT_VERSION, selectMhsReviewPilot } from "./mhsReviewPilot";
import {
  MHS_REVIEWER_A_ARTIFACT_SHA256, MHS_REVIEWER_A_PAYLOAD_DIGEST, MhsReviewResolutionArtifact,
  validateMhsReviewResolutionArtifact,
} from "./mhsReviewResolution";
import { MhsPilotReviewImportArtifact, validateMhsPilotReviewImportArtifact, writeImmutableFileAtomic } from "./mhsReviewImport";
import {
  MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST, MHS_REVIEW_TRANCHE_SIZE, MHS_REVIEW_TRANCHE_VERSION,
  MhsReviewTrancheRow, mhsReviewTrancheMembershipDigest, validateMhsReviewTrancheRow,
} from "./mhsReviewTranche";
import { LICENSE_REGISTRY_VERSION, SOURCE_REGISTRY_VERSION } from "./contracts";
import { licenseRegistry, sourceRegistry } from "./registries";

export const MHS_CANDIDATE_INTEGRITY_AUDIT_SCHEMA_VERSION = "STHN_TEXT_MODERATION_MHS_CANDIDATE_INTEGRITY_AUDIT_V1" as const;
export const MHS_CANDIDATE_INTEGRITY_AUDIT_VERSION = "STHN_TEXT_MODERATION_MHS_CANDIDATE_INTEGRITY_AUDIT_POLICY_V1" as const;
export const MHS_CANDIDATE_ARTIFACT_SHA256 = "e8fa8da4042f3b87f7eba39e51671f7a21656a167c52f4801bb1429399ba1b5b" as const;
export const MHS_CANDIDATE_PAYLOAD_DIGEST = "057baabdf87399e8aa575d79b1eaa2f5ac7bbddb37f501c04ddd3b89b81b1d56" as const;
export const MHS_CANDIDATE_AUDIT_FILENAME = "mhs-review-pilot-v1-candidate-v1-integrity-audit.json" as const;
export const MHS_SOURCE_CANDIDATE_ARTIFACT_PATH = `candidates/${MHS_CANDIDATE_ARTIFACT_FILENAME}` as const;
export const MHS_AUDITED_CANDIDATE_COUNT = 86 as const;
export const MHS_SEMANTIC_AUDIT_STATUS = "BLOCKED_BY_MISSING_TOOLING" as const;
export const MHS_CONTAMINATION_AUDIT_STATUS = "FROZEN_BENCHMARK_CONTAMINATION_CHECK_DEFERRED" as const;

/** Contract for a future explicitly authorized detector; T6L-6J-E supplies no implementation. */
export interface MhsSemanticNearDuplicateDetector {
  readonly providerId: string;
  readonly providerVersion: string;
  compare(candidateTexts: readonly string[]): Promise<readonly { leftIndex: number; rightIndex: number; similarity: number }[]>;
}

export interface MhsCandidateIntegrityAuditRow {
  readonly pilotRowNumber: number;
  readonly sourceRowId: string;
  readonly commentId: string;
  readonly textDigest: string;
  readonly exactTextDigest: string;
  readonly normalizedFingerprint: string;
  readonly exactDuplicateGroupId: string | null;
  readonly normalizedDuplicateGroupId: string | null;
  readonly lineageRootId: string;
  readonly lineageGroupId: string | null;
  readonly transformationCount: number;
  readonly sourceId: "MEASURING_HATE_SPEECH";
  readonly sourceVersion: string;
  readonly sourceRevision: string;
  readonly sourceLicense: string;
  readonly language: "en";
  readonly script: "LATIN" | "MIXED" | "OTHER";
  readonly sourceScoreBand: "HIGH_SCORE" | "LOW_SCORE" | "MIDDLE_SCORE";
  readonly targetIdentityFamilies: readonly string[];
  readonly reviewerDecision: MhsCandidateAdmissionRow["reviewerDecision"];
  readonly primaryCategory: MhsCandidateAdmissionRow["primaryCategory"];
  readonly secondaryCategories: MhsCandidateAdmissionRow["secondaryCategories"];
  readonly reasonCode: MhsCandidateAdmissionRow["reasonCode"];
  readonly candidateState: "ADMITTED_ALLOW" | "ADMITTED_BLOCK";
  readonly candidateAdmitted: true;
  readonly trainingEligible: false;
}

export interface MhsDuplicateAuditGroup {
  readonly groupId: string;
  readonly fingerprint: string;
  readonly groupSize: number;
  readonly memberSourceRowIds: readonly string[];
  readonly decisionCounts: Readonly<Record<string, number>>;
  readonly categoryCounts: Readonly<Record<string, number>>;
  readonly conflictFlag: "LABEL_CONFLICT_EXACT_DUPLICATE" | "LABEL_CONFLICT_NORMALIZED_DUPLICATE" | null;
}

export interface MhsCandidateIntegrityAuditPayload {
  readonly schemaVersion: typeof MHS_CANDIDATE_INTEGRITY_AUDIT_SCHEMA_VERSION;
  readonly auditVersion: typeof MHS_CANDIDATE_INTEGRITY_AUDIT_VERSION;
  readonly normalizationVersion: typeof TEXT_DUPLICATE_NORMALIZATION_VERSION;
  readonly sourceCandidateArtifactPath: typeof MHS_SOURCE_CANDIDATE_ARTIFACT_PATH;
  readonly sourceCandidateArtifactSha256: typeof MHS_CANDIDATE_ARTIFACT_SHA256;
  readonly sourceCandidatePayloadDigest: typeof MHS_CANDIDATE_PAYLOAD_DIGEST;
  readonly sourceCandidateSchemaVersion: typeof MHS_CANDIDATE_ADMISSION_SCHEMA_VERSION;
  readonly sourceCandidatePolicyVersion: typeof MHS_CANDIDATE_ADMISSION_POLICY_VERSION;
  readonly sourceResolutionArtifactSha256: typeof MHS_REVIEW_RESOLUTION_ARTIFACT_SHA256;
  readonly sourceResolutionPayloadDigest: typeof MHS_REVIEW_RESOLUTION_PAYLOAD_DIGEST;
  readonly sourceReviewerArtifactSha256: typeof MHS_REVIEWER_A_ARTIFACT_SHA256;
  readonly sourceReviewerPayloadDigest: typeof MHS_REVIEWER_A_PAYLOAD_DIGEST;
  readonly parentArtifactSha256: typeof MHS_REVIEW_PARENT_ARTIFACT_SHA256;
  readonly pilotVersion: typeof MHS_REVIEW_PILOT_VERSION;
  readonly parentTrancheVersion: typeof MHS_REVIEW_TRANCHE_VERSION;
  readonly pilotMembershipDigest: typeof MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST;
  readonly parentTrancheMembershipDigest: typeof MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST;
  readonly sourceRegistryVersion: typeof SOURCE_REGISTRY_VERSION;
  readonly licenseRegistryVersion: typeof LICENSE_REGISTRY_VERSION;
  readonly generatedAt: string;
  readonly admittedRowCount: typeof MHS_AUDITED_CANDIDATE_COUNT;
  readonly exactDuplicateGroups: readonly MhsDuplicateAuditGroup[];
  readonly normalizedDuplicateGroups: readonly MhsDuplicateAuditGroup[];
  readonly semanticAudit: { readonly status: typeof MHS_SEMANTIC_AUDIT_STATUS; readonly detectorAvailable: false; readonly groupCount: 0; readonly plan: string };
  readonly lineageAudit: { readonly sharedLineageGroupCount: number; readonly rowsInSharedLineageGroups: number; readonly sourceGroupCount: 1; readonly templateFamilyStatus: "NOT_AVAILABLE"; readonly threadGroupStatus: "NOT_AVAILABLE"; readonly generationBatchStatus: "NOT_APPLICABLE" };
  readonly contaminationAudit: { readonly status: typeof MHS_CONTAMINATION_AUDIT_STATUS; readonly protectedInterfaceAvailable: false; readonly findingsCount: 0; readonly findings: readonly []; readonly copiedBenchmarkText: false };
  readonly summary: {
    readonly exactDuplicateGroupCount: number; readonly rowsInExactDuplicateGroups: number; readonly exactLabelConflictCount: number;
    readonly normalizedDuplicateGroupCount: number; readonly rowsInNormalizedDuplicateGroups: number; readonly normalizedLabelConflictCount: number;
    readonly decisionCounts: Readonly<Record<string, number>>; readonly primaryCategoryCounts: Readonly<Record<string, number>>;
    readonly secondaryCategoryCounts: Readonly<Record<string, number>>; readonly reasonCodeCounts: Readonly<Record<string, number>>;
    readonly sourceCounts: Readonly<Record<string, number>>; readonly targetIdentityFamilyCounts: Readonly<Record<string, number>>;
    readonly languageCounts: Readonly<Record<string, number>>; readonly scriptCounts: Readonly<Record<string, number>>;
    readonly sourceScoreBandCounts: Readonly<Record<string, number>>; readonly duplicateGroupSizeCounts: Readonly<Record<string, number>>;
    readonly trainingEligible: 0;
  };
  readonly rows: readonly MhsCandidateIntegrityAuditRow[];
}

export interface MhsCandidateIntegrityAuditArtifact extends MhsCandidateIntegrityAuditPayload { readonly auditPayloadDigest: string; }

type AtomicPublisher = (temporaryPath: string, targetPath: string) => void;
export interface CreateMhsCandidateIntegrityAuditOptions {
  readonly candidateArtifactPath: string; readonly resolutionArtifactPath: string; readonly reviewerArtifactPath: string;
  readonly parentTranchePath: string; readonly outputDirectory: string; readonly generatedAt?: string; readonly publishAtomic?: AtomicPublisher;
}

const tally = (values: readonly string[]): Readonly<Record<string, number>> => Object.fromEntries([...new Set(values)].sort().map((key) => [key, values.filter((value) => value === key).length]));
const scriptOf = (text: string): MhsCandidateIntegrityAuditRow["script"] => {
  const latin = /[A-Za-z]/u.test(text); const nonLatinLetter = /[^\p{Script=Latin}\p{Number}\p{Punctuation}\p{Separator}\p{Symbol}]/u.test(text);
  return latin && nonLatinLetter ? "MIXED" : latin ? "LATIN" : "OTHER";
};
const groupId = (kind: "exact" | "normalized" | "lineage", fingerprint: string): string => `${kind}_${sha256(Buffer.from(`${kind}:${fingerprint}`, "utf8"))}`;
const bucketCounts = (values: readonly string[]): Map<string, number> => { const result = new Map<string, number>(); values.forEach((value) => result.set(value, (result.get(value) ?? 0) + 1)); return result; };
const sourceScoreBand = (row: MhsReviewTrancheRow): MhsCandidateIntegrityAuditRow["sourceScoreBand"] => {
  const value = ["HIGH_SCORE", "LOW_SCORE", "MIDDLE_SCORE"].find((band) => row.membershipStrata.includes(band as any));
  if (!value) throw new Error(`Missing source score band for ${row.sourceRowId}`); return value as MhsCandidateIntegrityAuditRow["sourceScoreBand"];
};

export const buildMhsDuplicateAuditGroups = (rows: readonly MhsCandidateIntegrityAuditRow[], kind: "exact" | "normalized"): readonly MhsDuplicateAuditGroup[] => {
  const key = kind === "exact" ? "exactTextDigest" : "normalizedFingerprint"; const buckets = new Map<string, MhsCandidateIntegrityAuditRow[]>();
  rows.forEach((row) => buckets.set(row[key], [...(buckets.get(row[key]) ?? []), row]));
  return [...buckets.entries()].filter(([, members]) => members.length > 1).sort(([left], [right]) => left.localeCompare(right)).map(([fingerprint, members]) => {
    const decisions = tally(members.map((row) => row.reviewerDecision)); const categories = tally(members.flatMap((row) => row.primaryCategory ? [row.primaryCategory, ...row.secondaryCategories] : []));
    return { groupId: groupId(kind, fingerprint), fingerprint, groupSize: members.length, memberSourceRowIds: members.map((row) => row.sourceRowId).sort(),
      decisionCounts: decisions, categoryCounts: categories, conflictFlag: Object.keys(decisions).length > 1 ? kind === "exact" ? "LABEL_CONFLICT_EXACT_DUPLICATE" : "LABEL_CONFLICT_NORMALIZED_DUPLICATE" : null };
  });
};

const summaryOf = (rows: readonly MhsCandidateIntegrityAuditRow[], exact: readonly MhsDuplicateAuditGroup[], normalized: readonly MhsDuplicateAuditGroup[]) => ({
  exactDuplicateGroupCount: exact.length, rowsInExactDuplicateGroups: exact.reduce((sum, group) => sum + group.groupSize, 0), exactLabelConflictCount: exact.filter((group) => group.conflictFlag).length,
  normalizedDuplicateGroupCount: normalized.length, rowsInNormalizedDuplicateGroups: normalized.reduce((sum, group) => sum + group.groupSize, 0), normalizedLabelConflictCount: normalized.filter((group) => group.conflictFlag).length,
  decisionCounts: tally(rows.map((row) => row.reviewerDecision)), primaryCategoryCounts: tally(rows.flatMap((row) => row.primaryCategory ? [row.primaryCategory] : [])),
  secondaryCategoryCounts: tally(rows.flatMap((row) => row.secondaryCategories)), reasonCodeCounts: tally(rows.map((row) => row.reasonCode)),
  sourceCounts: tally(rows.map((row) => row.sourceId)), targetIdentityFamilyCounts: tally(rows.flatMap((row) => row.targetIdentityFamilies.length ? row.targetIdentityFamilies : ["NO_CLEAR_PROTECTED_TARGET"])),
  languageCounts: tally(rows.map((row) => row.language)), scriptCounts: tally(rows.map((row) => row.script)), sourceScoreBandCounts: tally(rows.map((row) => row.sourceScoreBand)),
  duplicateGroupSizeCounts: tally(rows.map((row) => row.exactDuplicateGroupId ? "EXACT_DUPLICATE_MEMBER" : row.normalizedDuplicateGroupId ? "NORMALIZED_ONLY_DUPLICATE_MEMBER" : "SINGLETON")), trainingEligible: 0 as const,
});
const payloadDigest = (payload: MhsCandidateIntegrityAuditPayload): string => sha256(Buffer.from(canonicalJson(payload), "utf8"));

export const validateMhsCandidateIntegrityAuditArtifact = (artifact: MhsCandidateIntegrityAuditArtifact): void => {
  const { auditPayloadDigest, ...payload } = artifact;
  if (payload.schemaVersion !== MHS_CANDIDATE_INTEGRITY_AUDIT_SCHEMA_VERSION || payload.auditVersion !== MHS_CANDIDATE_INTEGRITY_AUDIT_VERSION
    || payload.normalizationVersion !== TEXT_DUPLICATE_NORMALIZATION_VERSION || payload.sourceCandidateArtifactPath !== MHS_SOURCE_CANDIDATE_ARTIFACT_PATH
    || payload.sourceCandidateArtifactSha256 !== MHS_CANDIDATE_ARTIFACT_SHA256 || payload.sourceCandidatePayloadDigest !== MHS_CANDIDATE_PAYLOAD_DIGEST
    || payload.sourceResolutionArtifactSha256 !== MHS_REVIEW_RESOLUTION_ARTIFACT_SHA256 || payload.sourceResolutionPayloadDigest !== MHS_REVIEW_RESOLUTION_PAYLOAD_DIGEST
    || payload.sourceReviewerArtifactSha256 !== MHS_REVIEWER_A_ARTIFACT_SHA256 || payload.sourceReviewerPayloadDigest !== MHS_REVIEWER_A_PAYLOAD_DIGEST
    || payload.parentArtifactSha256 !== MHS_REVIEW_PARENT_ARTIFACT_SHA256 || payload.admittedRowCount !== MHS_AUDITED_CANDIDATE_COUNT
    || payload.rows.length !== MHS_AUDITED_CANDIDATE_COUNT || !Number.isFinite(Date.parse(payload.generatedAt))) throw new Error("Invalid MHS candidate integrity audit identity");
  if (new Set(payload.rows.map((row) => row.sourceRowId)).size !== MHS_AUDITED_CANDIDATE_COUNT || new Set(payload.rows.map((row) => row.commentId)).size !== MHS_AUDITED_CANDIDATE_COUNT) throw new Error("Duplicate candidate audit identities");
  if (payload.rows.some((row) => !row.candidateAdmitted || !["ADMITTED_ALLOW", "ADMITTED_BLOCK"].includes(row.candidateState) || row.trainingEligible !== false || row.exactTextDigest !== row.textDigest)) throw new Error("Blocked or altered candidate entered audit membership");
  if (payload.semanticAudit.status !== MHS_SEMANTIC_AUDIT_STATUS || payload.semanticAudit.detectorAvailable !== false || payload.semanticAudit.groupCount !== 0) throw new Error("Semantic audit tooling boundary changed");
  if (payload.contaminationAudit.status !== MHS_CONTAMINATION_AUDIT_STATUS || payload.contaminationAudit.protectedInterfaceAvailable !== false || payload.contaminationAudit.findingsCount !== 0 || payload.contaminationAudit.findings.length || payload.contaminationAudit.copiedBenchmarkText) throw new Error("Frozen benchmark boundary changed");
  const exact = buildMhsDuplicateAuditGroups(payload.rows, "exact"); const normalized = buildMhsDuplicateAuditGroups(payload.rows, "normalized");
  if (canonicalJson(payload.exactDuplicateGroups) !== canonicalJson(exact) || canonicalJson(payload.normalizedDuplicateGroups) !== canonicalJson(normalized)
    || canonicalJson(payload.summary) !== canonicalJson(summaryOf(payload.rows, exact, normalized))) throw new Error("Candidate integrity audit summary mismatch");
  if (auditPayloadDigest !== payloadDigest(payload)) throw new Error("Candidate integrity audit payload mismatch");
};

const verifyJsonArtifact = <T>(filename: string, expectedHash: string, validate: (artifact: T) => void): T => {
  const bytes = fs.readFileSync(filename); if (sha256(bytes) !== expectedHash) throw new Error(`Artifact SHA-256 mismatch: ${path.basename(filename)}`);
  const artifact = JSON.parse(bytes.toString("utf8")) as T; validate(artifact); return artifact;
};

export const createMhsCandidateIntegrityAudit = (options: CreateMhsCandidateIntegrityAuditOptions): { readonly artifactPath: string; readonly artifactSha256: string; readonly artifact: MhsCandidateIntegrityAuditArtifact } => {
  const candidate = verifyJsonArtifact<MhsCandidateAdmissionArtifact>(options.candidateArtifactPath, MHS_CANDIDATE_ARTIFACT_SHA256, validateMhsCandidateAdmissionArtifact);
  if (candidate.candidatePayloadDigest !== MHS_CANDIDATE_PAYLOAD_DIGEST || candidate.admittedCount !== MHS_AUDITED_CANDIDATE_COUNT) throw new Error("Candidate payload digest or admitted count mismatch");
  const resolution = verifyJsonArtifact<MhsReviewResolutionArtifact>(options.resolutionArtifactPath, MHS_REVIEW_RESOLUTION_ARTIFACT_SHA256, validateMhsReviewResolutionArtifact);
  const reviewer = verifyJsonArtifact<MhsPilotReviewImportArtifact>(options.reviewerArtifactPath, MHS_REVIEWER_A_ARTIFACT_SHA256, validateMhsPilotReviewImportArtifact);
  if (resolution.resolutionPayloadDigest !== MHS_REVIEW_RESOLUTION_PAYLOAD_DIGEST || reviewer.payloadIntegrityDigest !== MHS_REVIEWER_A_PAYLOAD_DIGEST) throw new Error("Review provenance digest mismatch");
  const parentBytes = fs.readFileSync(options.parentTranchePath); if (sha256(parentBytes) !== MHS_REVIEW_PARENT_ARTIFACT_SHA256) throw new Error("Frozen parent artifact SHA-256 mismatch");
  const parent = parentBytes.toString("utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as MhsReviewTrancheRow);
  if (parent.length !== MHS_REVIEW_TRANCHE_SIZE) throw new Error("Frozen parent tranche row count mismatch"); parent.forEach(validateMhsReviewTrancheRow);
  if (mhsReviewTrancheMembershipDigest(parent) !== MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST) throw new Error("Frozen parent membership mismatch");
  const pilot = selectMhsReviewPilot(parent); const parentById = new Map(parent.map((row) => [row.sourceRowId, row]));
  const admitted = candidate.rows.filter((row) => row.candidateAdmitted);
  if (admitted.length !== MHS_AUDITED_CANDIDATE_COUNT || candidate.rows.some((row) => !row.candidateAdmitted && ["ADMITTED_ALLOW", "ADMITTED_BLOCK"].includes(row.candidateState))) throw new Error("Candidate audit membership is invalid");
  const exactCounts = bucketCounts(admitted.map((row) => sha256(Buffer.from(row.reviewedText!, "utf8"))));
  const normalizedCounts = bucketCounts(admitted.map((row) => textDuplicateFingerprint(row.reviewedText!)));
  const lineageCounts = bucketCounts(admitted.map((row) => parentById.get(row.sourceRowId)?.lineageRootId ?? ""));
  const source = sourceRegistry.MEASURING_HATE_SPEECH; const license = licenseRegistry[source.sourceTextLicenseKey];
  if (!source.approvedForTraining || !license || source.revision !== parent[0].sourceRevision) throw new Error("MHS registry or license provenance is incomplete");
  const rows: MhsCandidateIntegrityAuditRow[] = admitted.map((row) => {
    const frozen = pilot[row.pilotRowNumber - 1]; const parentRow = parentById.get(row.sourceRowId); const resolved = resolution.rows[row.pilotRowNumber - 1]; const reviewed = reviewer.reviews[row.pilotRowNumber - 1];
    if (!frozen || !parentRow || !resolved || !reviewed || row.sourceRowId !== frozen.sourceRowId || row.commentId !== frozen.commentId || row.textDigest !== frozen.textDigest
      || row.reviewedText !== frozen.text || resolved.sourceRowId !== row.sourceRowId || reviewed.sourceRowId !== row.sourceRowId
      || resolved.reviewerDecision !== row.reviewerDecision || reviewed.review.decision !== row.reviewerDecision || resolved.piiDisposition !== "NONE"
      || resolved.resolutionState !== (row.reviewerDecision === "ALLOW" ? "RESOLVED_ALLOW" : "RESOLVED_BLOCK")) throw new Error(`Broken admitted candidate provenance at pilot row ${row.pilotRowNumber}`);
    const exactTextDigest = sha256(Buffer.from(row.reviewedText, "utf8")); const normalizedFingerprint = textDuplicateFingerprint(row.reviewedText);
    const lineageRootId = parentRow.lineageRootId || parentRow.sourceRowId; const targetFamilies = [...parentRow.sourceEvidenceSummary.target.protectedFamilies].sort();
    return { pilotRowNumber: row.pilotRowNumber, sourceRowId: row.sourceRowId, commentId: row.commentId, textDigest: row.textDigest, exactTextDigest, normalizedFingerprint,
      exactDuplicateGroupId: (exactCounts.get(exactTextDigest) ?? 0) > 1 ? groupId("exact", exactTextDigest) : null,
      normalizedDuplicateGroupId: (normalizedCounts.get(normalizedFingerprint) ?? 0) > 1 ? groupId("normalized", normalizedFingerprint) : null,
      lineageRootId, lineageGroupId: (lineageCounts.get(lineageRootId) ?? 0) > 1 ? groupId("lineage", lineageRootId) : null,
      transformationCount: parentRow.transformationHistory.length, sourceId: "MEASURING_HATE_SPEECH", sourceVersion: source.version, sourceRevision: source.revision,
      sourceLicense: source.sourceTextLicenseKey, language: "en", script: scriptOf(row.reviewedText), sourceScoreBand: sourceScoreBand(parentRow), targetIdentityFamilies: targetFamilies,
      reviewerDecision: row.reviewerDecision, primaryCategory: row.primaryCategory, secondaryCategories: [...row.secondaryCategories], reasonCode: row.reasonCode,
      candidateState: row.candidateState as "ADMITTED_ALLOW" | "ADMITTED_BLOCK", candidateAdmitted: true, trainingEligible: false };
  });
  const exactDuplicateGroups = buildMhsDuplicateAuditGroups(rows, "exact"); const normalizedDuplicateGroups = buildMhsDuplicateAuditGroups(rows, "normalized");
  const sharedLineage = [...new Set(rows.map((row) => row.lineageGroupId).filter((value): value is string => value !== null))];
  const generatedAt = options.generatedAt ?? new Date().toISOString(); if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("Audit timestamp is invalid");
  const payload: MhsCandidateIntegrityAuditPayload = {
    schemaVersion: MHS_CANDIDATE_INTEGRITY_AUDIT_SCHEMA_VERSION, auditVersion: MHS_CANDIDATE_INTEGRITY_AUDIT_VERSION, normalizationVersion: TEXT_DUPLICATE_NORMALIZATION_VERSION,
    sourceCandidateArtifactPath: MHS_SOURCE_CANDIDATE_ARTIFACT_PATH, sourceCandidateArtifactSha256: MHS_CANDIDATE_ARTIFACT_SHA256, sourceCandidatePayloadDigest: MHS_CANDIDATE_PAYLOAD_DIGEST,
    sourceCandidateSchemaVersion: MHS_CANDIDATE_ADMISSION_SCHEMA_VERSION, sourceCandidatePolicyVersion: MHS_CANDIDATE_ADMISSION_POLICY_VERSION,
    sourceResolutionArtifactSha256: MHS_REVIEW_RESOLUTION_ARTIFACT_SHA256, sourceResolutionPayloadDigest: MHS_REVIEW_RESOLUTION_PAYLOAD_DIGEST,
    sourceReviewerArtifactSha256: MHS_REVIEWER_A_ARTIFACT_SHA256, sourceReviewerPayloadDigest: MHS_REVIEWER_A_PAYLOAD_DIGEST,
    parentArtifactSha256: MHS_REVIEW_PARENT_ARTIFACT_SHA256, pilotVersion: MHS_REVIEW_PILOT_VERSION, parentTrancheVersion: MHS_REVIEW_TRANCHE_VERSION,
    pilotMembershipDigest: MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST, parentTrancheMembershipDigest: MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST,
    sourceRegistryVersion: SOURCE_REGISTRY_VERSION, licenseRegistryVersion: LICENSE_REGISTRY_VERSION, generatedAt, admittedRowCount: MHS_AUDITED_CANDIDATE_COUNT,
    exactDuplicateGroups, normalizedDuplicateGroups,
    semanticAudit: { status: MHS_SEMANTIC_AUDIT_STATUS, detectorAvailable: false, groupCount: 0, plan: "A later authorized phase may supply a versioned text-embedding detector and explicit similarity threshold." },
    lineageAudit: { sharedLineageGroupCount: sharedLineage.length, rowsInSharedLineageGroups: rows.filter((row) => row.lineageGroupId).length, sourceGroupCount: 1,
      templateFamilyStatus: "NOT_AVAILABLE", threadGroupStatus: "NOT_AVAILABLE", generationBatchStatus: "NOT_APPLICABLE" },
    contaminationAudit: { status: MHS_CONTAMINATION_AUDIT_STATUS, protectedInterfaceAvailable: false, findingsCount: 0, findings: [], copiedBenchmarkText: false },
    summary: summaryOf(rows, exactDuplicateGroups, normalizedDuplicateGroups), rows,
  };
  const artifact: MhsCandidateIntegrityAuditArtifact = { ...payload, auditPayloadDigest: payloadDigest(payload) }; validateMhsCandidateIntegrityAuditArtifact(artifact);
  const serialized = canonicalJson(artifact); const artifactPath = path.join(options.outputDirectory, MHS_CANDIDATE_AUDIT_FILENAME);
  writeImmutableFileAtomic(artifactPath, serialized, options.publishAtomic);
  return { artifactPath, artifactSha256: sha256(Buffer.from(serialized, "utf8")), artifact };
};
