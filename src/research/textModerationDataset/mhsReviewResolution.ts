import fs from "node:fs";
import path from "node:path";
import { canonicalJson, sha256 } from "./manifest";
import {
  MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST, MHS_REVIEW_PILOT_SIZE, MHS_REVIEW_PILOT_VERSION,
  PILOT_PII_DISPOSITIONS, PILOT_REVIEW_REASON_CODES, REVIEW_CATEGORIES, REVIEW_DECISIONS, selectMhsReviewPilot,
} from "./mhsReviewPilot";
import {
  MHS_REVIEWER_A_ID, MHS_REVIEWER_A_IMPORT_FILENAME, MhsPilotReviewImportArtifact, PersistedMhsPilotReview,
  validateMhsPilotReviewImportArtifact, writeImmutableFileAtomic,
} from "./mhsReviewImport";
import {
  MHS_REVIEW_AUTHORITY_POLICY_VERSION, MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST, MHS_REVIEW_TRANCHE_SIZE,
  MHS_REVIEW_TRANCHE_VERSION, MhsReviewTrancheRow, mhsReviewTrancheMembershipDigest, validateMhsReviewTrancheRow,
} from "./mhsReviewTranche";

export const MHS_REVIEW_RESOLUTION_SCHEMA_VERSION = "STHN_TEXT_MODERATION_MHS_REVIEW_RESOLUTION_V1" as const;
export const MHS_REVIEWER_A_ARTIFACT_SHA256 = "dec27e33770eadb4d0cb65b2d5cbb77c3694a6707f68cbcc25702bdd1eab31b6" as const;
export const MHS_REVIEWER_A_PAYLOAD_DIGEST = "8a5b8f2eb7d95e6050b422da9677a7fc0fcd4579079db5f79003ca489d46608d" as const;
export const MHS_REVIEWER_A_RESOLUTION_FILENAME = "mhs-review-pilot-v1-reviewer-a-resolution.json" as const;
export const MHS_REVIEWER_A_SOURCE_ARTIFACT_PATH = `reviews/${MHS_REVIEWER_A_IMPORT_FILENAME}` as const;

export const MHS_RESOLUTION_STATES = ["RESOLVED_ALLOW", "RESOLVED_BLOCK", "UNRESOLVED_ADJUDICATION", "EXCLUDED"] as const;
export type MhsResolutionState = typeof MHS_RESOLUTION_STATES[number];
export const MHS_PII_GATE_STATES = ["PII_CLEAR", "PII_REVIEW_REQUIRED", "PII_EXCLUDED"] as const;
export type MhsPiiGateState = typeof MHS_PII_GATE_STATES[number];
export const MHS_PROGRESSION_STATES = ["RESOLVED_PII_CLEAR", "RESOLVED_PII_BLOCKED", "UNRESOLVED_ADJUDICATION", "EXCLUDED"] as const;
export type MhsProgressionState = typeof MHS_PROGRESSION_STATES[number];

export interface MhsReviewResolutionRow {
  readonly pilotRowNumber: number;
  readonly sourceRowId: string;
  readonly commentId: string;
  readonly textDigest: string;
  readonly reviewerDecision: PersistedMhsPilotReview["review"]["decision"];
  readonly primaryCategory: PersistedMhsPilotReview["review"]["primaryCategory"];
  readonly secondaryCategories: PersistedMhsPilotReview["review"]["secondaryCategories"];
  readonly reasonCode: PersistedMhsPilotReview["review"]["reasonCode"];
  readonly reviewerNote: string | null;
  readonly piiDisposition: PersistedMhsPilotReview["piiDisposition"];
  readonly resolutionState: MhsResolutionState;
  readonly piiGateState: MhsPiiGateState;
  readonly progressionState: MhsProgressionState;
  readonly candidateProgressionAllowed: false;
  readonly trainingEligible: false;
}

export interface MhsReviewResolutionSummary {
  readonly decisionCounts: Readonly<Record<string, number>>;
  readonly resolutionStateCounts: Readonly<Record<string, number>>;
  readonly piiDispositionCounts: Readonly<Record<string, number>>;
  readonly progressionCounts: Readonly<Record<string, number>>;
  readonly primaryBlockCategoryCounts: Readonly<Record<string, number>>;
  readonly secondaryCategoryCounts: Readonly<Record<string, number>>;
  readonly reasonCodeCounts: Readonly<Record<string, number>>;
  readonly candidateProgressionAllowed: 0;
  readonly trainingEligible: 0;
}

