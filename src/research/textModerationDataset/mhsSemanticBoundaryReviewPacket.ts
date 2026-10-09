import crypto from "node:crypto";
import fs from "node:fs";

import { CsvRecord, parseCsv } from "./csv";
import { sha256 } from "./manifest";
import { MhsCandidateAdmissionArtifact, validateMhsCandidateAdmissionArtifact } from "./mhsCandidateAdmission";
import { MHS_CANDIDATE_ARTIFACT_SHA256, MHS_CANDIDATE_PAYLOAD_DIGEST } from "./mhsCandidateIntegrityAudit";
import { MhsSemanticAuditArtifact, MhsSemanticFinding, validateMhsSemanticAuditArtifact } from "./mhsSemanticIntegrityAudit";
import {
  MHS_SEMANTIC_RELATIONSHIP_OUTCOMES, MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST, MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST, MHS_SEMANTIC_SOURCE_SHA256,
  MhsSemanticRelationshipOutcome, MhsSemanticReviewManifest, validateMhsSemanticReviewManifest,
} from "./mhsSemanticReviewPacket";
import {
  MHS_SEMANTIC_PRECISION_FILENAME, MHS_SEMANTIC_REVIEWER_ID, MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME,
  MhsSemanticPrecisionArtifact, MhsSemanticValidatedReviewArtifact, validateMhsSemanticPrecisionArtifact,
  validateMhsSemanticValidatedReviewArtifact,
} from "./mhsSemanticReviewValidation";

export const MHS_SEMANTIC_BOUNDARY_PACKET_VERSION = "STHN_TEXT_MODERATION_MHS_SEMANTIC_BOUNDARY_REVIEW_PACKET_V1" as const;
export const MHS_SEMANTIC_BOUNDARY_PACKET_SEED = "STHN-T6L-6J-J-SEMANTIC-BOUNDARY-HOLDOUT-2026-09-12" as const;
export const MHS_SEMANTIC_BOUNDARY_PACKET_SIZE = 75 as const;
export const MHS_SEMANTIC_BOUNDARY_REUSE_CAP = 8 as const;
export const MHS_SEMANTIC_H_MANIFEST_SHA256 = "2402f995c1300954a2316fe247132d5fcefb2e5d83e4e0d84e91770d7be95377" as const;
export const MHS_SEMANTIC_I_VALIDATED_SHA256 = "be9b5e86884d91f85438c83d400a8d0b67a562b8ed798ff5d93c6a6cb5f2685b" as const;
export const MHS_SEMANTIC_I_VALIDATED_PAYLOAD_DIGEST = "a88b815bf52fbacfe81f356f2cc7f7ef7d3ecfc0e3af29497abfc68aec530fd1" as const;
export const MHS_SEMANTIC_I_PRECISION_SHA256 = "a6a11352e70d70e9cb920e1f48979519fdac8023311085a8804c8a1d0f50237c" as const;
export const MHS_SEMANTIC_I_PRECISION_PAYLOAD_DIGEST = "6be59d5a471db9a0ddd71563e3ad82de5cc4bbd2ecdb7074387209b4221bbb60" as const;
export const MHS_SEMANTIC_BOUNDARY_BLINDED_FILENAME = "mhs-semantic-boundary-review-v1-blinded.csv" as const;
export const MHS_SEMANTIC_BOUNDARY_MANIFEST_FILENAME = "mhs-semantic-boundary-review-v1-internal-manifest.json" as const;
export const MHS_SEMANTIC_BOUNDARY_INSTRUCTIONS_FILENAME = "mhs-semantic-boundary-review-v1-instructions.md" as const;
export const MHS_SEMANTIC_BOUNDARY_SUMMARY_FILENAME = "mhs-semantic-boundary-review-v1-summary.json" as const;
export const MHS_SEMANTIC_BOUNDARY_MEMBERSHIP_DIGEST = "3812d3231695c1981a807a264b92538240d95f524bbfdb0cbf4055072989def1" as const;

