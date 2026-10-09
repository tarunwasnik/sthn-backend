import crypto from "node:crypto";
import fs from "node:fs";

import { CsvRecord, parseCsv } from "./csv";
import { canonicalJson, sha256 } from "./manifest";
import {
  MHS_CANDIDATE_ARTIFACT_SHA256, MHS_CANDIDATE_PAYLOAD_DIGEST,
} from "./mhsCandidateIntegrityAudit";
import {
  MhsCandidateAdmissionArtifact, validateMhsCandidateAdmissionArtifact,
} from "./mhsCandidateAdmission";
import {
  MHS_SEMANTIC_AUDIT_FILENAME, MhsSemanticAuditArtifact, MhsSemanticFinding, validateMhsSemanticAuditArtifact,
} from "./mhsSemanticIntegrityAudit";

export const MHS_SEMANTIC_REVIEW_PACKET_VERSION = "STHN_TEXT_MODERATION_MHS_SEMANTIC_REVIEW_PACKET_V1" as const;
export const MHS_SEMANTIC_REVIEW_PACKET_SEED = "STHN-T6L-6J-H-SEMANTIC-REVIEW-2026-09-11" as const;
export const MHS_SEMANTIC_REVIEW_PACKET_SIZE = 150 as const;
export const MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST = "de0758750604d7de5bf62d8e2924d84880c33def92705e6f67c8607e10c939ca" as const;
export const MHS_SEMANTIC_SOURCE_SHA256 = "aa3d24ebba90d6ea7eb0a8f491ceb7b0e8e98c6f08c7e865701dbde6f591a998" as const;
export const MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST = "f56f3e05503c7f54e6ca0a82673c2d168834104f5790311a7926a8f442d2a303" as const;
export const MHS_SEMANTIC_REVIEW_REUSE_CAP = 8 as const;
export const MHS_SEMANTIC_REVIEW_MIXED_SCRIPT_TARGET = 4 as const;
export const MHS_SEMANTIC_REVIEW_DIRECTORY = "semantic-review" as const;
export const MHS_SEMANTIC_REVIEW_CSV_FILENAME = "mhs-semantic-review-v1-blinded.csv" as const;
export const MHS_SEMANTIC_REVIEW_MANIFEST_FILENAME = "mhs-semantic-review-v1-internal-manifest.json" as const;
export const MHS_SEMANTIC_REVIEW_INSTRUCTIONS_FILENAME = "mhs-semantic-review-v1-instructions.md" as const;
export const MHS_SEMANTIC_REVIEW_SUMMARY_FILENAME = "mhs-semantic-review-v1-summary.json" as const;

export const MHS_SEMANTIC_RELATIONSHIP_OUTCOMES = [
  "DUPLICATE", "NEAR_DUPLICATE", "RELATED_BUT_DISTINCT", "UNRELATED", "NEEDS_ADJUDICATION",
] as const;
export type MhsSemanticRelationshipOutcome = typeof MHS_SEMANTIC_RELATIONSHIP_OUTCOMES[number];
export const MHS_SEMANTIC_SCORE_BANDS = ["SCORE_085_PLUS", "SCORE_083_TO_085", "SCORE_081_TO_083", "SCORE_080_TO_081"] as const;
export type MhsSemanticScoreBand = typeof MHS_SEMANTIC_SCORE_BANDS[number];
export const MHS_SEMANTIC_DECISION_RELATIONSHIPS = ["ALLOW_ALLOW", "ALLOW_BLOCK", "BLOCK_BLOCK_SAME_CATEGORY", "BLOCK_BLOCK_DIFFERENT_CATEGORY"] as const;
export type MhsSemanticDecisionRelationship = typeof MHS_SEMANTIC_DECISION_RELATIONSHIPS[number];

export const MHS_SEMANTIC_REVIEW_COLUMNS = [
  "pair_row_number", "packet_version", "source_semantic_artifact_sha", "candidate_a_id", "candidate_b_id",
  "candidate_a_digest", "candidate_b_digest", "candidate_a_text", "candidate_b_text", "score_band",
  "semantic_relationship_input", "reviewer_note_input", "reviewer_id_input", "reviewed_at_input",
] as const;
export type MhsSemanticReviewColumn = typeof MHS_SEMANTIC_REVIEW_COLUMNS[number];
const inputColumns = ["semantic_relationship_input", "reviewer_note_input", "reviewer_id_input", "reviewed_at_input"] as const;