export interface MhsReviewResolutionPayload {
  readonly schemaVersion: typeof MHS_REVIEW_RESOLUTION_SCHEMA_VERSION;
  readonly authorityPolicyVersion: typeof MHS_REVIEW_AUTHORITY_POLICY_VERSION;
  readonly sourceValidatedReviewArtifactPath: string;
  readonly sourceArtifactSha256: typeof MHS_REVIEWER_A_ARTIFACT_SHA256;
  readonly sourceCanonicalPayloadDigest: typeof MHS_REVIEWER_A_PAYLOAD_DIGEST;
  readonly pilotVersion: typeof MHS_REVIEW_PILOT_VERSION;
  readonly parentTrancheVersion: typeof MHS_REVIEW_TRANCHE_VERSION;
  readonly pilotMembershipDigest: typeof MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST;
  readonly parentTrancheMembershipDigest: typeof MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST;
  readonly reviewerRole: "A";
  readonly reviewerId: typeof MHS_REVIEWER_A_ID;
  readonly rowCount: typeof MHS_REVIEW_PILOT_SIZE;
  readonly generatedAt: string;
  readonly rows: readonly MhsReviewResolutionRow[];
  readonly summary: MhsReviewResolutionSummary;
}

export interface MhsReviewResolutionArtifact extends MhsReviewResolutionPayload {
  readonly resolutionPayloadDigest: string;
}

type AtomicPublisher = (temporaryPath: string, targetPath: string) => void;
export interface CreateMhsReviewResolutionOptions {
  readonly sourceArtifactPath: string;
  readonly parentTranchePath: string;
  readonly outputDirectory: string;
  readonly generatedAt?: string;
  readonly publishAtomic?: AtomicPublisher;
}

const tally = (values: readonly string[], keys?: readonly string[]): Readonly<Record<string, number>> => Object.fromEntries(
  (keys ?? [...new Set(values)].sort()).map((key) => [key, values.filter((value) => value === key).length]),
);
const resolutionPayloadDigest = (payload: MhsReviewResolutionPayload): string => sha256(Buffer.from(canonicalJson(payload), "utf8"));

const derivedStates = (decision: PersistedMhsPilotReview["review"]["decision"], piiDisposition: PersistedMhsPilotReview["piiDisposition"]): {
  readonly resolutionState: MhsResolutionState; readonly piiGateState: MhsPiiGateState; readonly progressionState: MhsProgressionState;
} => {
  const piiGateState: MhsPiiGateState = piiDisposition === "NONE" ? "PII_CLEAR" : piiDisposition === "REQUIRES_REVIEW" ? "PII_REVIEW_REQUIRED" : "PII_EXCLUDED";
  const resolutionState: MhsResolutionState = decision === "NEEDS_ADJUDICATION" ? "UNRESOLVED_ADJUDICATION"
    : decision === "EXCLUDE" || piiGateState === "PII_EXCLUDED" ? "EXCLUDED" : decision === "ALLOW" ? "RESOLVED_ALLOW" : "RESOLVED_BLOCK";
  const progressionState: MhsProgressionState = resolutionState === "UNRESOLVED_ADJUDICATION" ? "UNRESOLVED_ADJUDICATION"
    : resolutionState === "EXCLUDED" ? "EXCLUDED" : piiGateState === "PII_CLEAR" ? "RESOLVED_PII_CLEAR" : "RESOLVED_PII_BLOCKED";
  return { resolutionState, piiGateState, progressionState };
};

export const deriveMhsReviewResolutionRow = (item: PersistedMhsPilotReview, expectedTextDigest = item.review.reviewedTextDigest): MhsReviewResolutionRow => {
  if (item.review.slot !== "A" || item.review.reviewerId !== MHS_REVIEWER_A_ID || item.review.reviewedTextDigest !== expectedTextDigest) throw new Error(`Invalid Reviewer A identity or text binding at pilot row ${item.pilotRowNumber}`);
  const decision = item.review.decision;
  if (decision === "BLOCK" && !item.review.primaryCategory) throw new Error(`BLOCK row ${item.pilotRowNumber} lacks a primary category`);
  if (decision !== "BLOCK" && (item.review.primaryCategory || item.review.secondaryCategories.length)) throw new Error(`Non-BLOCK row ${item.pilotRowNumber} carries categories`);
  const { resolutionState, piiGateState, progressionState } = derivedStates(decision, item.piiDisposition);
  return { pilotRowNumber: item.pilotRowNumber, sourceRowId: item.sourceRowId, commentId: item.commentId, textDigest: expectedTextDigest,
    reviewerDecision: decision, primaryCategory: item.review.primaryCategory, secondaryCategories: [...item.review.secondaryCategories],
    reasonCode: item.review.reasonCode, reviewerNote: item.review.reviewNotes, piiDisposition: item.piiDisposition,
    resolutionState, piiGateState, progressionState, candidateProgressionAllowed: false, trainingEligible: false };
};

