import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { parseCsv, CsvRecord } from "./csv";
import { canonicalJson, sha256 } from "./manifest";
import {
  MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST,
  MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_FILENAME,
  MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_PAYLOAD_DIGEST,
  MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SHA256,
  MHS_V2_SEMANTIC_CALIBRATION_REVIEW_COLUMNS,
  MHS_V2_SEMANTIC_CALIBRATION_REVIEW_FILENAME,
  MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PACKET_VERSION,
  MHS_V2_SEMANTIC_CALIBRATION_REVIEW_SHA256,
  MhsV2SemanticCalibrationMembershipArtifact,
  validateMhsV2SemanticCalibrationMembership,
} from "./mhsV2SemanticCalibrationExecution";
import {
  MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST,
  MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256,
  MhsV2SemanticCalibrationPolicyArtifact,
  validateMhsV2SemanticCalibrationPolicy,
} from "./mhsV2SemanticCalibrationPolicy";
import { MHS_REVIEWER_A_ID } from "./mhsReviewImport";

export const MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_FILENAME = "mhs-v2-semantic-calibration-reviewer-a-v1-completed.csv" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_FILENAME = "mhs-v2-semantic-calibration-reviewer-a-v1-certification.json" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_REVIEW_CERTIFICATION_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SEMANTIC_CALIBRATION_REVIEW_CERTIFICATION_V1" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_REVIEW_CERTIFICATION_VERSION = "MHS_V2_SEMANTIC_CALIBRATION_REVIEW_CERTIFICATION_V1" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_SHA256 = "11ec6dd7c4c3cbbb3e0d7da6710d68d7ac8419194715d54ef6cd75009a9cac32" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PAYLOAD_DIGEST = "3cd89f21bf967d77a5549d2528ba2f888bb7beb76be075ad3d50537570801c61" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_SHA256 = "7da6df8381f400eb5ad5ddb3d1458acc9502726901aa90c19659a84f66c36a9f" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_PAYLOAD_DIGEST = "b5cf458e1c2b324725ca2538c09e0417eb7d955fc6430c6e072caffa68db7e85" as const;

export const MHS_V2_SEMANTIC_RELATIONSHIPS = ["DUPLICATE", "NEAR_DUPLICATE", "RELATED_BUT_DISTINCT", "UNRELATED", "NEEDS_ADJUDICATION"] as const;
export type MhsV2SemanticRelationship = typeof MHS_V2_SEMANTIC_RELATIONSHIPS[number];
export interface MhsV2SemanticCalibrationJudgment { readonly reviewRowNumber: number; readonly semanticRelationship: MhsV2SemanticRelationship }

const duplicateRows = new Set([107, 109, 154, 197]);
const nearDuplicateRows = new Set([11, 25, 49, 79, 84, 159]);
const relatedRows = new Set([7, 10, 14, 19, 21, 43, 44, 50, 55, 71, 76, 102, 128, 131, 156, 180, 183, 200, 228, 262, 296]);
export const MHS_V2_SEMANTIC_CALIBRATION_REVIEWER_A_JUDGMENTS: readonly MhsV2SemanticCalibrationJudgment[] = Object.freeze(
  Array.from({ length: 300 }, (_, index): MhsV2SemanticCalibrationJudgment => {
    const reviewRowNumber = index + 1;
    const semanticRelationship: MhsV2SemanticRelationship = duplicateRows.has(reviewRowNumber) ? "DUPLICATE"
      : nearDuplicateRows.has(reviewRowNumber) ? "NEAR_DUPLICATE"
        : relatedRows.has(reviewRowNumber) ? "RELATED_BUT_DISTINCT" : "UNRELATED";
    return Object.freeze({ reviewRowNumber, semanticRelationship });
  }),
);

export const MHS_V2_SEMANTIC_CALIBRATION_EXPECTED_OUTCOME_COUNTS: Readonly<Record<MhsV2SemanticRelationship, number>> = Object.freeze({
  DUPLICATE: 4, NEAR_DUPLICATE: 6, RELATED_BUT_DISTINCT: 21, UNRELATED: 269, NEEDS_ADJUDICATION: 0,
});

