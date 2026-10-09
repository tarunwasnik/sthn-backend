import fs from "node:fs";
import path from "node:path";
import { canonicalJson, sha256 } from "./manifest";
import {
  MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST, MHS_REVIEW_PILOT_SIZE, MHS_REVIEW_PILOT_VERSION,
  PILOT_PII_DISPOSITIONS, PILOT_REVIEW_REASON_CODES, REVIEW_CATEGORIES, REVIEW_DECISIONS, selectMhsReviewPilot,
} from "./mhsReviewPilot";
import {
  MHS_REVIEWER_A_ID, MHS_REVIEWER_A_IMPORT_FILENAME, MhsPilotReviewImportArtifact,
  validateMhsPilotReviewImportArtifact, writeImmutableFileAtomic,
} from "./mhsReviewImport";
import {
  MHS_REVIEWER_A_ARTIFACT_SHA256, MHS_REVIEWER_A_PAYLOAD_DIGEST, MHS_REVIEWER_A_RESOLUTION_FILENAME,
  MhsReviewResolutionArtifact, MhsReviewResolutionRow, validateMhsReviewResolutionArtifact,
} from "./mhsReviewResolution";
import {
  MHS_REVIEW_AUTHORITY_POLICY_VERSION, MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST, MHS_REVIEW_TRANCHE_SIZE,
  MHS_REVIEW_TRANCHE_VERSION, MhsReviewTrancheRow, mhsReviewTrancheMembershipDigest, validateMhsReviewTrancheRow,
} from "./mhsReviewTranche";

export const MHS_CANDIDATE_ADMISSION_SCHEMA_VERSION = "STHN_TEXT_MODERATION_MHS_REVIEW_CANDIDATE_ADMISSION_V1" as const;
export const MHS_CANDIDATE_ADMISSION_POLICY_VERSION = "STHN_TEXT_MODERATION_MHS_REVIEW_CANDIDATE_ADMISSION_POLICY_V1" as const;
export const MHS_REVIEW_RESOLUTION_ARTIFACT_SHA256 = "705e373236dea8202cd58cbf26f2b3d47303f1be3a2f82284b32dc7f52ec9bca" as const;
export const MHS_REVIEW_RESOLUTION_PAYLOAD_DIGEST = "9dae7e28d83ce847faf52506b818f2b29f75b9e33c5edd9da219814a56387a31" as const;
export const MHS_REVIEW_PARENT_ARTIFACT_SHA256 = "f3351f975f8dd7db2693d1efcd549685bfc86f70c076d7f602f5c90d462ede71" as const;
export const MHS_CANDIDATE_ARTIFACT_FILENAME = "mhs-review-pilot-v1-candidate-v1.json" as const;
export const MHS_SOURCE_RESOLUTION_ARTIFACT_PATH = `reviews/${MHS_REVIEWER_A_RESOLUTION_FILENAME}` as const;
export const MHS_SOURCE_REVIEWER_A_ARTIFACT_PATH = `reviews/${MHS_REVIEWER_A_IMPORT_FILENAME}` as const;

export const MHS_CANDIDATE_STATES = ["ADMITTED_ALLOW", "ADMITTED_BLOCK", "BLOCKED_PII_REVIEW", "BLOCKED_ADJUDICATION", "EXCLUDED"] as const;
export type MhsCandidateState = typeof MHS_CANDIDATE_STATES[number];

export interface MhsCandidateAdmissionRow {
  readonly pilotRowNumber: number;
  readonly sourceRowId: string;
  readonly commentId: string;
  readonly textDigest: string;
  /** Exact frozen pilot text is retained only for an admitted candidate. */
  readonly reviewedText: string | null;
  readonly reviewerDecision: MhsReviewResolutionRow["reviewerDecision"];
  readonly primaryCategory: MhsReviewResolutionRow["primaryCategory"];
  readonly secondaryCategories: MhsReviewResolutionRow["secondaryCategories"];
  readonly reasonCode: MhsReviewResolutionRow["reasonCode"];
  readonly piiDisposition: MhsReviewResolutionRow["piiDisposition"];
  readonly resolutionState: MhsReviewResolutionRow["resolutionState"];
  readonly candidateState: MhsCandidateState;
  readonly candidateAdmitted: boolean;
  readonly trainingEligible: false;
}