export const MHS_SEMANTIC_BOUNDARY_STRATA = ["SCORE_084_TO_085", "SCORE_083_TO_084", "SCORE_082_TO_083"] as const;
export type MhsSemanticBoundaryStratum = typeof MHS_SEMANTIC_BOUNDARY_STRATA[number];
export const MHS_SEMANTIC_BOUNDARY_PAIR_TYPES = ["ALLOW_ALLOW", "ALLOW_BLOCK", "BLOCK_BLOCK_SAME_PRIMARY_CATEGORY", "BLOCK_BLOCK_DIFFERENT_PRIMARY_CATEGORY"] as const;
export type MhsSemanticBoundaryPairType = typeof MHS_SEMANTIC_BOUNDARY_PAIR_TYPES[number];
const TARGETS: Readonly<Record<MhsSemanticBoundaryStratum, number>> = { SCORE_084_TO_085: 33, SCORE_083_TO_084: 27, SCORE_082_TO_083: 15 };

export const MHS_SEMANTIC_BOUNDARY_COLUMNS = [
  "pair_row_number", "packet_version", "candidate_a_id", "candidate_b_id", "candidate_a_digest", "candidate_b_digest",
  "candidate_a_text", "candidate_b_text", "semantic_relationship_input", "reviewer_note_input", "reviewer_id_input", "reviewed_at_input",
] as const;
type BoundaryColumn = typeof MHS_SEMANTIC_BOUNDARY_COLUMNS[number];
const inputColumns = ["semantic_relationship_input", "reviewer_note_input", "reviewer_id_input", "reviewed_at_input"] as const;

export interface MhsSemanticBoundaryPair {
  readonly pairRowNumber: number; readonly pairKey: string; readonly candidateAId: string; readonly candidateBId: string;
  readonly candidateADigest: string; readonly candidateBDigest: string; readonly candidateAText: string; readonly candidateBText: string;
  readonly semanticScore: number; readonly scoreStratum: MhsSemanticBoundaryStratum; readonly pairType: MhsSemanticBoundaryPairType;
  readonly candidateAPrimaryCategory: string | null; readonly candidateBPrimaryCategory: string | null;
}
export interface MhsSemanticBoundaryManifest {
  readonly schemaVersion: "STHN_TEXT_MODERATION_MHS_SEMANTIC_BOUNDARY_MEMBERSHIP_V1"; readonly packetVersion: typeof MHS_SEMANTIC_BOUNDARY_PACKET_VERSION;
  readonly seed: typeof MHS_SEMANTIC_BOUNDARY_PACKET_SEED; readonly selectionAlgorithm: "EXCLUDE_H_THEN_DESCENDING_SCORE_WITH_SEEDED_TIEBREAK_V1";
  readonly sourceSemanticArtifactSha256: typeof MHS_SEMANTIC_SOURCE_SHA256; readonly sourceSemanticPayloadDigest: typeof MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST;
  readonly sourceCandidateArtifactSha256: typeof MHS_CANDIDATE_ARTIFACT_SHA256; readonly sourceCandidatePayloadDigest: typeof MHS_CANDIDATE_PAYLOAD_DIGEST;
  readonly hManifestSha256: typeof MHS_SEMANTIC_H_MANIFEST_SHA256; readonly hMembershipDigest: typeof MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST;
  readonly iValidatedArtifactSha256: typeof MHS_SEMANTIC_I_VALIDATED_SHA256; readonly iValidatedPayloadDigest: typeof MHS_SEMANTIC_I_VALIDATED_PAYLOAD_DIGEST;
  readonly iPrecisionArtifactSha256: typeof MHS_SEMANTIC_I_PRECISION_SHA256; readonly iPrecisionPayloadDigest: typeof MHS_SEMANTIC_I_PRECISION_PAYLOAD_DIGEST;
  readonly preferredAllocation: { readonly SCORE_084_TO_085: 35; readonly SCORE_083_TO_084: 25; readonly SCORE_082_TO_083: 15 };
  readonly actualAllocation: Readonly<Record<MhsSemanticBoundaryStratum, number>>; readonly packetSize: typeof MHS_SEMANTIC_BOUNDARY_PACKET_SIZE;
  readonly hOverlapCount: 0; readonly membershipDigest: string; readonly rows: readonly MhsSemanticBoundaryPair[];
}
export interface MhsSemanticBoundarySources { readonly semantic: MhsSemanticAuditArtifact; readonly candidate: MhsCandidateAdmissionArtifact; readonly hManifest: MhsSemanticReviewManifest; }
export interface ImportedMhsSemanticBoundaryReview { readonly pairRowNumber: number; readonly pairKey: string; readonly relationship: MhsSemanticRelationshipOutcome; readonly reviewerNote: string | null; readonly reviewerId: string; readonly reviewedAt: string; }