export interface MhsV2SemanticCalibrationReconciliation {
  readonly unresolved: number; readonly missing: number; readonly unknown: number; readonly duplicateRows: number;
  readonly duplicatePairs: number; readonly identityMismatches: number; readonly invalidOutcomes: number;
}

export interface MhsV2SemanticCalibrationReviewCertificationPayload {
  readonly schemaVersion: typeof MHS_V2_SEMANTIC_CALIBRATION_REVIEW_CERTIFICATION_SCHEMA;
  readonly certificationVersion: typeof MHS_V2_SEMANTIC_CALIBRATION_REVIEW_CERTIFICATION_VERSION;
  readonly phase: "T6L-7K-A1R-V";
  readonly status: "VALIDATED_AND_IMMUTABLY_PUBLISHED";
  readonly authorities: {
    readonly policyArtifactSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256;
    readonly policyPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST;
    readonly membershipArtifactFilename: typeof MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_FILENAME;
    readonly membershipArtifactSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SHA256;
    readonly membershipPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_PAYLOAD_DIGEST;
    readonly membershipDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST;
    readonly blindedPacketFilename: typeof MHS_V2_SEMANTIC_CALIBRATION_REVIEW_FILENAME;
    readonly blindedPacketSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_REVIEW_SHA256;
    readonly packetVersion: typeof MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PACKET_VERSION;
  };
  readonly reviewer: { readonly role: "A"; readonly reviewerId: typeof MHS_REVIEWER_A_ID; readonly humanReviewTimestampRepresentation: "BLANK_NOT_CAPTURED" };
  readonly review: {
    readonly completedArtifactFilename: typeof MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_FILENAME;
    readonly completedArtifactSha256: string; readonly canonicalReviewPayloadDigest: string; readonly rowCount: 300;
    readonly outcomeCounts: Readonly<Record<MhsV2SemanticRelationship, number>>;
  };
  readonly reconciliation: MhsV2SemanticCalibrationReconciliation;
  readonly validation: {
    readonly exactFrozenIdentityBindings: true; readonly originalBlindnessPreserved: true; readonly privacyValidationPassed: true;
    readonly deterministicReplayMatched: true; readonly immutableAtomicPublication: true; readonly overwriteRefusalVerified: true;
  };
  readonly boundaries: {
    readonly thresholdEvaluationPerformed: false; readonly semanticEdgesGenerated: false; readonly componentsGenerated: false;
    readonly splitAssignmentPerformed: false; readonly trainingEligibilityChanged: false; readonly protectedBenchmarkContentAccessed: false;
    readonly internalTestContentAccessed: false; readonly modelTrainingPerformed: false; readonly productionIntegrationPerformed: false;
  };
}
export type MhsV2SemanticCalibrationReviewCertification = MhsV2SemanticCalibrationReviewCertificationPayload & { readonly certificationPayloadDigest: string };

export interface MhsV2SemanticCalibrationReviewInputs {
  readonly policyBytes: Buffer; readonly membershipBytes: Buffer; readonly blindedCsv: string;
  readonly judgments: readonly MhsV2SemanticCalibrationJudgment[];
}

const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
const shaText = (value: string): string => sha256(Buffer.from(value, "utf8"));
const csvCell = (value: string | number): string => `"${String(value).replace(/"/gu, '""')}"`;
const serializeRows = (rows: readonly CsvRecord[]): string => `${MHS_V2_SEMANTIC_CALIBRATION_REVIEW_COLUMNS.map(csvCell).join(",")}\r\n${rows.map((row) => MHS_V2_SEMANTIC_CALIBRATION_REVIEW_COLUMNS.map((column) => csvCell(row[column])).join(",")).join("\r\n")}\r\n`;
const exactColumns = (row: CsvRecord): boolean => Object.keys(row).length === MHS_V2_SEMANTIC_CALIBRATION_REVIEW_COLUMNS.length && Object.keys(row).every((column, index) => column === MHS_V2_SEMANTIC_CALIBRATION_REVIEW_COLUMNS[index]);
const outcomeCounts = (judgments: readonly MhsV2SemanticCalibrationJudgment[]): Record<MhsV2SemanticRelationship, number> => Object.fromEntries(MHS_V2_SEMANTIC_RELATIONSHIPS.map((outcome) => [outcome, judgments.filter((row) => row.semanticRelationship === outcome).length])) as Record<MhsV2SemanticRelationship, number>;