export interface MhsCandidateAdmissionSummary {
  readonly candidateStateCounts: Readonly<Record<MhsCandidateState, number>>;
  readonly admittedCount: number;
  readonly admittedAllowCount: number;
  readonly admittedBlockCount: number;
  readonly blockedCount: number;
  readonly piiBlockerCount: number;
  readonly adjudicationBlockerCount: number;
  readonly exclusionBlockerCount: number;
  readonly admittedPrimaryBlockCategoryCounts: Readonly<Record<string, number>>;
  readonly admittedSecondaryCategoryCounts: Readonly<Record<string, number>>;
  readonly admittedReasonCodeCounts: Readonly<Record<string, number>>;
  readonly piiDispositionCounts: Readonly<Record<string, number>>;
  readonly trainingEligible: 0;
}

export interface MhsCandidateAdmissionPayload {
  readonly schemaVersion: typeof MHS_CANDIDATE_ADMISSION_SCHEMA_VERSION;
  readonly admissionPolicyVersion: typeof MHS_CANDIDATE_ADMISSION_POLICY_VERSION;
  readonly reviewAuthorityPolicyVersion: typeof MHS_REVIEW_AUTHORITY_POLICY_VERSION;
  readonly sourceResolutionArtifactPath: typeof MHS_SOURCE_RESOLUTION_ARTIFACT_PATH;
  readonly sourceResolutionArtifactSha256: typeof MHS_REVIEW_RESOLUTION_ARTIFACT_SHA256;
  readonly sourceResolutionPayloadDigest: typeof MHS_REVIEW_RESOLUTION_PAYLOAD_DIGEST;
  readonly sourceReviewerArtifactPath: typeof MHS_SOURCE_REVIEWER_A_ARTIFACT_PATH;
  readonly sourceReviewerArtifactSha256: typeof MHS_REVIEWER_A_ARTIFACT_SHA256;
  readonly sourceReviewerPayloadDigest: typeof MHS_REVIEWER_A_PAYLOAD_DIGEST;
  readonly sourceReviewerRole: "A";
  readonly sourceReviewerId: typeof MHS_REVIEWER_A_ID;
  readonly parentArtifactSha256: typeof MHS_REVIEW_PARENT_ARTIFACT_SHA256;
  readonly pilotVersion: typeof MHS_REVIEW_PILOT_VERSION;
  readonly parentTrancheVersion: typeof MHS_REVIEW_TRANCHE_VERSION;
  readonly pilotMembershipDigest: typeof MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST;
  readonly parentTrancheMembershipDigest: typeof MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST;
  readonly generatedAt: string;
  readonly rowCount: typeof MHS_REVIEW_PILOT_SIZE;
  readonly admittedCount: number;
  readonly blockedCount: number;
  readonly rows: readonly MhsCandidateAdmissionRow[];
  readonly summary: MhsCandidateAdmissionSummary;
}

export interface MhsCandidateAdmissionArtifact extends MhsCandidateAdmissionPayload {
  readonly candidatePayloadDigest: string;
}

type AtomicPublisher = (temporaryPath: string, targetPath: string) => void;
export interface CreateMhsCandidateAdmissionOptions {
  readonly resolutionArtifactPath: string;
  readonly reviewerArtifactPath: string;
  readonly parentTranchePath: string;
  readonly outputDirectory: string;
  readonly generatedAt?: string;
  readonly publishAtomic?: AtomicPublisher;
}

const tally = <T extends string>(values: readonly T[], keys?: readonly T[]): Readonly<Record<T, number>> => Object.fromEntries(
  (keys ?? [...new Set(values)].sort()).map((key) => [key, values.filter((value) => value === key).length]),
) as Readonly<Record<T, number>>;

export const deriveMhsCandidateState = (row: Pick<MhsReviewResolutionRow, "reviewerDecision" | "resolutionState" | "piiDisposition" | "piiGateState">): MhsCandidateState => {
  if (row.resolutionState === "EXCLUDED" || row.reviewerDecision === "EXCLUDE" || row.piiDisposition === "EXCLUDE" || row.piiGateState === "PII_EXCLUDED") return "EXCLUDED";
  if (row.resolutionState === "UNRESOLVED_ADJUDICATION" || row.reviewerDecision === "NEEDS_ADJUDICATION") return "BLOCKED_ADJUDICATION";
  if (row.piiDisposition === "REQUIRES_REVIEW" || row.piiGateState === "PII_REVIEW_REQUIRED") return "BLOCKED_PII_REVIEW";
  if (row.piiDisposition !== "NONE" || row.piiGateState !== "PII_CLEAR") throw new Error("Candidate admission encountered an invalid PII gate");
  if (row.resolutionState === "RESOLVED_ALLOW" && row.reviewerDecision === "ALLOW") return "ADMITTED_ALLOW";
  if (row.resolutionState === "RESOLVED_BLOCK" && row.reviewerDecision === "BLOCK") return "ADMITTED_BLOCK";
  throw new Error("Candidate admission encountered inconsistent resolution semantics");
};