const digest = (...parts: readonly string[]): string => crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const key = (pair: Pick<MhsSemanticFinding, "candidateAId" | "candidateBId">): string => [pair.candidateAId, pair.candidateBId].sort().join("::");
export const mhsSemanticBoundaryStratum = (score: number): MhsSemanticBoundaryStratum | null => score >= 0.84 && score < 0.85 ? "SCORE_084_TO_085" : score >= 0.83 && score < 0.84 ? "SCORE_083_TO_084" : score >= 0.82 && score < 0.83 ? "SCORE_082_TO_083" : null;
export const mhsSemanticBoundaryPairType = (pair: MhsSemanticFinding): MhsSemanticBoundaryPairType => pair.allowBlockConflict ? "ALLOW_BLOCK" : pair.candidateADecision === "ALLOW" ? "ALLOW_ALLOW"
  : pair.candidateAPrimaryCategory === pair.candidateBPrimaryCategory ? "BLOCK_BLOCK_SAME_PRIMARY_CATEGORY" : "BLOCK_BLOCK_DIFFERENT_PRIMARY_CATEGORY";
export const mhsSemanticBoundaryMembershipDigest = (rows: readonly Pick<MhsSemanticBoundaryPair, "pairRowNumber" | "pairKey">[]): string => digest(...rows.map((row) => `${row.pairRowNumber}:${row.pairKey}`));
const readBound = <T>(filename: string, expectedSha: string, validate: (value: T) => void): T => { const bytes = fs.readFileSync(filename); if (sha256(bytes) !== expectedSha) throw new Error(`Semantic boundary source SHA-256 mismatch: ${filename}`); const value = JSON.parse(bytes.toString("utf8")) as T; validate(value); return value; };

export const loadMhsSemanticBoundarySources = (paths: { readonly semanticPath: string; readonly candidatePath: string; readonly hManifestPath: string; readonly iValidatedPath: string; readonly iPrecisionPath: string }): MhsSemanticBoundarySources => {
  const semantic = readBound<MhsSemanticAuditArtifact>(paths.semanticPath, MHS_SEMANTIC_SOURCE_SHA256, validateMhsSemanticAuditArtifact);
  const candidate = readBound<MhsCandidateAdmissionArtifact>(paths.candidatePath, MHS_CANDIDATE_ARTIFACT_SHA256, validateMhsCandidateAdmissionArtifact);
  const hManifest = readBound<MhsSemanticReviewManifest>(paths.hManifestPath, MHS_SEMANTIC_H_MANIFEST_SHA256, validateMhsSemanticReviewManifest);
  const validated = readBound<MhsSemanticValidatedReviewArtifact>(paths.iValidatedPath, MHS_SEMANTIC_I_VALIDATED_SHA256, validateMhsSemanticValidatedReviewArtifact);
  const precision = readBound<MhsSemanticPrecisionArtifact>(paths.iPrecisionPath, MHS_SEMANTIC_I_PRECISION_SHA256, validateMhsSemanticPrecisionArtifact);
  if (semantic.semanticAuditPayloadDigest !== MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST || candidate.candidatePayloadDigest !== MHS_CANDIDATE_PAYLOAD_DIGEST
    || hManifest.membershipDigest !== MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST || validated.validatedReviewPayloadDigest !== MHS_SEMANTIC_I_VALIDATED_PAYLOAD_DIGEST
    || precision.precisionPayloadDigest !== MHS_SEMANTIC_I_PRECISION_PAYLOAD_DIGEST || validated.reviewerId !== MHS_SEMANTIC_REVIEWER_ID) throw new Error("Semantic boundary source payload authority mismatch");
  return { semantic, candidate, hManifest };
};

