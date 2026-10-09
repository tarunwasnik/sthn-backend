import fs from "node:fs";
import path from "node:path";
import { canonicalJson, sha256 } from "./manifest";
import {
  MHS_CANDIDATE_ARTIFACT_FILENAME, MhsCandidateAdmissionArtifact, validateMhsCandidateAdmissionArtifact,
} from "./mhsCandidateAdmission";
import {
  MHS_CANDIDATE_ARTIFACT_SHA256, MHS_CANDIDATE_AUDIT_FILENAME, MHS_CANDIDATE_INTEGRITY_AUDIT_SCHEMA_VERSION,
  MHS_CANDIDATE_PAYLOAD_DIGEST, MhsCandidateIntegrityAuditArtifact, validateMhsCandidateIntegrityAuditArtifact,
} from "./mhsCandidateIntegrityAudit";
import { TEXT_DUPLICATE_NORMALIZATION_VERSION } from "./identity";
import { writeImmutableFileAtomic } from "./mhsReviewImport";

export const MHS_PROTECTED_CONTAMINATION_AUDIT_SCHEMA_VERSION = "STHN_TEXT_MODERATION_MHS_PROTECTED_CONTAMINATION_AUDIT_V1" as const;
export const MHS_PROTECTED_CONTAMINATION_POLICY_VERSION = "STHN_TEXT_MODERATION_MHS_PROTECTED_CONTAMINATION_POLICY_V1" as const;
export const MHS_INTEGRITY_AUDIT_ARTIFACT_SHA256 = "6d6cb13ddfe6f832fcd9e25899310a62dd0bd1498be022d4f3675d6076188383" as const;
export const MHS_INTEGRITY_AUDIT_PAYLOAD_DIGEST = "b74c6c10a84bb8d88ce3fa3782b1c113767d398194ca0a2ed38f5d2049fd7b66" as const;
export const MHS_CONTAMINATION_AUDIT_FILENAME = "mhs-review-pilot-v1-candidate-v1-contamination-audit.json" as const;
export const MHS_SEMANTIC_TOOLING_EVALUATION_VERSION = "STHN_TEXT_MODERATION_SEMANTIC_TOOLING_EVALUATION_V1" as const;
export const MHS_SEMANTIC_TOOLING_STATUS = "SEMANTIC_TOOLING_REQUIRES_FUTURE_ACQUISITION" as const;
/** Opaque authority binding keeps the protected fixture version literal outside research modules. */
export const MHS_PROTECTED_FIXTURE_VERSION_DIGEST = "12b6163bc7dcb7a0cf1965b2531ff021e2ee3f9d50d7bef807b94cb725ae079e" as const;

export interface ProtectedDetectorInput { readonly candidateRowId: string; readonly candidateTextDigest: string; readonly text: string; }
export interface ProtectedDetectorFinding {
  readonly candidateRowId: string; readonly candidateTextDigest: string; readonly fixtureOpaqueId: string; readonly fixtureFingerprint: string;
  readonly comparisonType: "EXACT_MATCH" | "NORMALIZED_MATCH" | "FUZZY_CHAR_TRIGRAM_JACCARD"; readonly matched: true;
  readonly similarity: number; readonly threshold: number; readonly detectorVersion: string; readonly disposition: "POTENTIAL_CONTAMINATION_REVIEW_REQUIRED";
}
export interface ProtectedDetectorResult {
  readonly detectorVersion: string; readonly fixtureVersion: string;
  readonly fixturePublishedSha256: "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747"; readonly fixtureCount: 140;
  readonly normalizationVersion: typeof TEXT_DUPLICATE_NORMALIZATION_VERSION; readonly fuzzyDetectorVersion: string;
  readonly fuzzyThreshold: 0.9; readonly fuzzyMinimumNormalizedLength: 20; readonly comparedCandidateCount: number;
  readonly findings: readonly ProtectedDetectorFinding[];
}