const QUOTAS: Readonly<Record<MhsSemanticScoreBand, Readonly<Record<MhsSemanticDecisionRelationship, number>>>> = {
  SCORE_085_PLUS: { ALLOW_ALLOW: 5, ALLOW_BLOCK: 5, BLOCK_BLOCK_SAME_CATEGORY: 4, BLOCK_BLOCK_DIFFERENT_CATEGORY: 5 },
  SCORE_083_TO_085: { ALLOW_ALLOW: 10, ALLOW_BLOCK: 11, BLOCK_BLOCK_SAME_CATEGORY: 6, BLOCK_BLOCK_DIFFERENT_CATEGORY: 8 },
  SCORE_081_TO_083: { ALLOW_ALLOW: 15, ALLOW_BLOCK: 14, BLOCK_BLOCK_SAME_CATEGORY: 16, BLOCK_BLOCK_DIFFERENT_CATEGORY: 3 },
  SCORE_080_TO_081: { ALLOW_ALLOW: 15, ALLOW_BLOCK: 15, BLOCK_BLOCK_SAME_CATEGORY: 4, BLOCK_BLOCK_DIFFERENT_CATEGORY: 14 },
};

export interface MhsSemanticReviewPair {
  readonly pairRowNumber: number; readonly pairKey: string; readonly candidateAId: string; readonly candidateBId: string;
  readonly candidateADigest: string; readonly candidateBDigest: string; readonly candidateAText: string; readonly candidateBText: string;
  readonly semanticScore: number; readonly scoreBand: MhsSemanticScoreBand; readonly decisionRelationship: MhsSemanticDecisionRelationship;
  readonly candidateADecision: "ALLOW" | "BLOCK"; readonly candidateBDecision: "ALLOW" | "BLOCK";
  readonly candidateAPrimaryCategory: string | null; readonly candidateBPrimaryCategory: string | null;
  readonly categoryRelationship: "NOT_BLOCK_BLOCK" | "SAME_PRIMARY_CATEGORY" | "DIFFERENT_PRIMARY_CATEGORY";
  readonly multilingualOrMixedScript: boolean; readonly scriptGroups: readonly string[];
}

export interface MhsSemanticReviewManifest {
  readonly schemaVersion: "STHN_TEXT_MODERATION_MHS_SEMANTIC_REVIEW_MEMBERSHIP_V1";
  readonly packetVersion: typeof MHS_SEMANTIC_REVIEW_PACKET_VERSION; readonly seed: typeof MHS_SEMANTIC_REVIEW_PACKET_SEED;
  readonly sourceSemanticArtifactFilename: typeof MHS_SEMANTIC_AUDIT_FILENAME; readonly sourceSemanticArtifactSha256: typeof MHS_SEMANTIC_SOURCE_SHA256;
  readonly sourceSemanticPayloadDigest: typeof MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST; readonly sourceCandidateArtifactSha256: typeof MHS_CANDIDATE_ARTIFACT_SHA256;
  readonly sourceCandidatePayloadDigest: typeof MHS_CANDIDATE_PAYLOAD_DIGEST; readonly packetSize: typeof MHS_SEMANTIC_REVIEW_PACKET_SIZE;
  readonly membershipDigest: string; readonly rows: readonly MhsSemanticReviewPair[];
}

export interface ImportedMhsSemanticPairReview {
  readonly pairRowNumber: number; readonly pairKey: string; readonly relationship: MhsSemanticRelationshipOutcome;
  readonly reviewerNote: string | null; readonly reviewerId: string; readonly reviewedAt: string;
}

const digest = (...parts: readonly string[]): string => crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const pairKey = (finding: Pick<MhsSemanticFinding, "candidateAId" | "candidateBId">): string => `${finding.candidateAId}::${finding.candidateBId}`;
export const mhsSemanticScoreBand = (score: number): MhsSemanticScoreBand => score >= 0.85 ? "SCORE_085_PLUS" : score >= 0.83 ? "SCORE_083_TO_085" : score >= 0.81 ? "SCORE_081_TO_083" : "SCORE_080_TO_081";
export const mhsSemanticDecisionRelationship = (finding: MhsSemanticFinding): MhsSemanticDecisionRelationship => finding.allowBlockConflict ? "ALLOW_BLOCK"
  : finding.candidateADecision === "ALLOW" ? "ALLOW_ALLOW"
    : finding.blockClassificationConflict ? "BLOCK_BLOCK_DIFFERENT_CATEGORY" : "BLOCK_BLOCK_SAME_CATEGORY";

