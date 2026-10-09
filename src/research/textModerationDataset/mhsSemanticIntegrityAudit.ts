import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import { MHS_CANDIDATE_ARTIFACT_FILENAME, MhsCandidateAdmissionArtifact, validateMhsCandidateAdmissionArtifact } from "./mhsCandidateAdmission";
import {
  MHS_CANDIDATE_ARTIFACT_SHA256, MHS_CANDIDATE_AUDIT_FILENAME, MHS_CANDIDATE_PAYLOAD_DIGEST,
  MhsCandidateIntegrityAuditArtifact, validateMhsCandidateIntegrityAuditArtifact,
} from "./mhsCandidateIntegrityAudit";
import {
  MHS_CONTAMINATION_AUDIT_FILENAME, MhsProtectedContaminationAuditArtifact, validateMhsProtectedContaminationAuditArtifact,
} from "./mhsProtectedContaminationAudit";
import { writeImmutableFileAtomic } from "./mhsReviewImport";
import {
  DistributionStatistics, E5CalibrationResult, E5PrefixPolicyResult, E5_PREFIX_CALIBRATION_VERSION,
  E5_SELECTED_PREFIX_POLICY_VERSION, E5_SELECTED_SYMMETRIC_PREFIX_POLICY, evaluateE5PrefixPolicies,
} from "./semanticSimilarity/e5SemanticCalibration";
import {
  E5_CALIBRATION_PAIR_CLASSES, E5_SEMANTIC_CALIBRATION_CORPUS_DIGEST, E5_SEMANTIC_CALIBRATION_CORPUS_VERSION,
  e5SemanticCalibrationCorpus,
} from "./semanticSimilarity/e5SemanticCalibrationCorpus";
import {
  E5_SEMANTIC_ADAPTER_VERSION, E5_SMALL_GX_MANIFEST_PAYLOAD_DIGEST, E5_SMALL_GX_MANIFEST_SHA256,
  E5SemanticSimilarityAdapter, semanticCosineSimilarity,
} from "./semanticSimilarity/e5SemanticSimilarityAdapter";
import { E5_SMALL_HIDDEN_DIMENSION, E5_SMALL_MODEL_REPOSITORY, E5_SMALL_MODEL_REVISION } from "./semanticSimilarity/e5SmallExportContract";

export const MHS_SEMANTIC_AUDIT_SCHEMA_VERSION = "STHN_TEXT_MODERATION_MHS_SEMANTIC_INTEGRITY_AUDIT_V1" as const;
export const MHS_SEMANTIC_AUDIT_POLICY_VERSION = "STHN_TEXT_MODERATION_MHS_SEMANTIC_REVIEW_POLICY_V1" as const;
export const MHS_SEMANTIC_AUDIT_FILENAME = "mhs-review-pilot-v1-candidate-v1-semantic-audit.json" as const;
export const MHS_PROTECTED_CONTAMINATION_ARTIFACT_SHA256 = "093350b575af2db18cdc5a745eb10b7480e0bc3c7f2d8b55843907624ffd2605" as const;
export const MHS_PROTECTED_CONTAMINATION_PAYLOAD_DIGEST = "7b0f99a70f5935276ce8d9a7959ad1474a346b7b41582f9f8976bf621ebaa395" as const;
export const E5_SEMANTIC_HIGH_CONFIDENCE_THRESHOLD = 0.94 as const;
export const E5_SEMANTIC_NEAR_DUPLICATE_THRESHOLD = 0.8 as const;
export const E5_SEMANTIC_REVIEW_BAND_VERSION = "STHN_E5_SEMANTIC_REVIEW_BANDS_V1" as const;
export const MHS_SEMANTIC_CANDIDATE_MEMBERSHIP_DIGEST = "561e0bd36de7c7fcfb6f698a1fe41fad1a43eeb3a040f3b92e117a4ebd65d8df" as const;
export type E5SemanticReviewBand = "HIGH_CONFIDENCE_DUPLICATE_SIGNAL" | "POTENTIAL_NEAR_DUPLICATE_REVIEW" | "NO_SEMANTIC_DUPLICATE_SIGNAL";