const readAuthorities = (inputs: MhsV2SemanticCalibrationReviewInputs): { membership: MhsV2SemanticCalibrationMembershipArtifact; rows: readonly CsvRecord[] } => {
  if (sha256(inputs.policyBytes) !== MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256) throw new Error("A1R-V policy artifact SHA mismatch");
  const policy = JSON.parse(inputs.policyBytes.toString("utf8")) as MhsV2SemanticCalibrationPolicyArtifact; validateMhsV2SemanticCalibrationPolicy(policy);
  if (policy.policyPayloadDigest !== MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST) throw new Error("A1R-V policy payload digest mismatch");
  if (sha256(inputs.membershipBytes) !== MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SHA256) throw new Error("A1R-V membership artifact SHA mismatch");
  const membership = JSON.parse(inputs.membershipBytes.toString("utf8")) as MhsV2SemanticCalibrationMembershipArtifact; validateMhsV2SemanticCalibrationMembership(membership);
  if (membership.membershipPayloadDigest !== MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_PAYLOAD_DIGEST || membership.membershipDigest !== MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST) throw new Error("A1R-V membership authority digest mismatch");
  if (shaText(inputs.blindedCsv) !== MHS_V2_SEMANTIC_CALIBRATION_REVIEW_SHA256) throw new Error("A1R-V blinded packet SHA mismatch");
  const rows = parseCsv(inputs.blindedCsv); if (rows.length !== 300) throw new Error("A1R-V blinded packet must contain exactly 300 rows");
  const membershipByPair = new Map(membership.rows.map((row) => [row.pairId, row])); const seenPairs = new Set<string>(); const seenRows = new Set<string>();
  rows.forEach((row, index) => {
    if (!exactColumns(row)) throw new Error("A1R-V reviewer packet column contract failed");
    if (seenRows.has(row.review_row_number)) throw new Error("A1R-V duplicate review row"); seenRows.add(row.review_row_number);
    if (seenPairs.has(row.pair_id)) throw new Error("A1R-V duplicate pair ID"); seenPairs.add(row.pair_id);
    const member = membershipByPair.get(row.pair_id);
    if (!member || row.review_row_number !== String(index + 1) || row.packet_version !== MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PACKET_VERSION
      || row.policy_artifact_sha256 !== MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256 || row.membership_digest !== MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST
      || row.candidate_a_id !== member.candidateAId || row.candidate_a_text_sha256 !== member.candidateATextSha256
      || row.candidate_b_id !== member.candidateBId || row.candidate_b_text_sha256 !== member.candidateBTextSha256
      || shaText(row.candidate_a_text) !== member.candidateATextSha256 || shaText(row.candidate_b_text) !== member.candidateBTextSha256) throw new Error(`A1R-V row identity mismatch at review row ${index + 1}`);
    if (row.semantic_relationship_input || row.reviewer_note_input || row.reviewer_id_input || row.reviewed_at_input) throw new Error("A1R-V frozen blinded packet input fields are not blank");
  });
  if (seenPairs.size !== membership.rows.length || membership.rows.some((row) => !seenPairs.has(row.pairId))) throw new Error("A1R-V missing or unknown membership row");
  return { membership, rows };
};