const summarize = (rows: readonly MhsCandidateAdmissionRow[]): MhsCandidateAdmissionSummary => {
  const admitted = rows.filter((row) => row.candidateAdmitted); const admittedBlock = admitted.filter((row) => row.candidateState === "ADMITTED_BLOCK");
  return {
    candidateStateCounts: tally(rows.map((row) => row.candidateState), MHS_CANDIDATE_STATES), admittedCount: admitted.length,
    admittedAllowCount: admitted.filter((row) => row.candidateState === "ADMITTED_ALLOW").length, admittedBlockCount: admittedBlock.length,
    blockedCount: rows.length - admitted.length, piiBlockerCount: rows.filter((row) => row.candidateState === "BLOCKED_PII_REVIEW").length,
    adjudicationBlockerCount: rows.filter((row) => row.candidateState === "BLOCKED_ADJUDICATION").length,
    exclusionBlockerCount: rows.filter((row) => row.candidateState === "EXCLUDED").length,
    admittedPrimaryBlockCategoryCounts: tally(admittedBlock.map((row) => row.primaryCategory!)),
    admittedSecondaryCategoryCounts: tally(admittedBlock.flatMap((row) => row.secondaryCategories)),
    admittedReasonCodeCounts: tally(admitted.map((row) => row.reasonCode)),
    piiDispositionCounts: tally(rows.map((row) => row.piiDisposition), ["NONE", "REQUIRES_REVIEW", "EXCLUDE"]), trainingEligible: 0,
  };
};

const payloadDigest = (payload: MhsCandidateAdmissionPayload): string => sha256(Buffer.from(canonicalJson(payload), "utf8"));