export const selectMhsSemanticBoundaryPairs = (sources: MhsSemanticBoundarySources): readonly MhsSemanticBoundaryPair[] => {
  const hKeys = new Set(sources.hManifest.rows.map((row) => row.pairKey)); const candidates = new Map(sources.candidate.rows.filter((row) => row.candidateAdmitted).map((row) => [row.sourceRowId, row]));
  const eligible = sources.semantic.findings.filter((finding) => !hKeys.has(key(finding)) && mhsSemanticBoundaryStratum(finding.similarity) !== null);
  const chosen: MhsSemanticFinding[] = [];
  for (const stratum of MHS_SEMANTIC_BOUNDARY_STRATA) {
    const available = eligible.filter((finding) => mhsSemanticBoundaryStratum(finding.similarity) === stratum).sort((a, b) => b.similarity - a.similarity
      || digest(MHS_SEMANTIC_BOUNDARY_PACKET_SEED, MHS_SEMANTIC_SOURCE_SHA256, key(a)).localeCompare(digest(MHS_SEMANTIC_BOUNDARY_PACKET_SEED, MHS_SEMANTIC_SOURCE_SHA256, key(b))));
    if (available.length < TARGETS[stratum]) throw new Error(`Semantic boundary stratum availability changed: ${stratum}`); chosen.push(...available.slice(0, TARGETS[stratum]));
  }
  if (chosen.length !== MHS_SEMANTIC_BOUNDARY_PACKET_SIZE || new Set(chosen.map(key)).size !== chosen.length || chosen.some((finding) => hKeys.has(key(finding)) || finding.similarity >= 0.85)) throw new Error("Semantic boundary membership violates holdout authority");
  const reuse = new Map<string, number>(); chosen.forEach((finding) => [finding.candidateAId, finding.candidateBId].forEach((id) => reuse.set(id, (reuse.get(id) ?? 0) + 1)));
  if (Math.max(...reuse.values()) > MHS_SEMANTIC_BOUNDARY_REUSE_CAP) throw new Error("Semantic boundary candidate reuse exceeds the bounded cap");
  return chosen.sort((a, b) => b.similarity - a.similarity || key(a).localeCompare(key(b))).map((finding, index) => {
    const a = candidates.get(finding.candidateAId); const b = candidates.get(finding.candidateBId); if (!a?.reviewedText || !b?.reviewedText || a.textDigest !== finding.candidateADigest || b.textDigest !== finding.candidateBDigest) throw new Error("Semantic boundary finding lacks candidate text authority");
    return { pairRowNumber: index + 1, pairKey: key(finding), candidateAId: finding.candidateAId, candidateBId: finding.candidateBId,
      candidateADigest: finding.candidateADigest, candidateBDigest: finding.candidateBDigest, candidateAText: a.reviewedText, candidateBText: b.reviewedText,
      semanticScore: finding.similarity, scoreStratum: mhsSemanticBoundaryStratum(finding.similarity)!, pairType: mhsSemanticBoundaryPairType(finding),
      candidateAPrimaryCategory: finding.candidateAPrimaryCategory, candidateBPrimaryCategory: finding.candidateBPrimaryCategory };
  });
};