export interface SemanticEmbeddingAdapter {
  readonly version: string; initialize(): Promise<void>;
  embedBatch(texts: readonly string[], prefix: "query" | "passage"): Promise<readonly number[][]>;
}
export interface MhsSemanticFinding {
  readonly candidateAId: string; readonly candidateBId: string; readonly candidateADigest: string; readonly candidateBDigest: string;
  readonly similarity: number; readonly reviewBand: Exclude<E5SemanticReviewBand, "NO_SEMANTIC_DUPLICATE_SIGNAL">;
  readonly candidateADecision: "ALLOW" | "BLOCK"; readonly candidateBDecision: "ALLOW" | "BLOCK";
  readonly candidateAPrimaryCategory: string | null; readonly candidateBPrimaryCategory: string | null;
  readonly allowBlockConflict: boolean; readonly blockClassificationConflict: boolean;
  readonly reviewStatus: "SEMANTIC_LABEL_REVIEW_REQUIRED" | "SEMANTIC_DUPLICATE_REVIEW_REQUIRED";
}
type PolicySummary = Omit<E5PrefixPolicyResult, "scores">;
export interface MhsSemanticAuditPayload {
  readonly schemaVersion: typeof MHS_SEMANTIC_AUDIT_SCHEMA_VERSION; readonly policyVersion: typeof MHS_SEMANTIC_AUDIT_POLICY_VERSION;
  readonly sourceCandidateArtifactSha256: typeof MHS_CANDIDATE_ARTIFACT_SHA256; readonly sourceCandidatePayloadDigest: typeof MHS_CANDIDATE_PAYLOAD_DIGEST;
  readonly sourceIntegrityAuditSha256: "6d6cb13ddfe6f832fcd9e25899310a62dd0bd1498be022d4f3675d6076188383";
  readonly sourceContaminationAuditSha256: typeof MHS_PROTECTED_CONTAMINATION_ARTIFACT_SHA256;
  readonly sourceContaminationPayloadDigest: typeof MHS_PROTECTED_CONTAMINATION_PAYLOAD_DIGEST;
  readonly gxManifestSha256: typeof E5_SMALL_GX_MANIFEST_SHA256; readonly gxManifestPayloadDigest: typeof E5_SMALL_GX_MANIFEST_PAYLOAD_DIGEST;
  readonly model: { readonly repository: typeof E5_SMALL_MODEL_REPOSITORY; readonly revision: typeof E5_SMALL_MODEL_REVISION;
    readonly onnxSha256: "6537b5148ee3c043b20c3837ae9569d106e976c828d0d7e9163720c4b556bba3"; readonly tokenizerSha256: "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39";
    readonly embeddingDimension: typeof E5_SMALL_HIDDEN_DIMENSION; readonly adapterVersion: typeof E5_SEMANTIC_ADAPTER_VERSION };
  readonly semanticContract: { readonly pooling: "ATTENTION_MASK_AWARE_MEAN"; readonly normalization: "L2_UNIT_NORM"; readonly similarity: "COSINE";
    readonly prefixPolicy: typeof E5_SELECTED_SYMMETRIC_PREFIX_POLICY; readonly prefixPolicyVersion: typeof E5_SELECTED_PREFIX_POLICY_VERSION };
  readonly calibration: { readonly version: typeof E5_PREFIX_CALIBRATION_VERSION; readonly corpusVersion: typeof E5_SEMANTIC_CALIBRATION_CORPUS_VERSION;
    readonly corpusDigest: typeof E5_SEMANTIC_CALIBRATION_CORPUS_DIGEST; readonly pairCount: 44; readonly countsByClass: Readonly<Record<string, number>>;
    readonly countsByLanguageGroup: Readonly<Record<string, number>>; readonly selectedPolicy: typeof E5_SELECTED_SYMMETRIC_PREFIX_POLICY;
    readonly selectionRule: string; readonly policyResults: readonly PolicySummary[] };
  readonly reviewBands: { readonly version: typeof E5_SEMANTIC_REVIEW_BAND_VERSION; readonly highConfidenceMinimum: typeof E5_SEMANTIC_HIGH_CONFIDENCE_THRESHOLD;
    readonly potentialReviewMinimum: typeof E5_SEMANTIC_NEAR_DUPLICATE_THRESHOLD; readonly noSignalBelow: typeof E5_SEMANTIC_NEAR_DUPLICATE_THRESHOLD;
    readonly calibrationEvidence: { readonly selectedDistinctMaximum: number; readonly selectedUnrelatedMaximum: number };
    readonly authority: "REVIEW_SIGNALS_ONLY_NO_AUTOMATIC_MUTATION" };
  readonly generatedAt: string; readonly candidateCount: 86; readonly admittedAllowCount: 58; readonly admittedBlockCount: 28; readonly pairCount: 3655;
  readonly highConfidenceSignalCount: number; readonly potentialNearDuplicateSignalCount: number; readonly allowBlockConflictSignalCount: number;
  readonly blockClassificationConflictSignalCount: number; readonly sameDecisionSignalCount: number; readonly findings: readonly MhsSemanticFinding[];
  readonly candidateMembershipDigest: string; readonly frozenBenchmarkAccessed: false; readonly frozenEmbeddingsGenerated: false;
  readonly trainingEligibleCount: 0; readonly moderationBaseModel: "FacebookAI/xlm-roberta-base";
}
export interface MhsSemanticAuditArtifact extends MhsSemanticAuditPayload { readonly semanticAuditPayloadDigest: string; }
export interface CreateMhsSemanticAuditOptions {
  readonly candidateArtifactPath: string; readonly integrityAuditArtifactPath: string; readonly contaminationAuditArtifactPath: string;
  readonly outputDirectory: string; readonly adapter?: SemanticEmbeddingAdapter; readonly generatedAt?: string;
  readonly calibrationEvaluator?: (adapter: SemanticEmbeddingAdapter) => Promise<E5CalibrationResult>;
  readonly publishAtomic?: (temporaryPath: string, targetPath: string) => void;
}