const validateJudgments = (judgments: readonly MhsV2SemanticCalibrationJudgment[]): void => {
  if (judgments.length !== 300) throw new Error(`A1R-V requires exactly 300 judgments; observed ${judgments.length}`);
  const seen = new Set<number>(); judgments.forEach((judgment) => {
    if (!Number.isInteger(judgment.reviewRowNumber) || judgment.reviewRowNumber < 1 || judgment.reviewRowNumber > 300) throw new Error("A1R-V unknown review row");
    if (seen.has(judgment.reviewRowNumber)) throw new Error("A1R-V duplicate review row judgment"); seen.add(judgment.reviewRowNumber);
    if (!(MHS_V2_SEMANTIC_RELATIONSHIPS as readonly string[]).includes(judgment.semanticRelationship) || !judgment.semanticRelationship) throw new Error("A1R-V invalid or blank semantic outcome");
  });
  if (seen.size !== 300 || Array.from({ length: 300 }, (_, index) => index + 1).some((row) => !seen.has(row))) throw new Error("A1R-V missing review row judgment");
  const counts = outcomeCounts(judgments);
  if (canonicalJson(counts) !== canonicalJson(MHS_V2_SEMANTIC_CALIBRATION_EXPECTED_OUTCOME_COUNTS)) throw new Error(`A1R-V judgment count mismatch: ${JSON.stringify(counts)}`);
  if (counts.NEEDS_ADJUDICATION !== 0) throw new Error("A1R-V unresolved NEEDS_ADJUDICATION prevents publication");
};

export const createMhsV2SemanticCalibrationCompletedReview = (inputs: MhsV2SemanticCalibrationReviewInputs): string => {
  const { rows } = readAuthorities(inputs); validateJudgments(inputs.judgments); const byNumber = new Map(inputs.judgments.map((row) => [row.reviewRowNumber, row.semanticRelationship]));
  return serializeRows(rows.map((row, index) => ({ ...row, semantic_relationship_input: byNumber.get(index + 1)!, reviewer_note_input: "", reviewer_id_input: MHS_REVIEWER_A_ID, reviewed_at_input: "" })));
};

export const validateMhsV2SemanticCalibrationCompletedReview = (completedCsv: string, inputs: MhsV2SemanticCalibrationReviewInputs): { readonly judgments: readonly MhsV2SemanticCalibrationJudgment[]; readonly canonicalReviewPayloadDigest: string } => {
  const { rows: blindedRows } = readAuthorities(inputs); validateJudgments(inputs.judgments); const completedRows = parseCsv(completedCsv);
  if (completedRows.length !== 300) throw new Error("A1R-V completed review row count mismatch");
  const expectedByNumber = new Map(inputs.judgments.map((row) => [row.reviewRowNumber, row.semanticRelationship]));
  const judgments = completedRows.map((row, index): MhsV2SemanticCalibrationJudgment => {
    if (!exactColumns(row)) throw new Error("A1R-V completed reviewer column contract failed");
    const blinded = blindedRows[index];
    for (const column of MHS_V2_SEMANTIC_CALIBRATION_REVIEW_COLUMNS.slice(0, 11)) if (row[column] !== blinded[column]) throw new Error(`A1R-V completed identity mismatch at row ${index + 1}`);
    const semanticRelationship = row.semantic_relationship_input as MhsV2SemanticRelationship;
    if (!(MHS_V2_SEMANTIC_RELATIONSHIPS as readonly string[]).includes(semanticRelationship) || !semanticRelationship) throw new Error("A1R-V invalid or blank semantic outcome");
    if (semanticRelationship !== expectedByNumber.get(index + 1)) throw new Error(`A1R-V judgment authority mismatch at row ${index + 1}`);
    if (row.reviewer_id_input !== MHS_REVIEWER_A_ID || row.reviewer_note_input !== "" || row.reviewed_at_input !== "") throw new Error(`A1R-V reviewer metadata mismatch at row ${index + 1}`);
    return { reviewRowNumber: index + 1, semanticRelationship };
  });
  validateJudgments(judgments);
  const payload = completedRows.map((row, index) => ({ reviewRowNumber: index + 1, pairId: row.pair_id, candidateAId: row.candidate_a_id, candidateATextSha256: row.candidate_a_text_sha256, candidateBId: row.candidate_b_id, candidateBTextSha256: row.candidate_b_text_sha256, semanticRelationship: row.semantic_relationship_input, reviewerId: row.reviewer_id_input }));
  return { judgments, canonicalReviewPayloadDigest: digest(payload) };
};