const scripts = (text: string): readonly string[] => {
  const definitions = [
    ["LATIN", /\p{Script=Latin}/u], ["DEVANAGARI", /\p{Script=Devanagari}/u], ["THAI", /\p{Script=Thai}/u],
    ["ARABIC", /\p{Script=Arabic}/u], ["CYRILLIC", /\p{Script=Cyrillic}/u], ["HAN", /\p{Script=Han}/u],
  ] as const;
  return definitions.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
};
const isMixedPair = (a: string, b: string): { readonly value: boolean; readonly groups: readonly string[] } => {
  const aScripts = scripts(a); const bScripts = scripts(b); const groups = [...new Set([...aScripts, ...bScripts])].sort();
  return { value: aScripts.length > 1 || bScripts.length > 1 || (aScripts.length > 0 && bScripts.length > 0 && aScripts.join("|") !== bScripts.join("|")), groups };
};
const readBoundSource = <T>(filename: string, expectedSha: string, expectedPayload: string, payloadField: keyof T, validate: (artifact: T) => void): T => {
  const bytes = fs.readFileSync(filename); if (sha256(bytes) !== expectedSha) throw new Error(`Semantic review source SHA-256 mismatch: ${filename}`);
  const artifact = JSON.parse(bytes.toString("utf8")) as T; validate(artifact);
  if (artifact[payloadField] !== expectedPayload) throw new Error(`Semantic review source payload digest mismatch: ${filename}`); return artifact;
};
const tally = (values: readonly string[]): Readonly<Record<string, number>> => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));

export const mhsSemanticReviewMembershipDigest = (rows: readonly Pick<MhsSemanticReviewPair, "pairRowNumber" | "pairKey">[]): string => digest(...rows.map((row) => `${row.pairRowNumber}:${row.pairKey}`));