export const semanticReviewBand = (similarity: number): E5SemanticReviewBand => {
  if (!Number.isFinite(similarity) || similarity < -1 || similarity > 1) throw new Error("Invalid semantic similarity");
  return similarity >= E5_SEMANTIC_HIGH_CONFIDENCE_THRESHOLD ? "HIGH_CONFIDENCE_DUPLICATE_SIGNAL"
    : similarity >= E5_SEMANTIC_NEAR_DUPLICATE_THRESHOLD ? "POTENTIAL_NEAR_DUPLICATE_REVIEW" : "NO_SEMANTIC_DUPLICATE_SIGNAL";
};
const readAuthority = <T>(filename: string, expectedHash: string, validate: (value: T) => void): T => {
  const bytes = fs.readFileSync(filename); if (sha256(bytes) !== expectedHash) throw new Error(`Semantic source SHA-256 mismatch: ${path.basename(filename)}`);
  const value = JSON.parse(bytes.toString("utf8")) as T; validate(value); return value;
};
const batches = <T>(values: readonly T[], size: number): readonly T[][] => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
const embedAll = async (adapter: SemanticEmbeddingAdapter, texts: readonly string[], prefix: "query" | "passage"): Promise<readonly number[][]> => {
  const output: number[][] = []; for (const batch of batches(texts, 16)) output.push(...await adapter.embedBatch(batch, prefix)); return output;
};
const payloadDigest = (payload: MhsSemanticAuditPayload): string => crypto.createHash("sha256").update(canonicalJson(payload)).digest("hex");
const counts = (values: readonly string[]): Readonly<Record<string, number>> => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));
const selectedPolicyResult = (calibration: E5CalibrationResult): E5PrefixPolicyResult => calibration.policyResults.find((item) => item.policy === calibration.selectedPolicy)!;