export const validateMhsCandidateAdmissionArtifact = (artifact: MhsCandidateAdmissionArtifact): void => {
  const { candidatePayloadDigest, ...payload } = artifact;
  if (payload.schemaVersion !== MHS_CANDIDATE_ADMISSION_SCHEMA_VERSION || payload.admissionPolicyVersion !== MHS_CANDIDATE_ADMISSION_POLICY_VERSION
    || payload.reviewAuthorityPolicyVersion !== MHS_REVIEW_AUTHORITY_POLICY_VERSION || payload.sourceResolutionArtifactPath !== MHS_SOURCE_RESOLUTION_ARTIFACT_PATH
    || payload.sourceResolutionArtifactSha256 !== MHS_REVIEW_RESOLUTION_ARTIFACT_SHA256 || payload.sourceResolutionPayloadDigest !== MHS_REVIEW_RESOLUTION_PAYLOAD_DIGEST
    || payload.sourceReviewerArtifactPath !== MHS_SOURCE_REVIEWER_A_ARTIFACT_PATH || payload.sourceReviewerArtifactSha256 !== MHS_REVIEWER_A_ARTIFACT_SHA256
    || payload.sourceReviewerPayloadDigest !== MHS_REVIEWER_A_PAYLOAD_DIGEST || payload.sourceReviewerRole !== "A" || payload.sourceReviewerId !== MHS_REVIEWER_A_ID
    || payload.parentArtifactSha256 !== MHS_REVIEW_PARENT_ARTIFACT_SHA256 || payload.pilotVersion !== MHS_REVIEW_PILOT_VERSION
    || payload.parentTrancheVersion !== MHS_REVIEW_TRANCHE_VERSION || payload.pilotMembershipDigest !== MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST
    || payload.parentTrancheMembershipDigest !== MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST || payload.rowCount !== MHS_REVIEW_PILOT_SIZE
    || payload.rows.length !== MHS_REVIEW_PILOT_SIZE || !Number.isFinite(Date.parse(payload.generatedAt))) throw new Error("Invalid MHS candidate artifact identity");
  if (new Set(payload.rows.map((row) => row.sourceRowId)).size !== MHS_REVIEW_PILOT_SIZE || new Set(payload.rows.map((row) => row.commentId)).size !== MHS_REVIEW_PILOT_SIZE) throw new Error("Duplicate MHS candidate identities");
  for (const [index, row] of payload.rows.entries()) {
    if (row.pilotRowNumber !== index + 1 || row.trainingEligible !== false || !(MHS_CANDIDATE_STATES as readonly unknown[]).includes(row.candidateState)
      || !(REVIEW_DECISIONS as readonly unknown[]).includes(row.reviewerDecision) || !(PILOT_PII_DISPOSITIONS as readonly unknown[]).includes(row.piiDisposition)
      || !(PILOT_REVIEW_REASON_CODES as readonly unknown[]).includes(row.reasonCode)) throw new Error(`Invalid candidate row ${index + 1}`);
    const expectedState = deriveMhsCandidateState({ ...row, piiGateState: row.piiDisposition === "NONE" ? "PII_CLEAR" : row.piiDisposition === "REQUIRES_REVIEW" ? "PII_REVIEW_REQUIRED" : "PII_EXCLUDED" });
    const admitted = expectedState === "ADMITTED_ALLOW" || expectedState === "ADMITTED_BLOCK";
    if (row.candidateState !== expectedState || row.candidateAdmitted !== admitted || (admitted ? !row.reviewedText || sha256(Buffer.from(row.reviewedText, "utf8")) !== row.textDigest : row.reviewedText !== null)) throw new Error(`Invalid candidate admission semantics at row ${index + 1}`);
    if (row.reviewerDecision === "BLOCK") {
      if (!row.primaryCategory || !(REVIEW_CATEGORIES as readonly unknown[]).includes(row.primaryCategory)
        || row.secondaryCategories.some((category) => !(REVIEW_CATEGORIES as readonly unknown[]).includes(category))
        || new Set(row.secondaryCategories).size !== row.secondaryCategories.length || row.secondaryCategories.includes(row.primaryCategory)) throw new Error(`Invalid candidate categories at row ${index + 1}`);
    } else if (row.primaryCategory !== null || row.secondaryCategories.length !== 0) throw new Error(`Invalid candidate categories at row ${index + 1}`);
  }
  const expectedSummary = summarize(payload.rows);
  if (payload.admittedCount !== expectedSummary.admittedCount || payload.blockedCount !== expectedSummary.blockedCount || canonicalJson(payload.summary) !== canonicalJson(expectedSummary)) throw new Error("MHS candidate summary mismatch");
  if (candidatePayloadDigest !== payloadDigest(payload)) throw new Error("MHS candidate payload integrity mismatch");
};