export const selectMhsSemanticReviewPairs = (semantic: MhsSemanticAuditArtifact, candidate: MhsCandidateAdmissionArtifact): readonly MhsSemanticReviewPair[] => {
  validateMhsSemanticAuditArtifact(semantic); validateMhsCandidateAdmissionArtifact(candidate);
  if (semantic.semanticAuditPayloadDigest !== MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST || candidate.candidatePayloadDigest !== MHS_CANDIDATE_PAYLOAD_DIGEST) throw new Error("Semantic review source payload digest mismatch");
  const candidates = new Map(candidate.rows.filter((row) => row.candidateAdmitted).map((row) => [row.sourceRowId, row]));
  const selected = new Map<string, MhsSemanticFinding>(); const reuse = new Map<string, number>();
  const add = (finding: MhsSemanticFinding): boolean => {
    const key = pairKey(finding); if (selected.has(key)) return false;
    if ((reuse.get(finding.candidateAId) ?? 0) >= MHS_SEMANTIC_REVIEW_REUSE_CAP || (reuse.get(finding.candidateBId) ?? 0) >= MHS_SEMANTIC_REVIEW_REUSE_CAP) return false;
    selected.set(key, finding); reuse.set(finding.candidateAId, (reuse.get(finding.candidateAId) ?? 0) + 1); reuse.set(finding.candidateBId, (reuse.get(finding.candidateBId) ?? 0) + 1); return true;
  };
  const ranking = (values: readonly MhsSemanticFinding[]): readonly MhsSemanticFinding[] => [...values].sort((a, b) => {
    const aMax = Math.max(reuse.get(a.candidateAId) ?? 0, reuse.get(a.candidateBId) ?? 0); const bMax = Math.max(reuse.get(b.candidateAId) ?? 0, reuse.get(b.candidateBId) ?? 0);
    const aSum = (reuse.get(a.candidateAId) ?? 0) + (reuse.get(a.candidateBId) ?? 0); const bSum = (reuse.get(b.candidateAId) ?? 0) + (reuse.get(b.candidateBId) ?? 0);
    return aMax - bMax || aSum - bSum || digest(MHS_SEMANTIC_REVIEW_PACKET_SEED, MHS_SEMANTIC_SOURCE_SHA256, pairKey(a)).localeCompare(digest(MHS_SEMANTIC_REVIEW_PACKET_SEED, MHS_SEMANTIC_SOURCE_SHA256, pairKey(b)));
  });
  const matchesMixed = (finding: MhsSemanticFinding): boolean => {
    const a = candidates.get(finding.candidateAId); const b = candidates.get(finding.candidateBId); if (!a?.reviewedText || !b?.reviewedText) throw new Error("Semantic finding references an unknown candidate");
    return isMixedPair(a.reviewedText, b.reviewedText).value;
  };
  const highest = semantic.findings.filter((finding) => mhsSemanticScoreBand(finding.similarity) === "SCORE_085_PLUS");
  if (highest.length !== 19 || highest.some((finding) => !add(finding))) throw new Error("Highest-score semantic stratum changed or exceeds reuse cap");
  for (const finding of ranking(semantic.findings.filter(matchesMixed))) { if ([...selected.values()].filter(matchesMixed).length >= MHS_SEMANTIC_REVIEW_MIXED_SCRIPT_TARGET) break; add(finding); }
  const cells = MHS_SEMANTIC_SCORE_BANDS.flatMap((scoreBand) => MHS_SEMANTIC_DECISION_RELATIONSHIPS.map((relationship) => ({
    scoreBand, relationship, target: QUOTAS[scoreBand][relationship], available: semantic.findings.filter((item) => mhsSemanticScoreBand(item.similarity) === scoreBand && mhsSemanticDecisionRelationship(item) === relationship).length,
  }))).sort((a, b) => a.available / a.target - b.available / b.target || a.scoreBand.localeCompare(b.scoreBand) || a.relationship.localeCompare(b.relationship));
  for (const { scoreBand, relationship, target } of cells) {
    let present = [...selected.values()].filter((finding) => mhsSemanticScoreBand(finding.similarity) === scoreBand && mhsSemanticDecisionRelationship(finding) === relationship).length;
    for (const finding of ranking(semantic.findings.filter((item) => mhsSemanticScoreBand(item.similarity) === scoreBand && mhsSemanticDecisionRelationship(item) === relationship))) {
      if (present >= target) break; if (add(finding)) present += 1;
    }
    if (present !== target) throw new Error(`Semantic review sampling stratum underflow: ${scoreBand}/${relationship}`);
  }
  if (selected.size !== MHS_SEMANTIC_REVIEW_PACKET_SIZE) throw new Error("Semantic review packet must contain exactly 150 pairs");
  return [...selected.values()].sort((a, b) => b.similarity - a.similarity || pairKey(a).localeCompare(pairKey(b))).map((finding, index) => {
    const a = candidates.get(finding.candidateAId)!; const b = candidates.get(finding.candidateBId)!;
    if (!a.reviewedText || !b.reviewedText || a.textDigest !== finding.candidateADigest || b.textDigest !== finding.candidateBDigest) throw new Error("Semantic finding candidate text/digest authority mismatch");
    const mixed = isMixedPair(a.reviewedText, b.reviewedText); const relationship = mhsSemanticDecisionRelationship(finding);
    return { pairRowNumber: index + 1, pairKey: pairKey(finding), candidateAId: finding.candidateAId, candidateBId: finding.candidateBId,
      candidateADigest: finding.candidateADigest, candidateBDigest: finding.candidateBDigest, candidateAText: a.reviewedText, candidateBText: b.reviewedText,
      semanticScore: finding.similarity, scoreBand: mhsSemanticScoreBand(finding.similarity), decisionRelationship: relationship,
      candidateADecision: finding.candidateADecision, candidateBDecision: finding.candidateBDecision,
      candidateAPrimaryCategory: finding.candidateAPrimaryCategory, candidateBPrimaryCategory: finding.candidateBPrimaryCategory,
      categoryRelationship: relationship === "BLOCK_BLOCK_SAME_CATEGORY" ? "SAME_PRIMARY_CATEGORY" : relationship === "BLOCK_BLOCK_DIFFERENT_CATEGORY" ? "DIFFERENT_PRIMARY_CATEGORY" : "NOT_BLOCK_BLOCK",
      multilingualOrMixedScript: mixed.value, scriptGroups: mixed.groups };
  });
};