const summarize = (rows: readonly MhsReviewResolutionRow[]): MhsReviewResolutionSummary => ({
  decisionCounts: tally(rows.map((row) => row.reviewerDecision), ["ALLOW", "BLOCK", "NEEDS_ADJUDICATION", "EXCLUDE"]),
  resolutionStateCounts: tally(rows.map((row) => row.resolutionState), MHS_RESOLUTION_STATES),
  piiDispositionCounts: tally(rows.map((row) => row.piiDisposition), ["NONE", "REQUIRES_REVIEW", "EXCLUDE"]),
  progressionCounts: tally(rows.map((row) => row.progressionState), MHS_PROGRESSION_STATES),
  primaryBlockCategoryCounts: tally(rows.filter((row) => row.reviewerDecision === "BLOCK").map((row) => row.primaryCategory!)),
  secondaryCategoryCounts: tally(rows.filter((row) => row.reviewerDecision === "BLOCK").flatMap((row) => row.secondaryCategories)),
  reasonCodeCounts: tally(rows.map((row) => row.reasonCode)), candidateProgressionAllowed: 0, trainingEligible: 0,
});

export const validateMhsReviewResolutionArtifact = (artifact: MhsReviewResolutionArtifact): void => {
  const { resolutionPayloadDigest: integrity, ...payload } = artifact;
  if (payload.schemaVersion !== MHS_REVIEW_RESOLUTION_SCHEMA_VERSION || payload.authorityPolicyVersion !== MHS_REVIEW_AUTHORITY_POLICY_VERSION
    || payload.sourceArtifactSha256 !== MHS_REVIEWER_A_ARTIFACT_SHA256 || payload.sourceCanonicalPayloadDigest !== MHS_REVIEWER_A_PAYLOAD_DIGEST
    || payload.pilotVersion !== MHS_REVIEW_PILOT_VERSION || payload.parentTrancheVersion !== MHS_REVIEW_TRANCHE_VERSION
    || payload.pilotMembershipDigest !== MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST || payload.parentTrancheMembershipDigest !== MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST
    || payload.sourceValidatedReviewArtifactPath !== MHS_REVIEWER_A_SOURCE_ARTIFACT_PATH
    || payload.reviewerRole !== "A" || payload.reviewerId !== MHS_REVIEWER_A_ID || payload.rowCount !== MHS_REVIEW_PILOT_SIZE
    || payload.rows.length !== MHS_REVIEW_PILOT_SIZE || !Number.isFinite(Date.parse(payload.generatedAt))) throw new Error("Invalid MHS resolution artifact identity");
  if (new Set(payload.rows.map((row) => row.sourceRowId)).size !== MHS_REVIEW_PILOT_SIZE || new Set(payload.rows.map((row) => row.commentId)).size !== MHS_REVIEW_PILOT_SIZE) throw new Error("Duplicate MHS resolution rows");
  if (payload.rows.some((row, index) => row.pilotRowNumber !== index + 1 || row.candidateProgressionAllowed !== false || row.trainingEligible !== false)) throw new Error("Invalid resolution ordering or forbidden progression");
  for (const row of payload.rows) {
    if (!(REVIEW_DECISIONS as readonly unknown[]).includes(row.reviewerDecision)
      || !(PILOT_PII_DISPOSITIONS as readonly unknown[]).includes(row.piiDisposition)
      || !(PILOT_REVIEW_REASON_CODES as readonly unknown[]).includes(row.reasonCode)
      || !(MHS_RESOLUTION_STATES as readonly unknown[]).includes(row.resolutionState)
      || !(MHS_PII_GATE_STATES as readonly unknown[]).includes(row.piiGateState)
      || !(MHS_PROGRESSION_STATES as readonly unknown[]).includes(row.progressionState)) throw new Error(`Invalid bounded value at resolution row ${row.pilotRowNumber}`);
    if (row.reviewerDecision === "BLOCK") {
      if (!row.primaryCategory || !(REVIEW_CATEGORIES as readonly unknown[]).includes(row.primaryCategory)
        || row.secondaryCategories.some((category) => !(REVIEW_CATEGORIES as readonly unknown[]).includes(category))
        || new Set(row.secondaryCategories).size !== row.secondaryCategories.length
        || row.secondaryCategories.includes(row.primaryCategory)) throw new Error(`Invalid BLOCK categories at resolution row ${row.pilotRowNumber}`);
    } else if (row.primaryCategory !== null || row.secondaryCategories.length !== 0) throw new Error(`Non-BLOCK row ${row.pilotRowNumber} carries categories`);
    const expected = derivedStates(row.reviewerDecision, row.piiDisposition);
    if (row.resolutionState !== expected.resolutionState || row.piiGateState !== expected.piiGateState || row.progressionState !== expected.progressionState) throw new Error(`Invalid derived states at resolution row ${row.pilotRowNumber}`);
  }
  if (canonicalJson(payload.summary) !== canonicalJson(summarize(payload.rows))) throw new Error("MHS resolution summary mismatch");
  if (integrity !== resolutionPayloadDigest(payload)) throw new Error("MHS resolution payload integrity mismatch");
};