export interface MhsProtectedContaminationAuditPayload {
  readonly schemaVersion: typeof MHS_PROTECTED_CONTAMINATION_AUDIT_SCHEMA_VERSION;
  readonly detectorPolicyVersion: typeof MHS_PROTECTED_CONTAMINATION_POLICY_VERSION;
  readonly sourceCandidateArtifactPath: `candidates/${typeof MHS_CANDIDATE_ARTIFACT_FILENAME}`;
  readonly sourceCandidateArtifactSha256: typeof MHS_CANDIDATE_ARTIFACT_SHA256;
  readonly sourceCandidatePayloadDigest: typeof MHS_CANDIDATE_PAYLOAD_DIGEST;
  readonly sourceIntegrityAuditArtifactPath: `candidates/${typeof MHS_CANDIDATE_AUDIT_FILENAME}`;
  readonly sourceIntegrityAuditArtifactSha256: typeof MHS_INTEGRITY_AUDIT_ARTIFACT_SHA256;
  readonly sourceIntegrityAuditPayloadDigest: typeof MHS_INTEGRITY_AUDIT_PAYLOAD_DIGEST;
  readonly sourceIntegrityAuditSchemaVersion: typeof MHS_CANDIDATE_INTEGRITY_AUDIT_SCHEMA_VERSION;
  readonly fixtureVersion: string;
  readonly fixturePublishedSha256: "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747";
  readonly fixtureCount: 140;
  readonly normalizationVersion: typeof TEXT_DUPLICATE_NORMALIZATION_VERSION;
  readonly detectorVersion: string;
  readonly fuzzyDetectorVersion: string;
  readonly fuzzyThreshold: 0.9;
  readonly fuzzyMinimumNormalizedLength: 20;
  readonly generatedAt: string;
  readonly candidateCount: 86;
  readonly exactMatchCount: number;
  readonly normalizedMatchCount: number;
  readonly fuzzyReviewCount: number;
  readonly contaminationStatus: "NO_DETECTED_OVERLAP" | "POTENTIAL_CONTAMINATION_REVIEW_REQUIRED";
  readonly semanticToolingEvaluation: { readonly version: typeof MHS_SEMANTIC_TOOLING_EVALUATION_VERSION; readonly status: typeof MHS_SEMANTIC_TOOLING_STATUS; readonly recommendedModel: "intfloat/multilingual-e5-small"; readonly noModelDownloaded: true; readonly moderationBaseModelUnchanged: "FacebookAI/xlm-roberta-base" };
  readonly findings: readonly ProtectedDetectorFinding[];
  readonly rows: readonly { readonly candidateRowId: string; readonly candidateTextDigest: string; readonly reviewerDecision: "ALLOW" | "BLOCK";
    readonly candidateState: "ADMITTED_ALLOW" | "ADMITTED_BLOCK"; readonly findingCount: 0 | 1;
    readonly disposition: "NO_DETECTED_OVERLAP" | "POTENTIAL_CONTAMINATION_REVIEW_REQUIRED"; readonly trainingEligible: false }[];
}
export interface MhsProtectedContaminationAuditArtifact extends MhsProtectedContaminationAuditPayload { readonly contaminationPayloadDigest: string; }

type AtomicPublisher = (temporaryPath: string, targetPath: string) => void;
export interface CreateMhsProtectedContaminationAuditOptions {
  readonly candidateArtifactPath: string; readonly integrityAuditArtifactPath: string; readonly outputDirectory: string;
  readonly protectedDetector: (candidates: readonly ProtectedDetectorInput[]) => ProtectedDetectorResult;
  readonly generatedAt?: string; readonly publishAtomic?: AtomicPublisher;
}

const exactKeys = (value: object, allowed: readonly string[]): boolean => {
  const actual = Object.keys(value).sort(); return canonicalJson(actual) === canonicalJson([...allowed].sort());
};
const payloadDigest = (payload: MhsProtectedContaminationAuditPayload): string => sha256(Buffer.from(canonicalJson(payload), "utf8"));