export const createMhsSemanticReviewManifest = (rows: readonly MhsSemanticReviewPair[]): MhsSemanticReviewManifest => ({
  schemaVersion: "STHN_TEXT_MODERATION_MHS_SEMANTIC_REVIEW_MEMBERSHIP_V1", packetVersion: MHS_SEMANTIC_REVIEW_PACKET_VERSION,
  seed: MHS_SEMANTIC_REVIEW_PACKET_SEED, sourceSemanticArtifactFilename: MHS_SEMANTIC_AUDIT_FILENAME,
  sourceSemanticArtifactSha256: MHS_SEMANTIC_SOURCE_SHA256, sourceSemanticPayloadDigest: MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST,
  sourceCandidateArtifactSha256: MHS_CANDIDATE_ARTIFACT_SHA256, sourceCandidatePayloadDigest: MHS_CANDIDATE_PAYLOAD_DIGEST,
  packetSize: MHS_SEMANTIC_REVIEW_PACKET_SIZE, membershipDigest: mhsSemanticReviewMembershipDigest(rows), rows,
});

const csvCell = (value: string | number): string => `"${String(value).replace(/"/g, '""')}"`;
export const createMhsSemanticReviewCsv = (rows: readonly MhsSemanticReviewPair[]): string => {
  if (rows.length !== MHS_SEMANTIC_REVIEW_PACKET_SIZE) throw new Error("Semantic review CSV requires exactly 150 pairs");
  const records = rows.map((row) => ({ pair_row_number: String(row.pairRowNumber), packet_version: MHS_SEMANTIC_REVIEW_PACKET_VERSION,
    source_semantic_artifact_sha: MHS_SEMANTIC_SOURCE_SHA256, candidate_a_id: row.candidateAId, candidate_b_id: row.candidateBId,
    candidate_a_digest: row.candidateADigest, candidate_b_digest: row.candidateBDigest, candidate_a_text: row.candidateAText,
    candidate_b_text: row.candidateBText, score_band: row.scoreBand, semantic_relationship_input: "", reviewer_note_input: "",
    reviewer_id_input: "", reviewed_at_input: "" } satisfies Record<MhsSemanticReviewColumn, string>));
  return `${MHS_SEMANTIC_REVIEW_COLUMNS.map(csvCell).join(",")}\r\n${records.map((row) => MHS_SEMANTIC_REVIEW_COLUMNS.map((column) => csvCell(row[column])).join(",")).join("\r\n")}\r\n`;
};

const assertColumns = (record: CsvRecord): void => {
  const actual = Object.keys(record); if (actual.length !== MHS_SEMANTIC_REVIEW_COLUMNS.length || MHS_SEMANTIC_REVIEW_COLUMNS.some((column, index) => actual[index] !== column)) throw new Error("Semantic review CSV columns do not match the versioned contract");
};
const validateImmutableRows = (csv: string, manifest: MhsSemanticReviewManifest): readonly CsvRecord[] => {
  validateMhsSemanticReviewManifest(manifest); const records = parseCsv(csv);
  if (records.length !== MHS_SEMANTIC_REVIEW_PACKET_SIZE) throw new Error("Semantic review CSV must contain exactly 150 rows");
  const seen = new Set<string>(); records.forEach((record, index) => {
    assertColumns(record); const expected = manifest.rows[index]; const key = `${record.candidate_a_id}::${record.candidate_b_id}`;
    if (seen.has(key)) throw new Error(`Duplicate semantic pair: ${key}`); seen.add(key);
    if (key !== expected.pairKey) throw new Error(`Unknown or reordered semantic pair at row ${index + 1}`);
    if (record.pair_row_number !== String(expected.pairRowNumber) || record.packet_version !== MHS_SEMANTIC_REVIEW_PACKET_VERSION || record.source_semantic_artifact_sha !== MHS_SEMANTIC_SOURCE_SHA256
      || record.candidate_a_digest !== expected.candidateADigest || record.candidate_b_digest !== expected.candidateBDigest) throw new Error(`Semantic pair identity or digest changed at row ${index + 1}`);
    if (record.candidate_a_text !== expected.candidateAText || record.candidate_b_text !== expected.candidateBText) throw new Error(`Semantic pair text changed at row ${index + 1}`);
    if (record.score_band !== expected.scoreBand) throw new Error(`Semantic score band changed at row ${index + 1}`);
  }); return records;
};