export const validateMhsSemanticAuditArtifact = (artifact: MhsSemanticAuditArtifact): void => {
  const { semanticAuditPayloadDigest, ...payload } = artifact;
  if (payload.schemaVersion !== MHS_SEMANTIC_AUDIT_SCHEMA_VERSION || payload.policyVersion !== MHS_SEMANTIC_AUDIT_POLICY_VERSION
    || payload.sourceCandidateArtifactSha256 !== MHS_CANDIDATE_ARTIFACT_SHA256 || payload.sourceCandidatePayloadDigest !== MHS_CANDIDATE_PAYLOAD_DIGEST
    || payload.sourceIntegrityAuditSha256 !== "6d6cb13ddfe6f832fcd9e25899310a62dd0bd1498be022d4f3675d6076188383"
    || payload.sourceContaminationAuditSha256 !== MHS_PROTECTED_CONTAMINATION_ARTIFACT_SHA256 || payload.sourceContaminationPayloadDigest !== MHS_PROTECTED_CONTAMINATION_PAYLOAD_DIGEST
    || payload.gxManifestSha256 !== E5_SMALL_GX_MANIFEST_SHA256 || payload.gxManifestPayloadDigest !== E5_SMALL_GX_MANIFEST_PAYLOAD_DIGEST
    || payload.model.repository !== E5_SMALL_MODEL_REPOSITORY || payload.model.revision !== E5_SMALL_MODEL_REVISION
    || payload.model.onnxSha256 !== "6537b5148ee3c043b20c3837ae9569d106e976c828d0d7e9163720c4b556bba3"
    || payload.model.tokenizerSha256 !== "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39"
    || payload.model.embeddingDimension !== 384 || payload.model.adapterVersion !== E5_SEMANTIC_ADAPTER_VERSION) throw new Error("Invalid MHS semantic audit authority");
  if (payload.semanticContract.prefixPolicy !== E5_SELECTED_SYMMETRIC_PREFIX_POLICY || payload.semanticContract.prefixPolicyVersion !== E5_SELECTED_PREFIX_POLICY_VERSION
    || payload.calibration.version !== E5_PREFIX_CALIBRATION_VERSION || payload.calibration.corpusVersion !== E5_SEMANTIC_CALIBRATION_CORPUS_VERSION
    || payload.calibration.corpusDigest !== E5_SEMANTIC_CALIBRATION_CORPUS_DIGEST || payload.calibration.pairCount !== 44
    || payload.calibration.selectedPolicy !== E5_SELECTED_SYMMETRIC_PREFIX_POLICY || payload.reviewBands.version !== E5_SEMANTIC_REVIEW_BAND_VERSION
    || payload.reviewBands.highConfidenceMinimum !== 0.94 || payload.reviewBands.potentialReviewMinimum !== 0.8 || payload.reviewBands.noSignalBelow !== 0.8
    || payload.reviewBands.calibrationEvidence.selectedDistinctMaximum >= 0.94 || payload.reviewBands.calibrationEvidence.selectedUnrelatedMaximum >= 0.8) throw new Error("Invalid MHS semantic calibration authority");
  if (payload.candidateCount !== 86 || payload.admittedAllowCount !== 58 || payload.admittedBlockCount !== 28 || payload.pairCount !== 3655
    || payload.frozenBenchmarkAccessed || payload.frozenEmbeddingsGenerated || payload.trainingEligibleCount !== 0
    || payload.moderationBaseModel !== "FacebookAI/xlm-roberta-base" || payload.candidateMembershipDigest !== MHS_SEMANTIC_CANDIDATE_MEMBERSHIP_DIGEST
    || !Number.isFinite(Date.parse(payload.generatedAt))) throw new Error("MHS semantic dataset boundary changed");
  if (payload.findings.some((finding) => finding.candidateAId >= finding.candidateBId || !/^[a-f0-9]{64}$/.test(finding.candidateADigest)
    || !/^[a-f0-9]{64}$/.test(finding.candidateBDigest) || semanticReviewBand(finding.similarity) !== finding.reviewBand
    || finding.reviewStatus !== (finding.allowBlockConflict || finding.blockClassificationConflict ? "SEMANTIC_LABEL_REVIEW_REQUIRED" : "SEMANTIC_DUPLICATE_REVIEW_REQUIRED"))) throw new Error("Invalid MHS semantic finding");
  const high = payload.findings.filter((item) => item.reviewBand === "HIGH_CONFIDENCE_DUPLICATE_SIGNAL").length;
  const near = payload.findings.filter((item) => item.reviewBand === "POTENTIAL_NEAR_DUPLICATE_REVIEW").length;
  const allowBlock = payload.findings.filter((item) => item.allowBlockConflict).length;
  const blockClass = payload.findings.filter((item) => item.blockClassificationConflict).length;
  const same = payload.findings.filter((item) => item.candidateADecision === item.candidateBDecision).length;
  if (payload.highConfidenceSignalCount !== high || payload.potentialNearDuplicateSignalCount !== near
    || payload.allowBlockConflictSignalCount !== allowBlock || payload.blockClassificationConflictSignalCount !== blockClass || payload.sameDecisionSignalCount !== same
    || semanticAuditPayloadDigest !== payloadDigest(payload)) throw new Error("MHS semantic summary or payload digest mismatch");
};