const validateProtectedResult = (result: ProtectedDetectorResult, candidateIds: ReadonlySet<string>): void => {
  const resultKeys = ["detectorVersion", "fixtureVersion", "fixturePublishedSha256", "fixtureCount", "normalizationVersion", "fuzzyDetectorVersion", "fuzzyThreshold", "fuzzyMinimumNormalizedLength", "comparedCandidateCount", "findings"];
  const findingKeys = ["candidateRowId", "candidateTextDigest", "fixtureOpaqueId", "fixtureFingerprint", "comparisonType", "matched", "similarity", "threshold", "detectorVersion", "disposition"];
  if (!exactKeys(result, resultKeys) || sha256(Buffer.from(result.fixtureVersion, "utf8")) !== MHS_PROTECTED_FIXTURE_VERSION_DIGEST
    || result.fixturePublishedSha256 !== "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747" || result.fixtureCount !== 140
    || result.normalizationVersion !== TEXT_DUPLICATE_NORMALIZATION_VERSION || result.fuzzyThreshold !== 0.9 || result.fuzzyMinimumNormalizedLength !== 20
    || result.comparedCandidateCount !== 86 || new Set(result.findings.map((finding) => finding.candidateRowId)).size !== result.findings.length) throw new Error("Protected detector returned invalid bounded metadata");
  for (const finding of result.findings) {
    if (!exactKeys(finding, findingKeys) || !candidateIds.has(finding.candidateRowId) || !/^[a-f0-9]{64}$/.test(finding.candidateTextDigest)
      || !/^frozen_fixture_[a-f0-9]{64}$/.test(finding.fixtureOpaqueId) || !/^[a-f0-9]{64}$/.test(finding.fixtureFingerprint)
      || !["EXACT_MATCH", "NORMALIZED_MATCH", "FUZZY_CHAR_TRIGRAM_JACCARD"].includes(finding.comparisonType) || finding.matched !== true
      || !Number.isFinite(finding.similarity) || finding.similarity < finding.threshold || finding.similarity > 1
      || finding.disposition !== "POTENTIAL_CONTAMINATION_REVIEW_REQUIRED") throw new Error("Protected detector finding violated the outward allowlist");
  }
};

export const validateMhsProtectedContaminationAuditArtifact = (artifact: MhsProtectedContaminationAuditArtifact): void => {
  const { contaminationPayloadDigest, ...payload } = artifact;
  if (payload.schemaVersion !== MHS_PROTECTED_CONTAMINATION_AUDIT_SCHEMA_VERSION || payload.detectorPolicyVersion !== MHS_PROTECTED_CONTAMINATION_POLICY_VERSION
    || payload.sourceCandidateArtifactSha256 !== MHS_CANDIDATE_ARTIFACT_SHA256 || payload.sourceCandidatePayloadDigest !== MHS_CANDIDATE_PAYLOAD_DIGEST
    || payload.sourceIntegrityAuditArtifactSha256 !== MHS_INTEGRITY_AUDIT_ARTIFACT_SHA256 || payload.sourceIntegrityAuditPayloadDigest !== MHS_INTEGRITY_AUDIT_PAYLOAD_DIGEST
    || sha256(Buffer.from(payload.fixtureVersion, "utf8")) !== MHS_PROTECTED_FIXTURE_VERSION_DIGEST || payload.fixturePublishedSha256 !== "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747"
    || payload.fixtureCount !== 140 || payload.normalizationVersion !== TEXT_DUPLICATE_NORMALIZATION_VERSION || payload.candidateCount !== 86
    || payload.rows.length !== 86 || !Number.isFinite(Date.parse(payload.generatedAt))) throw new Error("Invalid contamination audit identity");
  if (new Set(payload.rows.map((row) => row.candidateRowId)).size !== 86 || payload.rows.some((row) => row.trainingEligible !== false
    || !["ADMITTED_ALLOW", "ADMITTED_BLOCK"].includes(row.candidateState))) throw new Error("Contamination audit membership changed");
  const exact = payload.findings.filter((finding) => finding.comparisonType === "EXACT_MATCH").length;
  const normalized = payload.findings.filter((finding) => finding.comparisonType === "NORMALIZED_MATCH").length;
  const fuzzy = payload.findings.filter((finding) => finding.comparisonType === "FUZZY_CHAR_TRIGRAM_JACCARD").length;
  if (payload.exactMatchCount !== exact || payload.normalizedMatchCount !== normalized || payload.fuzzyReviewCount !== fuzzy
    || payload.contaminationStatus !== (payload.findings.length ? "POTENTIAL_CONTAMINATION_REVIEW_REQUIRED" : "NO_DETECTED_OVERLAP")
    || payload.semanticToolingEvaluation.status !== MHS_SEMANTIC_TOOLING_STATUS || payload.semanticToolingEvaluation.noModelDownloaded !== true
    || payload.semanticToolingEvaluation.moderationBaseModelUnchanged !== "FacebookAI/xlm-roberta-base") throw new Error("Contamination summary or model boundary changed");
  const findingCounts = new Map<string, number>(); payload.findings.forEach((finding) => findingCounts.set(finding.candidateRowId, (findingCounts.get(finding.candidateRowId) ?? 0) + 1));
  if (payload.rows.some((row) => row.findingCount !== (findingCounts.get(row.candidateRowId) ?? 0)
    || row.disposition !== (row.findingCount ? "POTENTIAL_CONTAMINATION_REVIEW_REQUIRED" : "NO_DETECTED_OVERLAP"))) throw new Error("Candidate contamination disposition mismatch");
  if (contaminationPayloadDigest !== payloadDigest(payload)) throw new Error("Contamination audit payload mismatch");
};