export const validateMhsSemanticReviewManifest = (manifest: MhsSemanticReviewManifest): void => {
  if (manifest.schemaVersion !== "STHN_TEXT_MODERATION_MHS_SEMANTIC_REVIEW_MEMBERSHIP_V1" || manifest.packetVersion !== MHS_SEMANTIC_REVIEW_PACKET_VERSION
    || manifest.seed !== MHS_SEMANTIC_REVIEW_PACKET_SEED || manifest.sourceSemanticArtifactFilename !== MHS_SEMANTIC_AUDIT_FILENAME
    || manifest.sourceSemanticArtifactSha256 !== MHS_SEMANTIC_SOURCE_SHA256 || manifest.sourceSemanticPayloadDigest !== MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST
    || manifest.sourceCandidateArtifactSha256 !== MHS_CANDIDATE_ARTIFACT_SHA256 || manifest.sourceCandidatePayloadDigest !== MHS_CANDIDATE_PAYLOAD_DIGEST
    || manifest.packetSize !== MHS_SEMANTIC_REVIEW_PACKET_SIZE || manifest.rows.length !== MHS_SEMANTIC_REVIEW_PACKET_SIZE
    || manifest.membershipDigest !== MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST || manifest.membershipDigest !== mhsSemanticReviewMembershipDigest(manifest.rows)) throw new Error("Invalid semantic review manifest authority");
  if (new Set(manifest.rows.map((row) => row.pairKey)).size !== MHS_SEMANTIC_REVIEW_PACKET_SIZE || manifest.rows.some((row, index) => row.pairRowNumber !== index + 1 || row.pairKey !== `${row.candidateAId}::${row.candidateBId}`)) throw new Error("Invalid semantic review manifest membership");
};

export const validatePreparedMhsSemanticReviewCsv = (csv: string, manifest: MhsSemanticReviewManifest): void => {
  const records = validateImmutableRows(csv, manifest); records.forEach((record) => inputColumns.forEach((column) => { if (record[column] !== "") throw new Error(`Prepared semantic reviewer field ${column} must be blank`); }));
};

export const parseCompletedMhsSemanticReviewCsv = (csv: string, manifest: MhsSemanticReviewManifest, expectedReviewerId: string): readonly ImportedMhsSemanticPairReview[] => {
  if (!expectedReviewerId.trim() || expectedReviewerId.length > 100) throw new Error("Expected semantic reviewer identity is invalid");
  return validateImmutableRows(csv, manifest).map((record, index) => {
    if (record.reviewer_id_input !== expectedReviewerId) throw new Error(`Semantic reviewer identity mismatch at row ${index + 1}`);
    if (!(MHS_SEMANTIC_RELATIONSHIP_OUTCOMES as readonly string[]).includes(record.semantic_relationship_input)) throw new Error(`Invalid semantic relationship at row ${index + 1}`);
    if (record.reviewer_note_input.length > 500) throw new Error(`Semantic reviewer note exceeds 500 characters at row ${index + 1}`);
    const timestamp = record.reviewed_at_input; if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) throw new Error(`Invalid semantic review timestamp at row ${index + 1}`);
    return { pairRowNumber: manifest.rows[index].pairRowNumber, pairKey: manifest.rows[index].pairKey,
      relationship: record.semantic_relationship_input as MhsSemanticRelationshipOutcome, reviewerNote: record.reviewer_note_input || null,
      reviewerId: expectedReviewerId, reviewedAt: timestamp };
  });
};

export const loadMhsSemanticReviewSources = (semanticPath: string, candidatePath: string): { readonly semantic: MhsSemanticAuditArtifact; readonly candidate: MhsCandidateAdmissionArtifact } => ({
  semantic: readBoundSource<MhsSemanticAuditArtifact>(semanticPath, MHS_SEMANTIC_SOURCE_SHA256, MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST, "semanticAuditPayloadDigest", validateMhsSemanticAuditArtifact),
  candidate: readBoundSource<MhsCandidateAdmissionArtifact>(candidatePath, MHS_CANDIDATE_ARTIFACT_SHA256, MHS_CANDIDATE_PAYLOAD_DIGEST, "candidatePayloadDigest", validateMhsCandidateAdmissionArtifact),
});

