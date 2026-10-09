import crypto from "node:crypto";
import { CsvRecord, parseCsv } from "./csv";
import { PiiStatus } from "./contracts";
import {
  MHS_REVIEW_ALLOCATION, MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST, MHS_REVIEW_TRANCHE_VERSION, MhsReviewAllocation,
  MhsReviewTrancheRow, ReviewerSlot, TrancheReasonCode, TrancheReview,
} from "./mhsReviewTranche";

export const MHS_REVIEW_PILOT_VERSION = "STHN_TEXT_MODERATION_MHS_REVIEW_PILOT_V1" as const;
export const MHS_REVIEW_PILOT_SEED = "STHN-T6L-6J-A-HUMAN-PILOT-2026-09-09" as const;
export const MHS_REVIEW_PILOT_SIZE = 100 as const;
export const MHS_REVIEW_PILOT_PER_ALLOCATION = 20 as const;
export const MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST = "7015203ff9c697d2d199e6cc47222b46bc0fcf87f47e142c144fd44755e8f96e" as const;

export const REVIEWER_PACKET_COLUMNS = [
  "pilot_row_number", "pilot_version", "parent_tranche_version", "packet_role", "source_row_id", "comment_id",
  "text_to_review", "text_digest", "pii_status_current", "pii_disposition_input", "decision_input",
  "primary_category_input", "secondary_categories_input", "reason_code_input", "reviewer_note_input",
  "reviewer_id_input", "independence_declaration_input", "reviewed_at_input",
] as const;
export type ReviewerPacketColumn = typeof REVIEWER_PACKET_COLUMNS[number];

export const REVIEW_DECISIONS = ["ALLOW", "BLOCK", "NEEDS_ADJUDICATION", "EXCLUDE"] as const;
export const REVIEW_CATEGORIES = ["PROFANITY", "SEXUAL", "ABUSIVE_OR_HARASSING", "HATE", "THREAT_OR_VIOLENCE", "OTHER_INAPPROPRIATE"] as const;
export const PILOT_REVIEW_REASON_CODES = [
  "POLICY_ACCEPTABLE", "DIRECT_PROFANITY", "SEXUAL_CONTENT", "TARGETED_ABUSE", "PROTECTED_GROUP_HATE",
  "THREAT_OR_VIOLENCE", "COUNTERSPEECH_OR_REPORTING", "BENIGN_CONTEXT", "INSUFFICIENT_CONTEXT",
  "PII_OR_DATA_QUALITY", "OTHER_POLICY_MISMATCH", "OTHER_INAPPROPRIATE_REQUIRES_ADJUDICATION",
] as const satisfies readonly TrancheReasonCode[];
export const PILOT_PII_DISPOSITIONS = ["NONE", "REQUIRES_REVIEW", "EXCLUDE"] as const;
const inputColumns = ["pii_disposition_input", "decision_input", "primary_category_input", "secondary_categories_input", "reason_code_input", "reviewer_note_input", "reviewer_id_input", "independence_declaration_input", "reviewed_at_input"] as const;

export interface MhsReviewPilotRow {
  readonly pilotRowNumber: number;
  readonly pilotVersion: typeof MHS_REVIEW_PILOT_VERSION;
  readonly parentTrancheVersion: typeof MHS_REVIEW_TRANCHE_VERSION;
  readonly parentTrancheMembershipDigest: typeof MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST;
  readonly sourceRowId: string;
  readonly commentId: string;
  readonly allocation: MhsReviewAllocation;
  readonly membershipStrata: MhsReviewTrancheRow["membershipStrata"];
  readonly text: string;
  readonly textDigest: string;
  readonly piiStatus: PiiStatus;
}

export interface ImportedPilotReview {
  readonly sourceRowId: string;
  readonly commentId: string;
  readonly piiDisposition: typeof PILOT_PII_DISPOSITIONS[number];
  readonly review: TrancheReview;
}

const digest = (...parts: readonly string[]): string => crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
export const mhsReviewPilotMembershipDigest = (rows: readonly Pick<MhsReviewPilotRow, "pilotRowNumber" | "sourceRowId">[]): string => digest(...rows.map((row) => `${row.pilotRowNumber}:${row.sourceRowId}`));