export const createMhsSemanticBoundaryManifest = (rows: readonly MhsSemanticBoundaryPair[], hManifest: MhsSemanticReviewManifest): MhsSemanticBoundaryManifest => {
  const hKeys = new Set(hManifest.rows.map((row) => row.pairKey)); const overlap = rows.filter((row) => hKeys.has(row.pairKey)).length; if (overlap !== 0) throw new Error("Semantic boundary packet overlaps H membership");
  return { schemaVersion: "STHN_TEXT_MODERATION_MHS_SEMANTIC_BOUNDARY_MEMBERSHIP_V1", packetVersion: MHS_SEMANTIC_BOUNDARY_PACKET_VERSION,
    seed: MHS_SEMANTIC_BOUNDARY_PACKET_SEED, selectionAlgorithm: "EXCLUDE_H_THEN_DESCENDING_SCORE_WITH_SEEDED_TIEBREAK_V1",
    sourceSemanticArtifactSha256: MHS_SEMANTIC_SOURCE_SHA256, sourceSemanticPayloadDigest: MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST,
    sourceCandidateArtifactSha256: MHS_CANDIDATE_ARTIFACT_SHA256, sourceCandidatePayloadDigest: MHS_CANDIDATE_PAYLOAD_DIGEST,
    hManifestSha256: MHS_SEMANTIC_H_MANIFEST_SHA256, hMembershipDigest: MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST,
    iValidatedArtifactSha256: MHS_SEMANTIC_I_VALIDATED_SHA256, iValidatedPayloadDigest: MHS_SEMANTIC_I_VALIDATED_PAYLOAD_DIGEST,
    iPrecisionArtifactSha256: MHS_SEMANTIC_I_PRECISION_SHA256, iPrecisionPayloadDigest: MHS_SEMANTIC_I_PRECISION_PAYLOAD_DIGEST,
    preferredAllocation: { SCORE_084_TO_085: 35, SCORE_083_TO_084: 25, SCORE_082_TO_083: 15 }, actualAllocation: { SCORE_084_TO_085: 33, SCORE_083_TO_084: 27, SCORE_082_TO_083: 15 },
    packetSize: MHS_SEMANTIC_BOUNDARY_PACKET_SIZE, hOverlapCount: 0, membershipDigest: mhsSemanticBoundaryMembershipDigest(rows), rows };
};

export const validateMhsSemanticBoundaryManifest = (manifest: MhsSemanticBoundaryManifest): void => {
  if (manifest.schemaVersion !== "STHN_TEXT_MODERATION_MHS_SEMANTIC_BOUNDARY_MEMBERSHIP_V1" || manifest.packetVersion !== MHS_SEMANTIC_BOUNDARY_PACKET_VERSION
    || manifest.seed !== MHS_SEMANTIC_BOUNDARY_PACKET_SEED || manifest.selectionAlgorithm !== "EXCLUDE_H_THEN_DESCENDING_SCORE_WITH_SEEDED_TIEBREAK_V1"
    || manifest.sourceSemanticArtifactSha256 !== MHS_SEMANTIC_SOURCE_SHA256 || manifest.sourceSemanticPayloadDigest !== MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST
    || manifest.sourceCandidateArtifactSha256 !== MHS_CANDIDATE_ARTIFACT_SHA256 || manifest.sourceCandidatePayloadDigest !== MHS_CANDIDATE_PAYLOAD_DIGEST
    || manifest.hManifestSha256 !== MHS_SEMANTIC_H_MANIFEST_SHA256 || manifest.hMembershipDigest !== MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST
    || manifest.iValidatedArtifactSha256 !== MHS_SEMANTIC_I_VALIDATED_SHA256 || manifest.iValidatedPayloadDigest !== MHS_SEMANTIC_I_VALIDATED_PAYLOAD_DIGEST
    || manifest.iPrecisionArtifactSha256 !== MHS_SEMANTIC_I_PRECISION_SHA256 || manifest.iPrecisionPayloadDigest !== MHS_SEMANTIC_I_PRECISION_PAYLOAD_DIGEST
    || manifest.packetSize !== MHS_SEMANTIC_BOUNDARY_PACKET_SIZE || manifest.rows.length !== MHS_SEMANTIC_BOUNDARY_PACKET_SIZE || manifest.hOverlapCount !== 0
    || manifest.membershipDigest !== mhsSemanticBoundaryMembershipDigest(manifest.rows)) throw new Error("Invalid semantic boundary manifest authority");
  if (manifest.membershipDigest !== MHS_SEMANTIC_BOUNDARY_MEMBERSHIP_DIGEST) throw new Error("Semantic boundary frozen membership changed");
  if (new Set(manifest.rows.map((row) => row.pairKey)).size !== manifest.rows.length || manifest.rows.some((row, index) => row.pairRowNumber !== index + 1 || row.pairKey !== [row.candidateAId, row.candidateBId].sort().join("::") || row.semanticScore >= 0.85 || mhsSemanticBoundaryStratum(row.semanticScore) !== row.scoreStratum)) throw new Error("Invalid semantic boundary manifest row");
};