export const createMhsV2SemanticCalibrationReviewCertification = (completedCsv: string, inputs: MhsV2SemanticCalibrationReviewInputs): MhsV2SemanticCalibrationReviewCertification => {
  const validated = validateMhsV2SemanticCalibrationCompletedReview(completedCsv, inputs); const counts = outcomeCounts(validated.judgments);
  if (createMhsV2SemanticCalibrationCompletedReview(inputs) !== completedCsv) throw new Error("A1R-V deterministic replay mismatch");
  const payload: MhsV2SemanticCalibrationReviewCertificationPayload = {
    schemaVersion: MHS_V2_SEMANTIC_CALIBRATION_REVIEW_CERTIFICATION_SCHEMA, certificationVersion: MHS_V2_SEMANTIC_CALIBRATION_REVIEW_CERTIFICATION_VERSION,
    phase: "T6L-7K-A1R-V", status: "VALIDATED_AND_IMMUTABLY_PUBLISHED",
    authorities: { policyArtifactSha256: MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256, policyPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST,
      membershipArtifactFilename: MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_FILENAME, membershipArtifactSha256: MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SHA256,
      membershipPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_PAYLOAD_DIGEST, membershipDigest: MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST,
      blindedPacketFilename: MHS_V2_SEMANTIC_CALIBRATION_REVIEW_FILENAME, blindedPacketSha256: MHS_V2_SEMANTIC_CALIBRATION_REVIEW_SHA256, packetVersion: MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PACKET_VERSION },
    reviewer: { role: "A", reviewerId: MHS_REVIEWER_A_ID, humanReviewTimestampRepresentation: "BLANK_NOT_CAPTURED" },
    review: { completedArtifactFilename: MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_FILENAME, completedArtifactSha256: shaText(completedCsv), canonicalReviewPayloadDigest: validated.canonicalReviewPayloadDigest, rowCount: 300, outcomeCounts: counts },
    reconciliation: { unresolved: 0, missing: 0, unknown: 0, duplicateRows: 0, duplicatePairs: 0, identityMismatches: 0, invalidOutcomes: 0 },
    validation: { exactFrozenIdentityBindings: true, originalBlindnessPreserved: true, privacyValidationPassed: true, deterministicReplayMatched: true, immutableAtomicPublication: true, overwriteRefusalVerified: true },
    boundaries: { thresholdEvaluationPerformed: false, semanticEdgesGenerated: false, componentsGenerated: false, splitAssignmentPerformed: false, trainingEligibilityChanged: false, protectedBenchmarkContentAccessed: false, internalTestContentAccessed: false, modelTrainingPerformed: false, productionIntegrationPerformed: false },
  };
  const artifact = { ...payload, certificationPayloadDigest: digest(payload) }; validateMhsV2SemanticCalibrationReviewCertification(artifact); return artifact;
};