export const selectMhsReviewPilot = (parent: readonly MhsReviewTrancheRow[], seed = MHS_REVIEW_PILOT_SEED): readonly MhsReviewPilotRow[] => {
  if (parent.length !== 3000 || new Set(parent.map((row) => row.commentId)).size !== parent.length) throw new Error("Pilot requires the frozen unique 3,000-row parent tranche");
  const selected: MhsReviewTrancheRow[] = [];
  (Object.keys(MHS_REVIEW_ALLOCATION) as MhsReviewAllocation[]).forEach((allocation) => {
    const bucket = parent.filter((row) => row.allocation === allocation)
      .map((row) => ({ row, rank: digest(seed, allocation, row.sourceRowId) })).sort((a, b) => a.rank.localeCompare(b.rank));
    if (bucket.length < MHS_REVIEW_PILOT_PER_ALLOCATION) throw new Error(`Pilot allocation ${allocation} underflow`);
    selected.push(...bucket.slice(0, MHS_REVIEW_PILOT_PER_ALLOCATION).map(({ row }) => row));
  });
  if (selected.length !== MHS_REVIEW_PILOT_SIZE || new Set(selected.map((row) => row.commentId)).size !== MHS_REVIEW_PILOT_SIZE) throw new Error("Pilot must contain exactly 100 unique comments");
  return selected.map((row, index) => ({ pilotRowNumber: index + 1, pilotVersion: MHS_REVIEW_PILOT_VERSION,
    parentTrancheVersion: MHS_REVIEW_TRANCHE_VERSION, parentTrancheMembershipDigest: MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST,
    sourceRowId: row.sourceRowId, commentId: row.commentId, allocation: row.allocation, membershipStrata: row.membershipStrata,
    text: row.text, textDigest: row.textDigest, piiStatus: row.piiStatus }));
};

const safeSpreadsheetText = (value: string): string => /^[=+\-@]/.test(value) ? `'${value}` : value;
const csvCell = (value: string | number): string => `"${String(value).replace(/"/g, '""')}"`;
export const createMhsPilotReviewerCsv = (pilot: readonly MhsReviewPilotRow[], role: ReviewerSlot): string => {
  if (role !== "A") throw new Error("Reviewer A is the sole active MHS reviewer");
  if (pilot.length !== MHS_REVIEW_PILOT_SIZE) throw new Error("Reviewer packet requires exactly 100 pilot rows");
  const rows = pilot.map((row) => ({
    pilot_row_number: String(row.pilotRowNumber), pilot_version: row.pilotVersion, parent_tranche_version: row.parentTrancheVersion,
    packet_role: role, source_row_id: row.sourceRowId, comment_id: row.commentId, text_to_review: safeSpreadsheetText(row.text),
    text_digest: row.textDigest, pii_status_current: row.piiStatus, pii_disposition_input: "", decision_input: "",
    primary_category_input: "", secondary_categories_input: "", reason_code_input: "", reviewer_note_input: "",
    reviewer_id_input: "", independence_declaration_input: "", reviewed_at_input: "",
  } satisfies Record<ReviewerPacketColumn, string>));
  return `${REVIEWER_PACKET_COLUMNS.map(csvCell).join(",")}\r\n${rows.map((row) => REVIEWER_PACKET_COLUMNS.map((column) => csvCell(row[column])).join(",")).join("\r\n")}\r\n`;
};