export const createMhsSemanticIntegrityAudit = async (options: CreateMhsSemanticAuditOptions): Promise<{ readonly artifactPath: string; readonly artifactSha256: string; readonly artifact: MhsSemanticAuditArtifact }> => {
  const candidate = readAuthority<MhsCandidateAdmissionArtifact>(options.candidateArtifactPath, MHS_CANDIDATE_ARTIFACT_SHA256, validateMhsCandidateAdmissionArtifact);
  const integrity = readAuthority<MhsCandidateIntegrityAuditArtifact>(options.integrityAuditArtifactPath, "6d6cb13ddfe6f832fcd9e25899310a62dd0bd1498be022d4f3675d6076188383", validateMhsCandidateIntegrityAuditArtifact);
  const contamination = readAuthority<MhsProtectedContaminationAuditArtifact>(options.contaminationAuditArtifactPath, MHS_PROTECTED_CONTAMINATION_ARTIFACT_SHA256, validateMhsProtectedContaminationAuditArtifact);
  if (candidate.candidatePayloadDigest !== MHS_CANDIDATE_PAYLOAD_DIGEST || contamination.contaminationPayloadDigest !== MHS_PROTECTED_CONTAMINATION_PAYLOAD_DIGEST) throw new Error("Semantic source payload digest mismatch");
  const admitted = candidate.rows.filter((row) => row.candidateAdmitted);
  if (admitted.length !== 86 || admitted.filter((row) => row.reviewerDecision === "ALLOW").length !== 58 || admitted.filter((row) => row.reviewerDecision === "BLOCK").length !== 28
    || candidate.rows.filter((row) => row.candidateState === "BLOCKED_PII_REVIEW").length !== 8 || candidate.rows.filter((row) => row.candidateState === "BLOCKED_ADJUDICATION").length !== 6
    || admitted.some((row) => row.trainingEligible || !row.reviewedText) || canonicalJson(admitted.map((row) => row.sourceRowId)) !== canonicalJson(integrity.rows.map((row) => row.sourceRowId))
    || contamination.candidateCount !== 86) throw new Error("Semantic candidate membership authority changed");
  const adapter = options.adapter ?? new E5SemanticSimilarityAdapter(); const calibration = options.calibrationEvaluator
    ? await options.calibrationEvaluator(adapter) : await evaluateE5PrefixPolicies(adapter as E5SemanticSimilarityAdapter);
  if (calibration.corpusDigest !== E5_SEMANTIC_CALIBRATION_CORPUS_DIGEST || calibration.pairCount !== 44 || calibration.selectedPolicy !== E5_SELECTED_SYMMETRIC_PREFIX_POLICY) throw new Error("Semantic calibration authority failed");
  const selected = selectedPolicyResult(calibration); const unrelatedMaximum = selected.statisticsByClass.UNRELATED.maximum;
  if (selected.distinctStatistics.maximum >= E5_SEMANTIC_HIGH_CONFIDENCE_THRESHOLD || unrelatedMaximum >= E5_SEMANTIC_NEAR_DUPLICATE_THRESHOLD) throw new Error("Semantic review bands lack conservative calibration separation");
  await adapter.initialize(); const texts = admitted.map((row) => row.reviewedText!); const [query, passage] = await Promise.all([embedAll(adapter, texts, "query"), embedAll(adapter, texts, "passage")]);
  if (query.length !== 86 || passage.length !== 86) throw new Error("Semantic adapter returned incomplete candidate embeddings");
  const findings: MhsSemanticFinding[] = []; let pairCount = 0;
  for (let left = 0; left < admitted.length; left += 1) for (let right = left + 1; right < admitted.length; right += 1) {
    pairCount += 1; const similarity = (semanticCosineSimilarity(query[left], passage[right]) + semanticCosineSimilarity(query[right], passage[left])) / 2;
    const band = semanticReviewBand(similarity); if (band === "NO_SEMANTIC_DUPLICATE_SIGNAL") continue;
    const a = admitted[left]; const b = admitted[right]; const ordered = a.sourceRowId < b.sourceRowId ? [a, b] as const : [b, a] as const;
    const allowBlockConflict = ordered[0].reviewerDecision !== ordered[1].reviewerDecision;
    const blockClassificationConflict = ordered[0].reviewerDecision === "BLOCK" && ordered[1].reviewerDecision === "BLOCK"
      && canonicalJson([ordered[0].primaryCategory, ...ordered[0].secondaryCategories].sort()) !== canonicalJson([ordered[1].primaryCategory, ...ordered[1].secondaryCategories].sort());
    findings.push({ candidateAId: ordered[0].sourceRowId, candidateBId: ordered[1].sourceRowId, candidateADigest: ordered[0].textDigest,
      candidateBDigest: ordered[1].textDigest, similarity: Number(similarity.toFixed(6)), reviewBand: band,
      candidateADecision: ordered[0].reviewerDecision as "ALLOW" | "BLOCK", candidateBDecision: ordered[1].reviewerDecision as "ALLOW" | "BLOCK",
      candidateAPrimaryCategory: ordered[0].primaryCategory, candidateBPrimaryCategory: ordered[1].primaryCategory,
      allowBlockConflict, blockClassificationConflict, reviewStatus: allowBlockConflict || blockClassificationConflict ? "SEMANTIC_LABEL_REVIEW_REQUIRED" : "SEMANTIC_DUPLICATE_REVIEW_REQUIRED" });
  }
  if (pairCount !== 3655) throw new Error("Semantic pair count changed"); findings.sort((a, b) => b.similarity - a.similarity || a.candidateAId.localeCompare(b.candidateAId) || a.candidateBId.localeCompare(b.candidateBId));
  const generatedAt = options.generatedAt ?? new Date().toISOString(); const policyResults: PolicySummary[] = calibration.policyResults.map(({ scores: _scores, ...summary }) => summary);
  const payload: MhsSemanticAuditPayload = {
    schemaVersion: MHS_SEMANTIC_AUDIT_SCHEMA_VERSION, policyVersion: MHS_SEMANTIC_AUDIT_POLICY_VERSION,
    sourceCandidateArtifactSha256: MHS_CANDIDATE_ARTIFACT_SHA256, sourceCandidatePayloadDigest: MHS_CANDIDATE_PAYLOAD_DIGEST,
    sourceIntegrityAuditSha256: "6d6cb13ddfe6f832fcd9e25899310a62dd0bd1498be022d4f3675d6076188383",
    sourceContaminationAuditSha256: MHS_PROTECTED_CONTAMINATION_ARTIFACT_SHA256, sourceContaminationPayloadDigest: MHS_PROTECTED_CONTAMINATION_PAYLOAD_DIGEST,
    gxManifestSha256: E5_SMALL_GX_MANIFEST_SHA256, gxManifestPayloadDigest: E5_SMALL_GX_MANIFEST_PAYLOAD_DIGEST,
    model: { repository: E5_SMALL_MODEL_REPOSITORY, revision: E5_SMALL_MODEL_REVISION, onnxSha256: "6537b5148ee3c043b20c3837ae9569d106e976c828d0d7e9163720c4b556bba3",
      tokenizerSha256: "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39", embeddingDimension: 384, adapterVersion: E5_SEMANTIC_ADAPTER_VERSION },
    semanticContract: { pooling: "ATTENTION_MASK_AWARE_MEAN", normalization: "L2_UNIT_NORM", similarity: "COSINE",
      prefixPolicy: E5_SELECTED_SYMMETRIC_PREFIX_POLICY, prefixPolicyVersion: E5_SELECTED_PREFIX_POLICY_VERSION },
    calibration: { version: calibration.version, corpusVersion: calibration.corpusVersion, corpusDigest: E5_SEMANTIC_CALIBRATION_CORPUS_DIGEST, pairCount: 44,
      countsByClass: counts(e5SemanticCalibrationCorpus.map((pair) => pair.pairClass)), countsByLanguageGroup: counts(e5SemanticCalibrationCorpus.map((pair) => pair.languageGroup)),
      selectedPolicy: E5_SELECTED_SYMMETRIC_PREFIX_POLICY, selectionRule: calibration.selectionRule, policyResults },
    reviewBands: { version: E5_SEMANTIC_REVIEW_BAND_VERSION, highConfidenceMinimum: 0.94, potentialReviewMinimum: 0.8, noSignalBelow: 0.8,
      calibrationEvidence: { selectedDistinctMaximum: selected.distinctStatistics.maximum, selectedUnrelatedMaximum: unrelatedMaximum }, authority: "REVIEW_SIGNALS_ONLY_NO_AUTOMATIC_MUTATION" },
    generatedAt, candidateCount: 86, admittedAllowCount: 58, admittedBlockCount: 28, pairCount,
    highConfidenceSignalCount: findings.filter((item) => item.reviewBand === "HIGH_CONFIDENCE_DUPLICATE_SIGNAL").length,
    potentialNearDuplicateSignalCount: findings.filter((item) => item.reviewBand === "POTENTIAL_NEAR_DUPLICATE_REVIEW").length,
    allowBlockConflictSignalCount: findings.filter((item) => item.allowBlockConflict).length,
    blockClassificationConflictSignalCount: findings.filter((item) => item.blockClassificationConflict).length,
    sameDecisionSignalCount: findings.filter((item) => item.candidateADecision === item.candidateBDecision).length, findings,
    candidateMembershipDigest: crypto.createHash("sha256").update(canonicalJson(admitted.map((row) => [row.sourceRowId, row.textDigest, row.reviewerDecision, row.primaryCategory, row.secondaryCategories]))).digest("hex"),
    frozenBenchmarkAccessed: false, frozenEmbeddingsGenerated: false, trainingEligibleCount: 0, moderationBaseModel: "FacebookAI/xlm-roberta-base",
  };
  const artifact: MhsSemanticAuditArtifact = { ...payload, semanticAuditPayloadDigest: payloadDigest(payload) }; validateMhsSemanticAuditArtifact(artifact);
  const serialized = canonicalJson(artifact); const artifactPath = path.join(options.outputDirectory, MHS_SEMANTIC_AUDIT_FILENAME);
  writeImmutableFileAtomic(artifactPath, serialized, options.publishAtomic); return { artifactPath, artifactSha256: sha256(Buffer.from(serialized, "utf8")), artifact };
};