export const createMhsCandidateAdmission = (options: CreateMhsCandidateAdmissionOptions): { readonly artifactPath: string; readonly artifactSha256: string; readonly artifact: MhsCandidateAdmissionArtifact } => {
  const resolutionBytes = fs.readFileSync(options.resolutionArtifactPath);
  if (sha256(resolutionBytes) !== MHS_REVIEW_RESOLUTION_ARTIFACT_SHA256) throw new Error("MHS resolution artifact SHA-256 mismatch");
  const resolution = JSON.parse(resolutionBytes.toString("utf8")) as MhsReviewResolutionArtifact; validateMhsReviewResolutionArtifact(resolution);
  if (resolution.resolutionPayloadDigest !== MHS_REVIEW_RESOLUTION_PAYLOAD_DIGEST) throw new Error("MHS resolution canonical payload digest mismatch");

  const reviewerBytes = fs.readFileSync(options.reviewerArtifactPath);
  if (sha256(reviewerBytes) !== MHS_REVIEWER_A_ARTIFACT_SHA256) throw new Error("Reviewer A provenance artifact SHA-256 mismatch");
  const reviewer = JSON.parse(reviewerBytes.toString("utf8")) as MhsPilotReviewImportArtifact; validateMhsPilotReviewImportArtifact(reviewer);
  if (reviewer.payloadIntegrityDigest !== MHS_REVIEWER_A_PAYLOAD_DIGEST) throw new Error("Reviewer A provenance payload digest mismatch");

  const parentBytes = fs.readFileSync(options.parentTranchePath);
  if (sha256(parentBytes) !== MHS_REVIEW_PARENT_ARTIFACT_SHA256) throw new Error("Frozen parent artifact SHA-256 mismatch");
  const parent = parentBytes.toString("utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as MhsReviewTrancheRow);
  if (parent.length !== MHS_REVIEW_TRANCHE_SIZE) throw new Error("Frozen parent tranche must contain exactly 3,000 rows");
  parent.forEach(validateMhsReviewTrancheRow);
  if (mhsReviewTrancheMembershipDigest(parent) !== MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST) throw new Error("Frozen parent tranche membership changed");
  const pilot = selectMhsReviewPilot(parent);

  const rows = resolution.rows.map((resolved, index): MhsCandidateAdmissionRow => {
    const reviewed = reviewer.reviews[index]; const frozen = pilot[index];
    if (!reviewed || !frozen || resolved.pilotRowNumber !== index + 1 || resolved.sourceRowId !== frozen.sourceRowId || resolved.commentId !== frozen.commentId
      || resolved.textDigest !== frozen.textDigest || reviewed.sourceRowId !== resolved.sourceRowId || reviewed.commentId !== resolved.commentId
      || reviewed.review.reviewedTextDigest !== resolved.textDigest || reviewed.review.decision !== resolved.reviewerDecision
      || reviewed.review.primaryCategory !== resolved.primaryCategory || canonicalJson(reviewed.review.secondaryCategories) !== canonicalJson(resolved.secondaryCategories)
      || reviewed.review.reasonCode !== resolved.reasonCode || reviewed.piiDisposition !== resolved.piiDisposition) throw new Error(`Candidate source provenance mismatch at row ${index + 1}`);
    const candidateState = deriveMhsCandidateState(resolved); const candidateAdmitted = candidateState === "ADMITTED_ALLOW" || candidateState === "ADMITTED_BLOCK";
    return { pilotRowNumber: index + 1, sourceRowId: resolved.sourceRowId, commentId: resolved.commentId, textDigest: resolved.textDigest,
      reviewedText: candidateAdmitted ? frozen.text : null, reviewerDecision: resolved.reviewerDecision, primaryCategory: resolved.primaryCategory,
      secondaryCategories: [...resolved.secondaryCategories], reasonCode: resolved.reasonCode, piiDisposition: resolved.piiDisposition,
      resolutionState: resolved.resolutionState, candidateState, candidateAdmitted, trainingEligible: false };
  });
  const generatedAt = options.generatedAt ?? new Date().toISOString(); if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("Candidate generation timestamp is invalid");
  const summary = summarize(rows);
  const payload: MhsCandidateAdmissionPayload = {
    schemaVersion: MHS_CANDIDATE_ADMISSION_SCHEMA_VERSION, admissionPolicyVersion: MHS_CANDIDATE_ADMISSION_POLICY_VERSION,
    reviewAuthorityPolicyVersion: MHS_REVIEW_AUTHORITY_POLICY_VERSION, sourceResolutionArtifactPath: MHS_SOURCE_RESOLUTION_ARTIFACT_PATH,
    sourceResolutionArtifactSha256: MHS_REVIEW_RESOLUTION_ARTIFACT_SHA256, sourceResolutionPayloadDigest: MHS_REVIEW_RESOLUTION_PAYLOAD_DIGEST,
    sourceReviewerArtifactPath: MHS_SOURCE_REVIEWER_A_ARTIFACT_PATH, sourceReviewerArtifactSha256: MHS_REVIEWER_A_ARTIFACT_SHA256,
    sourceReviewerPayloadDigest: MHS_REVIEWER_A_PAYLOAD_DIGEST, sourceReviewerRole: "A", sourceReviewerId: MHS_REVIEWER_A_ID,
    parentArtifactSha256: MHS_REVIEW_PARENT_ARTIFACT_SHA256, pilotVersion: MHS_REVIEW_PILOT_VERSION, parentTrancheVersion: MHS_REVIEW_TRANCHE_VERSION,
    pilotMembershipDigest: MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST, parentTrancheMembershipDigest: MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST,
    generatedAt, rowCount: MHS_REVIEW_PILOT_SIZE, admittedCount: summary.admittedCount, blockedCount: summary.blockedCount, rows, summary,
  };
  const artifact: MhsCandidateAdmissionArtifact = { ...payload, candidatePayloadDigest: payloadDigest(payload) };
  validateMhsCandidateAdmissionArtifact(artifact);
  const serialized = canonicalJson(artifact); const artifactPath = path.join(options.outputDirectory, MHS_CANDIDATE_ARTIFACT_FILENAME);
  writeImmutableFileAtomic(artifactPath, serialized, options.publishAtomic);
  return { artifactPath, artifactSha256: sha256(Buffer.from(serialized, "utf8")), artifact };
};