const assertColumns = (row: CsvRecord): void => {
  const actual = Object.keys(row); if (actual.length !== REVIEWER_PACKET_COLUMNS.length || REVIEWER_PACKET_COLUMNS.some((column, index) => actual[index] !== column)) throw new Error("Reviewer packet columns do not match the frozen contract");
};
const validateIdentityRows = (records: readonly CsvRecord[], role: ReviewerSlot, pilot: readonly MhsReviewPilotRow[]): void => {
  if (role !== "A") throw new Error("Reviewer A is the sole active MHS reviewer");
  if (pilot.length !== MHS_REVIEW_PILOT_SIZE || mhsReviewPilotMembershipDigest(pilot) !== MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST) throw new Error("Pilot membership does not match the frozen contract");
  if (pilot.some((row) => row.parentTrancheVersion !== MHS_REVIEW_TRANCHE_VERSION || row.parentTrancheMembershipDigest !== MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST)) throw new Error("Pilot parent-tranche identity mismatch");
  if (records.length !== MHS_REVIEW_PILOT_SIZE) throw new Error("Reviewer packet must contain exactly 100 rows");
  const expectedById = new Map(pilot.map((row) => [row.sourceRowId, row])); const seen = new Set<string>();
  records.forEach((record, index) => {
    assertColumns(record); const expected = expectedById.get(record.source_row_id); if (!expected) throw new Error(`Unknown pilot row ${record.source_row_id}`);
    if (seen.has(record.source_row_id)) throw new Error(`Duplicate pilot row ${record.source_row_id}`); seen.add(record.source_row_id);
    if (record.packet_role !== role) throw new Error(`Reviewer packet role mismatch: expected ${role}`);
    if (record.pilot_row_number !== String(expected.pilotRowNumber) || record.pilot_version !== MHS_REVIEW_PILOT_VERSION || record.parent_tranche_version !== MHS_REVIEW_TRANCHE_VERSION || record.comment_id !== expected.commentId) throw new Error(`Pilot identity mismatch at row ${index + 1}`);
    if (record.text_to_review !== safeSpreadsheetText(expected.text) || record.text_digest !== expected.textDigest) throw new Error(`Altered text or digest at pilot row ${expected.pilotRowNumber}`);
    if (record.pii_status_current !== expected.piiStatus) throw new Error(`PII input state mismatch at pilot row ${expected.pilotRowNumber}`);
  });
};

export const validatePreparedMhsPilotPacket = (csv: string, role: ReviewerSlot, pilot: readonly MhsReviewPilotRow[]): void => {
  const records = parseCsv(csv); validateIdentityRows(records, role, pilot);
  records.forEach((record) => inputColumns.forEach((column) => { if (record[column] !== "") throw new Error(`Prepared reviewer field ${column} must be blank`); }));
};

const bounded = <T extends string>(value: string, allowed: readonly T[], field: string): T => {
  if (!allowed.includes(value as T)) throw new Error(`Invalid ${field}: ${value}`); return value as T;
};
export const parseCompletedMhsPilotPacket = (csv: string, role: ReviewerSlot, reviewerId: string, pilot: readonly MhsReviewPilotRow[]): readonly ImportedPilotReview[] => {
  if (!reviewerId.trim()) throw new Error("Expected reviewer identity is required"); const records = parseCsv(csv); validateIdentityRows(records, role, pilot);
  return records.map((record) => {
    if (record.reviewer_id_input !== reviewerId) throw new Error(`Reviewer identity mismatch for ${record.source_row_id}`);
    if (record.independence_declaration_input !== "INDEPENDENT_REVIEW_WITHOUT_PRIOR_JUDGMENT_ACCESS") throw new Error(`Reviewer independence declaration missing for ${record.source_row_id}`);
    const decision = bounded(record.decision_input, REVIEW_DECISIONS, "decision"); const primary = record.primary_category_input ? bounded(record.primary_category_input, REVIEW_CATEGORIES, "primary category") : null;
    const secondary = record.secondary_categories_input ? record.secondary_categories_input.split(";").map((value) => bounded(value.trim(), REVIEW_CATEGORIES, "secondary category")) : [];
    if (new Set(secondary).size !== secondary.length || (primary && secondary.includes(primary))) throw new Error("Reviewer categories must be unique");
    if (decision === "BLOCK" && !primary) throw new Error("BLOCK review requires a primary category"); if (decision !== "BLOCK" && (primary || secondary.length)) throw new Error("Non-BLOCK review cannot carry categories");
    const reasonCode = bounded(record.reason_code_input, PILOT_REVIEW_REASON_CODES, "reason code"); const piiDisposition = bounded(record.pii_disposition_input, PILOT_PII_DISPOSITIONS, "PII disposition");
    if ((record.reviewer_note_input?.length ?? 0) > 500 || !Number.isFinite(Date.parse(record.reviewed_at_input))) throw new Error("Reviewer note or timestamp is invalid");
    const expected = pilot.find((row) => row.sourceRowId === record.source_row_id)!;
    return { sourceRowId: expected.sourceRowId, commentId: expected.commentId, piiDisposition, review: { slot: role, reviewerId,
      independenceDeclaration: "INDEPENDENT_REVIEW_WITHOUT_PRIOR_JUDGMENT_ACCESS", decision, primaryCategory: primary,
      secondaryCategories: secondary, reasonCode, reviewNotes: record.reviewer_note_input || null, reviewedTextDigest: expected.textDigest, reviewedAt: record.reviewed_at_input } };
  });
};