const csvCell = (value: string | number): string => `"${String(value).replace(/"/g, '""')}"`;
export const createMhsSemanticBoundaryCsv = (rows: readonly MhsSemanticBoundaryPair[]): string => {
  if (rows.length !== MHS_SEMANTIC_BOUNDARY_PACKET_SIZE) throw new Error("Semantic boundary CSV requires 75 rows");
  const records = rows.map((row) => ({ pair_row_number: String(row.pairRowNumber), packet_version: MHS_SEMANTIC_BOUNDARY_PACKET_VERSION,
    candidate_a_id: row.candidateAId, candidate_b_id: row.candidateBId, candidate_a_digest: row.candidateADigest, candidate_b_digest: row.candidateBDigest,
    candidate_a_text: row.candidateAText, candidate_b_text: row.candidateBText, semantic_relationship_input: "", reviewer_note_input: "", reviewer_id_input: "", reviewed_at_input: "" } satisfies Record<BoundaryColumn, string>));
  return `${MHS_SEMANTIC_BOUNDARY_COLUMNS.map(csvCell).join(",")}\r\n${records.map((record) => MHS_SEMANTIC_BOUNDARY_COLUMNS.map((column) => csvCell(record[column])).join(",")).join("\r\n")}\r\n`;
};
const assertColumns = (record: CsvRecord): void => { const actual = Object.keys(record); if (actual.length !== MHS_SEMANTIC_BOUNDARY_COLUMNS.length || MHS_SEMANTIC_BOUNDARY_COLUMNS.some((column, index) => actual[index] !== column)) throw new Error("Semantic boundary CSV columns do not match the contract"); };
const immutableRows = (csv: string, manifest: MhsSemanticBoundaryManifest): readonly CsvRecord[] => { validateMhsSemanticBoundaryManifest(manifest); const records = parseCsv(csv); if (records.length !== MHS_SEMANTIC_BOUNDARY_PACKET_SIZE) throw new Error("Semantic boundary CSV must contain 75 rows"); const seen = new Set<string>(); records.forEach((record, index) => {
  assertColumns(record); const expected = manifest.rows[index]; const pairKey = [record.candidate_a_id, record.candidate_b_id].sort().join("::"); if (seen.has(pairKey)) throw new Error(`Duplicate semantic boundary pair at row ${index + 1}`); seen.add(pairKey);
  if (pairKey !== expected.pairKey) throw new Error(`Unknown or reordered semantic boundary pair at row ${index + 1}`);
  if (record.pair_row_number !== String(expected.pairRowNumber) || record.packet_version !== MHS_SEMANTIC_BOUNDARY_PACKET_VERSION || record.candidate_a_id !== expected.candidateAId || record.candidate_b_id !== expected.candidateBId
    || record.candidate_a_digest !== expected.candidateADigest || record.candidate_b_digest !== expected.candidateBDigest) throw new Error(`Semantic boundary identity or digest changed at row ${index + 1}`);
  if (record.candidate_a_text !== expected.candidateAText || record.candidate_b_text !== expected.candidateBText) throw new Error(`Semantic boundary text changed at row ${index + 1}`);
}); return records; };
export const validatePreparedMhsSemanticBoundaryCsv = (csv: string, manifest: MhsSemanticBoundaryManifest): void => { immutableRows(csv, manifest).forEach((record) => inputColumns.forEach((column) => { if (record[column] !== "") throw new Error(`Prepared semantic boundary field ${column} must be blank`); })); };
export const parseCompletedMhsSemanticBoundaryCsv = (csv: string, manifest: MhsSemanticBoundaryManifest, expectedReviewerId: string): readonly ImportedMhsSemanticBoundaryReview[] => {
  if (expectedReviewerId !== MHS_SEMANTIC_REVIEWER_ID) throw new Error("Expected semantic boundary reviewer identity must be a"); return immutableRows(csv, manifest).map((record, index) => {
    if (record.reviewer_id_input !== expectedReviewerId) throw new Error(`Semantic boundary reviewer identity mismatch at row ${index + 1}`);
    if (!MHS_SEMANTIC_RELATIONSHIP_OUTCOMES.includes(record.semantic_relationship_input as MhsSemanticRelationshipOutcome)) throw new Error(`Invalid semantic boundary relationship at row ${index + 1}`);
    if (record.reviewer_note_input.length > 500) throw new Error(`Semantic boundary note exceeds 500 characters at row ${index + 1}`);
    const timestamp = record.reviewed_at_input; if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) throw new Error(`Invalid semantic boundary timestamp at row ${index + 1}`);
    return { pairRowNumber: manifest.rows[index].pairRowNumber, pairKey: manifest.rows[index].pairKey, relationship: record.semantic_relationship_input as MhsSemanticRelationshipOutcome,
      reviewerNote: record.reviewer_note_input || null, reviewerId: expectedReviewerId, reviewedAt: timestamp };
  });
};