export const createMhsReviewerAResolution = (options: CreateMhsReviewResolutionOptions): { readonly artifactPath: string; readonly artifactSha256: string; readonly artifact: MhsReviewResolutionArtifact } => {
  const sourceBytes = fs.readFileSync(options.sourceArtifactPath); const sourceHash = sha256(sourceBytes);
  if (sourceHash !== MHS_REVIEWER_A_ARTIFACT_SHA256) throw new Error(`Validated Reviewer A artifact SHA-256 mismatch: ${sourceHash}`);
  const imported = JSON.parse(sourceBytes.toString("utf8")) as MhsPilotReviewImportArtifact; validateMhsPilotReviewImportArtifact(imported);
  if (imported.payloadIntegrityDigest !== MHS_REVIEWER_A_PAYLOAD_DIGEST) throw new Error("Validated Reviewer A canonical payload digest mismatch");

  const parent = fs.readFileSync(options.parentTranchePath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as MhsReviewTrancheRow);
  if (parent.length !== MHS_REVIEW_TRANCHE_SIZE) throw new Error("Frozen parent tranche must contain exactly 3,000 rows");
  parent.forEach(validateMhsReviewTrancheRow);
  if (mhsReviewTrancheMembershipDigest(parent) !== MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST) throw new Error("Frozen parent tranche membership changed");
  const pilot = selectMhsReviewPilot(parent);
  if (imported.reviews.length !== pilot.length) throw new Error("Reviewer A artifact row count does not match the frozen pilot");
  const rows = imported.reviews.map((item, index) => {
    const expected = pilot[index];
    if (item.pilotRowNumber !== expected.pilotRowNumber || item.sourceRowId !== expected.sourceRowId || item.commentId !== expected.commentId || item.review.reviewedTextDigest !== expected.textDigest) throw new Error(`Reviewer A artifact does not match frozen pilot row ${index + 1}`);
    return deriveMhsReviewResolutionRow(item, expected.textDigest);
  });
  const generatedAt = options.generatedAt ?? new Date().toISOString(); if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("Resolution generation timestamp is invalid");
  const payload: MhsReviewResolutionPayload = {
    schemaVersion: MHS_REVIEW_RESOLUTION_SCHEMA_VERSION, authorityPolicyVersion: MHS_REVIEW_AUTHORITY_POLICY_VERSION,
    sourceValidatedReviewArtifactPath: MHS_REVIEWER_A_SOURCE_ARTIFACT_PATH,
    sourceArtifactSha256: MHS_REVIEWER_A_ARTIFACT_SHA256, sourceCanonicalPayloadDigest: MHS_REVIEWER_A_PAYLOAD_DIGEST,
    pilotVersion: MHS_REVIEW_PILOT_VERSION, parentTrancheVersion: MHS_REVIEW_TRANCHE_VERSION,
    pilotMembershipDigest: MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST, parentTrancheMembershipDigest: MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST,
    reviewerRole: "A", reviewerId: MHS_REVIEWER_A_ID, rowCount: MHS_REVIEW_PILOT_SIZE, generatedAt, rows, summary: summarize(rows),
  };
  const artifact: MhsReviewResolutionArtifact = { ...payload, resolutionPayloadDigest: resolutionPayloadDigest(payload) };
  validateMhsReviewResolutionArtifact(artifact);
  const serialized = canonicalJson(artifact); const artifactPath = path.join(options.outputDirectory, MHS_REVIEWER_A_RESOLUTION_FILENAME);
  writeImmutableFileAtomic(artifactPath, serialized, options.publishAtomic);
  return { artifactPath, artifactSha256: sha256(Buffer.from(serialized, "utf8")), artifact };
};