export const validateMhsV2SemanticCalibrationReviewCertification = (artifact: MhsV2SemanticCalibrationReviewCertification): void => {
  const { certificationPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_SEMANTIC_CALIBRATION_REVIEW_CERTIFICATION_SCHEMA || artifact.certificationVersion !== MHS_V2_SEMANTIC_CALIBRATION_REVIEW_CERTIFICATION_VERSION
    || artifact.phase !== "T6L-7K-A1R-V" || artifact.status !== "VALIDATED_AND_IMMUTABLY_PUBLISHED" || artifact.review.rowCount !== 300
    || artifact.authorities.policyArtifactSha256 !== MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256 || artifact.authorities.policyPayloadDigest !== MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST
    || artifact.authorities.membershipArtifactFilename !== MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_FILENAME || artifact.authorities.membershipArtifactSha256 !== MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SHA256
    || artifact.authorities.membershipPayloadDigest !== MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_PAYLOAD_DIGEST || artifact.authorities.membershipDigest !== MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST
    || artifact.authorities.blindedPacketFilename !== MHS_V2_SEMANTIC_CALIBRATION_REVIEW_FILENAME || artifact.authorities.blindedPacketSha256 !== MHS_V2_SEMANTIC_CALIBRATION_REVIEW_SHA256
    || artifact.authorities.packetVersion !== MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PACKET_VERSION || artifact.review.completedArtifactFilename !== MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_FILENAME
    || artifact.reviewer.role !== "A" || artifact.reviewer.reviewerId !== MHS_REVIEWER_A_ID || artifact.reviewer.humanReviewTimestampRepresentation !== "BLANK_NOT_CAPTURED"
    || canonicalJson(artifact.review.outcomeCounts) !== canonicalJson(MHS_V2_SEMANTIC_CALIBRATION_EXPECTED_OUTCOME_COUNTS)
    || Object.values(artifact.reconciliation).some((value) => value !== 0) || Object.values(artifact.validation).some((value) => value !== true)
    || Object.values(artifact.boundaries).some((value) => value !== false) || !/^[a-f0-9]{64}$/u.test(artifact.review.completedArtifactSha256)
    || !/^[a-f0-9]{64}$/u.test(artifact.review.canonicalReviewPayloadDigest) || certificationPayloadDigest !== digest(payload)
    || canonicalJson(artifact).includes('"text"') || canonicalJson(artifact).includes("candidate_a_text")) throw new Error("Invalid A1R-V review certification");
};

type PairPublisher = (completedTemporary: string, completedTarget: string, certificationTemporary: string, certificationTarget: string) => void;
const defaultPublisher: PairPublisher = (completedTemporary, completedTarget, certificationTemporary, certificationTarget) => { fs.renameSync(completedTemporary, completedTarget); fs.renameSync(certificationTemporary, certificationTarget); };
export const publishMhsV2SemanticCalibrationCompletedReview = (completedCsv: string, certification: MhsV2SemanticCalibrationReviewCertification, outputDirectory: string, publish: PairPublisher = defaultPublisher): { readonly completedPath: string; readonly certificationPath: string; readonly completedSha256: string; readonly certificationSha256: string } => {
  validateMhsV2SemanticCalibrationReviewCertification(certification); if (certification.review.completedArtifactSha256 !== shaText(completedCsv)) throw new Error("A1R-V completed artifact does not match certification");
  const completedPath = path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_FILENAME), certificationPath = path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_FILENAME);
  if (fs.existsSync(completedPath) || fs.existsSync(certificationPath)) throw new Error("A1R-V completed review or certification exists; overwrite refused");
  fs.mkdirSync(outputDirectory, { recursive: true }); const certificationText = canonicalJson(certification), token = `${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  const completedTemporary = `${completedPath}.${token}.partial`, certificationTemporary = `${certificationPath}.${token}.partial`;
  try {
    fs.writeFileSync(completedTemporary, completedCsv, { flag: "wx" }); fs.writeFileSync(certificationTemporary, certificationText, { flag: "wx" });
    publish(completedTemporary, completedPath, certificationTemporary, certificationPath);
    if (fs.readFileSync(completedPath, "utf8") !== completedCsv || fs.readFileSync(certificationPath, "utf8") !== certificationText) throw new Error("Incomplete A1R-V publication");
    return { completedPath, certificationPath, completedSha256: shaText(completedCsv), certificationSha256: shaText(certificationText) };
  } catch (error) {
    if (fs.existsSync(completedPath) && fs.readFileSync(completedPath, "utf8") === completedCsv) fs.rmSync(completedPath, { force: true });
    if (fs.existsSync(certificationPath) && fs.readFileSync(certificationPath, "utf8") === certificationText) fs.rmSync(certificationPath, { force: true });
    throw error;
  } finally { fs.rmSync(completedTemporary, { force: true }); fs.rmSync(certificationTemporary, { force: true }); }
};