const tally = (values: readonly string[]): Readonly<Record<string, number>> => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));
export const summarizeMhsSemanticBoundaryPacket = (manifest: MhsSemanticBoundaryManifest, csv: string): Readonly<Record<string, unknown>> => {
  validatePreparedMhsSemanticBoundaryCsv(csv, manifest); const reuse = new Map<string, number>(); manifest.rows.forEach((row) => [row.candidateAId, row.candidateBId].forEach((id) => reuse.set(id, (reuse.get(id) ?? 0) + 1)));
  const values = [...reuse.values()].sort((a, b) => a - b); const middle = Math.floor(values.length / 2);
  return { packetVersion: manifest.packetVersion, seed: manifest.seed, packetSize: manifest.packetSize, membershipDigest: manifest.membershipDigest,
    hMembershipDigest: manifest.hMembershipDigest, hOverlapCount: manifest.hOverlapCount, sourceSemanticArtifactSha256: manifest.sourceSemanticArtifactSha256,
    sourceSemanticPayloadDigest: manifest.sourceSemanticPayloadDigest, scoreStratumCounts: tally(manifest.rows.map((row) => row.scoreStratum)), pairTypeCounts: tally(manifest.rows.map((row) => row.pairType)),
    candidateReuse: { representedCandidates: reuse.size, maximum: Math.max(...values), mean: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6)),
      median: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2, distribution: tally(values.map(String)), cap: MHS_SEMANTIC_BOUNDARY_REUSE_CAP },
    reviewerInputFieldsBlank: true, candidateMembershipChanged: false, semanticThresholdsChanged: false, frozenBenchmarkAccessed: false, trainingEligibleCount: 0,
    status: "PREPARED_AWAITING_AUTHORIZED_HUMAN_BOUNDARY_REVIEW" };
};

export const MHS_SEMANTIC_BOUNDARY_INSTRUCTIONS = `# STHN MHS semantic boundary review v1

For each pair, judge only what semantic relationship exists between the two texts. Do not reassess moderation labels, categories, PII, admission, or training eligibility.

- DUPLICATE — essentially the same operative meaning.
- NEAR_DUPLICATE — substantially the same core meaning with a meaningful but limited difference.
- RELATED_BUT_DISTINCT — a genuine semantic connection exists, but the messages are materially different.
- UNRELATED — no meaningful semantic relationship.
- NEEDS_ADJUDICATION — meaning cannot be compared confidently.

Judge meaning, not shared words or moderation characteristics. Shared abusive words do not make texts related. Both being sexual, mentioning the same identity group, or belonging to the same moderation category does not make texts related. Same topic alone does not imply near-duplicate. Opposite claims are not duplicates. Base the relationship on what the texts actually communicate.

Keep the header, row order, immutable fields, and exactly 75 rows. Complete semantic_relationship_input, reviewer_id_input, and reviewed_at_input using strict UTC ISO milliseconds (YYYY-MM-DDTHH:mm:ss.sssZ). reviewer_note_input is optional and limited to 500 characters. Validation will not apply judgments to candidate state.
`;