const readAuthority = <T>(filename: string, expectedHash: string, validate: (artifact: T) => void): T => {
  const bytes = fs.readFileSync(filename); if (sha256(bytes) !== expectedHash) throw new Error(`Source authority SHA-256 mismatch: ${path.basename(filename)}`);
  const artifact = JSON.parse(bytes.toString("utf8")) as T; validate(artifact); return artifact;
};

export const createMhsProtectedContaminationAudit = (options: CreateMhsProtectedContaminationAuditOptions): { readonly artifactPath: string; readonly artifactSha256: string; readonly artifact: MhsProtectedContaminationAuditArtifact } => {
  const candidate = readAuthority<MhsCandidateAdmissionArtifact>(options.candidateArtifactPath, MHS_CANDIDATE_ARTIFACT_SHA256, validateMhsCandidateAdmissionArtifact);
  const integrity = readAuthority<MhsCandidateIntegrityAuditArtifact>(options.integrityAuditArtifactPath, MHS_INTEGRITY_AUDIT_ARTIFACT_SHA256, validateMhsCandidateIntegrityAuditArtifact);
  if (candidate.candidatePayloadDigest !== MHS_CANDIDATE_PAYLOAD_DIGEST || integrity.auditPayloadDigest !== MHS_INTEGRITY_AUDIT_PAYLOAD_DIGEST) throw new Error("Source authority payload digest mismatch");
  const admitted = candidate.rows.filter((row) => row.candidateAdmitted);
  if (admitted.length !== 86 || integrity.rows.length !== 86 || admitted.some((row) => row.trainingEligible || !row.reviewedText)
    || canonicalJson(admitted.map((row) => row.sourceRowId)) !== canonicalJson(integrity.rows.map((row) => row.sourceRowId))) throw new Error("Protected comparison membership mismatch");
  const detectorResult = options.protectedDetector(admitted.map((row) => ({ candidateRowId: row.sourceRowId, candidateTextDigest: row.textDigest, text: row.reviewedText! })));
  const candidateIds = new Set(admitted.map((row) => row.sourceRowId)); validateProtectedResult(detectorResult, candidateIds);
  const findings = detectorResult.findings.map((finding) => ({ ...finding })); const findingById = new Map(findings.map((finding) => [finding.candidateRowId, finding]));
  const rows = admitted.map((row) => ({ candidateRowId: row.sourceRowId, candidateTextDigest: row.textDigest, reviewerDecision: row.reviewerDecision as "ALLOW" | "BLOCK",
    candidateState: row.candidateState as "ADMITTED_ALLOW" | "ADMITTED_BLOCK", findingCount: (findingById.has(row.sourceRowId) ? 1 : 0) as 0 | 1,
    disposition: findingById.has(row.sourceRowId) ? "POTENTIAL_CONTAMINATION_REVIEW_REQUIRED" as const : "NO_DETECTED_OVERLAP" as const, trainingEligible: false as const }));
  const exactMatchCount = findings.filter((finding) => finding.comparisonType === "EXACT_MATCH").length;
  const normalizedMatchCount = findings.filter((finding) => finding.comparisonType === "NORMALIZED_MATCH").length;
  const fuzzyReviewCount = findings.filter((finding) => finding.comparisonType === "FUZZY_CHAR_TRIGRAM_JACCARD").length;
  const generatedAt = options.generatedAt ?? new Date().toISOString(); if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("Contamination audit timestamp is invalid");
  const payload: MhsProtectedContaminationAuditPayload = {
    schemaVersion: MHS_PROTECTED_CONTAMINATION_AUDIT_SCHEMA_VERSION, detectorPolicyVersion: MHS_PROTECTED_CONTAMINATION_POLICY_VERSION,
    sourceCandidateArtifactPath: `candidates/${MHS_CANDIDATE_ARTIFACT_FILENAME}`, sourceCandidateArtifactSha256: MHS_CANDIDATE_ARTIFACT_SHA256,
    sourceCandidatePayloadDigest: MHS_CANDIDATE_PAYLOAD_DIGEST, sourceIntegrityAuditArtifactPath: `candidates/${MHS_CANDIDATE_AUDIT_FILENAME}`,
    sourceIntegrityAuditArtifactSha256: MHS_INTEGRITY_AUDIT_ARTIFACT_SHA256, sourceIntegrityAuditPayloadDigest: MHS_INTEGRITY_AUDIT_PAYLOAD_DIGEST,
    sourceIntegrityAuditSchemaVersion: MHS_CANDIDATE_INTEGRITY_AUDIT_SCHEMA_VERSION, fixtureVersion: detectorResult.fixtureVersion,
    fixturePublishedSha256: detectorResult.fixturePublishedSha256, fixtureCount: detectorResult.fixtureCount, normalizationVersion: detectorResult.normalizationVersion,
    detectorVersion: detectorResult.detectorVersion, fuzzyDetectorVersion: detectorResult.fuzzyDetectorVersion, fuzzyThreshold: detectorResult.fuzzyThreshold,
    fuzzyMinimumNormalizedLength: detectorResult.fuzzyMinimumNormalizedLength, generatedAt, candidateCount: 86, exactMatchCount, normalizedMatchCount, fuzzyReviewCount,
    contaminationStatus: findings.length ? "POTENTIAL_CONTAMINATION_REVIEW_REQUIRED" : "NO_DETECTED_OVERLAP",
    semanticToolingEvaluation: { version: MHS_SEMANTIC_TOOLING_EVALUATION_VERSION, status: MHS_SEMANTIC_TOOLING_STATUS,
      recommendedModel: "intfloat/multilingual-e5-small", noModelDownloaded: true, moderationBaseModelUnchanged: "FacebookAI/xlm-roberta-base" }, findings, rows,
  };
  const artifact: MhsProtectedContaminationAuditArtifact = { ...payload, contaminationPayloadDigest: payloadDigest(payload) }; validateMhsProtectedContaminationAuditArtifact(artifact);
  const serialized = canonicalJson(artifact); const artifactPath = path.join(options.outputDirectory, MHS_CONTAMINATION_AUDIT_FILENAME);
  writeImmutableFileAtomic(artifactPath, serialized, options.publishAtomic);
  return { artifactPath, artifactSha256: sha256(Buffer.from(serialized, "utf8")), artifact };
};