export const summarizeMhsSemanticReviewPacket = (manifest: MhsSemanticReviewManifest, csv: string): Readonly<Record<string, unknown>> => {
  validatePreparedMhsSemanticReviewCsv(csv, manifest); const reuse = new Map<string, number>();
  manifest.rows.forEach((row) => { reuse.set(row.candidateAId, (reuse.get(row.candidateAId) ?? 0) + 1); reuse.set(row.candidateBId, (reuse.get(row.candidateBId) ?? 0) + 1); });
  const reuseValues = [...reuse.values()].sort((a, b) => a - b); const middle = Math.floor(reuseValues.length / 2);
  const blockPairs = manifest.rows.filter((row) => row.decisionRelationship.startsWith("BLOCK_BLOCK"));
  return { packetVersion: manifest.packetVersion, seed: manifest.seed, sourceSemanticArtifactSha256: manifest.sourceSemanticArtifactSha256,
    sourceSemanticPayloadDigest: manifest.sourceSemanticPayloadDigest, membershipDigest: manifest.membershipDigest, packetSize: manifest.rows.length,
    scoreBandCounts: tally(manifest.rows.map((row) => row.scoreBand)), decisionRelationshipCounts: tally(manifest.rows.map((row) => row.decisionRelationship)),
    categoryRelationshipCounts: tally(manifest.rows.map((row) => row.categoryRelationship)),
    blockPrimaryCategoryPairCounts: tally(blockPairs.map((row) => [row.candidateAPrimaryCategory, row.candidateBPrimaryCategory].sort().join("__"))),
    multilingualOrMixedScriptCount: manifest.rows.filter((row) => row.multilingualOrMixedScript).length,
    candidateReuse: { uniqueCandidates: reuse.size, maximum: Math.max(...reuseValues), mean: Number((reuseValues.reduce((sum, value) => sum + value, 0) / reuseValues.length).toFixed(6)),
      median: reuseValues.length % 2 ? reuseValues[middle] : (reuseValues[middle - 1] + reuseValues[middle]) / 2, distribution: tally(reuseValues.map(String)), cap: MHS_SEMANTIC_REVIEW_REUSE_CAP },
    blindedCsvSha256: sha256(Buffer.from(csv, "utf8")), reviewerInputFieldsBlank: true, candidateMembershipChanged: false,
    candidateJudgmentsChanged: false, trainingEligibleCount: 0, status: "PREPARED_AWAITING_AUTHORIZED_HUMAN_SEMANTIC_REVIEW" };
};

export const MHS_SEMANTIC_REVIEW_INSTRUCTIONS = `# STHN MHS semantic pair review v1

For each row, answer only: **What semantic relationship exists between these two candidate texts?** Do not reassess moderation decisions, categories, PII, admission, or training eligibility.

- **DUPLICATE** — the operative meaning is the same and differences are superficial.
- **NEAR_DUPLICATE** — the meaning is substantially the same, but a meaningful wording or context difference remains.
- **RELATED_BUT_DISTINCT** — the pair concerns the same topic or concept, but its meaning is materially different.
- **UNRELATED** — there is no meaningful semantic overlap.
- **NEEDS_ADJUDICATION** — the relationship cannot be determined confidently.

Judge meaning, not shared keywords. The same topic or identity-group mention does not establish duplication. Opposite stances, and reporting versus endorsement, can be materially different. Policy-changing distinctions matter. Spelling or punctuation changes alone may still be duplicates. Equivalent translations may be duplicates or near-duplicates. Judge slang and multilingual phrasing by meaning where understood; otherwise use NEEDS_ADJUDICATION.

Keep the header, row order, immutable fields, and exactly 150 rows. Complete semantic_relationship_input, reviewer_id_input, and reviewed_at_input (strict UTC ISO format such as 2026-09-11T10:00:00.000Z). reviewer_note_input is optional and limited to 500 characters. Return the UTF-8 CSV through the authorized project channel. Validation does not mutate or admit candidates.
`;
