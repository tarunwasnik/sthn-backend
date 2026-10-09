import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CsvRecord, parseCsv } from "./csv";
import { canonicalJson } from "./manifest";
import { MHS_CANDIDATE_ARTIFACT_SHA256 } from "./mhsCandidateIntegrityAudit";
import { MHS_SPLIT_MANIFEST_SHA256 } from "./mhsInternalTestFreeze";
import { MHS_INTERNAL_TEST_FREEZE_SHA256 } from "./mhsTrainingEligibilityReleasePlan";
import {
  MHS_V2_EXPANSION_ACQUISITION_SHA256, MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST,
  MHS_V2_EXPANSION_CANDIDATE_SHA256, MhsV2ExpansionCandidateArtifact,
} from "./mhsV2ExpansionCandidateAcquisition";
import {
  MHS_V2_EXPANSION_PII_DISPOSITION_PAYLOAD_DIGEST, MHS_V2_EXPANSION_PII_DISPOSITION_SHA256,
  MHS_V2_EXPANSION_PII_SCREENING_PAYLOAD_DIGEST, MHS_V2_EXPANSION_PII_SCREENING_SHA256,
  MhsV2PiiDispositionArtifact, MhsV2PiiScreeningArtifact, validateMhsV2PiiArtifacts,
} from "./mhsV2ExpansionPiiScreening";
import {
  PII_EXCLUSION_REASON_CODES, TEXT_MODERATION_PII_POLICY_PAYLOAD_DIGEST,
  TEXT_MODERATION_PII_POLICY_SHA256,
} from "./textModerationPiiPolicy";

export const MHS_V2_HUMAN_PII_REVIEW_PACKET_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_EXPANSION_HUMAN_PII_REVIEW_PACKET_V1" as const;
export const MHS_V2_HUMAN_PII_REVIEW_PACKET_VERSION = "MHS_V2_EXPANSION_HUMAN_PII_REVIEW_PACKET_V1" as const;
export const MHS_V2_HUMAN_PII_REVIEW_PACKET_FILENAME = "mhs-v2-expansion-human-pii-review-packet-v1.json" as const;
export const MHS_V2_HUMAN_PII_DECISION_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_EXPANSION_HUMAN_PII_DECISIONS_V1" as const;
export const MHS_V2_HUMAN_PII_DECISION_TEMPLATE_FILENAME = "mhs-v2-expansion-human-pii-decisions-v1.csv" as const;
export const MHS_V2_HUMAN_PII_FINAL_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_EXPANSION_HUMAN_PII_DISPOSITION_V1" as const;
export const MHS_V2_HUMAN_PII_FINAL_VERSION = "MHS_V2_EXPANSION_HUMAN_PII_DISPOSITION_V1" as const;
export const MHS_V2_HUMAN_PII_FINAL_FILENAME = "mhs-v2-expansion-human-pii-disposition-v1.json" as const;
export const MHS_V2_HUMAN_PII_PACKET_GENERATED_AT = "2026-09-15T02:00:00.000Z" as const;
export const MHS_V2_HUMAN_PII_DISPOSITION_GENERATED_AT = "2026-09-15T03:00:00.000Z" as const;
export const MHS_V2_HUMAN_PII_REVIEW_PACKET_SHA256 = "443530a46d3b7a514c4a6901e0deebac64fd9ef1b85255c1c5bb64c0b309a832" as const;
export const MHS_V2_HUMAN_PII_REVIEW_PACKET_PAYLOAD_DIGEST = "80e48b56b45fc4a0a1e857dce2222db1906f5d92d4c59b90a0baac08ef61c32b" as const;
export const MHS_V2_HUMAN_PII_REVIEW_MEMBERSHIP_DIGEST = "a2bcb39896c55ce746c8d91d165de0cc1591e58e1cb2ed56950665e9f1ec98c7" as const;
export const MHS_V2_HUMAN_PII_BLANK_TEMPLATE_SHA256 = "a81e20b681bf25bc90fa596686cf3921d9053ccc3150029d8f87888fc87238c5" as const;
export const MHS_V2_HUMAN_PII_COMPLETED_INPUT_SHA256 = "c776823dfd2f725956aeaad85124b88abc6429f8eec70f390469d72536f43342" as const;
export const MHS_V2_HUMAN_PII_FINAL_SHA256 = "fe88c31e5342ef70ac26531a049b3bee09c6026c41999387526befae02c6047f" as const;
export const MHS_V2_HUMAN_PII_FINAL_PAYLOAD_DIGEST = "3be99cc0769034b9d6520a6950d10216afe7b4266b4f9e44d823ffed4fb90f30" as const;
export const HUMAN_PII_DECISIONS = ["NONE", "EXCLUDE", "REQUIRES_REVIEW"] as const;
export type HumanPiiDecision = typeof HUMAN_PII_DECISIONS[number];
export const HUMAN_PII_NONE_REASON_CODES = ["NON_PII_NUMERIC_CONTEXT", "PUBLIC_OR_NON_PRIVATE_NUMERIC_REFERENCE"] as const;
export const HUMAN_PII_UNRESOLVED_REASON_CODES = ["UNRESOLVED_CONTEXT"] as const;
export const HUMAN_PII_REASON_CODES = [...HUMAN_PII_NONE_REASON_CODES, ...PII_EXCLUSION_REASON_CODES, ...HUMAN_PII_UNRESOLVED_REASON_CODES] as const;
export type HumanPiiReasonCode = typeof HUMAN_PII_REASON_CODES[number];
export const HUMAN_PII_DECISION_COLUMNS = ["candidateId", "textSha256", "humanPiiDecision", "humanPiiReasonCode"] as const;

const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const digest = (value: unknown): string => sha(canonicalJson(value));
const csvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`;
const serializeCsv = (rows: readonly Readonly<Record<typeof HUMAN_PII_DECISION_COLUMNS[number], string>>[]): string =>
  `${HUMAN_PII_DECISION_COLUMNS.map(csvCell).join(",")}\r\n${rows.map((row) => HUMAN_PII_DECISION_COLUMNS.map((column) => csvCell(row[column])).join(",")).join("\r\n")}\r\n`;

export interface MhsV2HumanPiiPacketRow {
  readonly candidateId: string;
  readonly text: string;
  readonly textSha256: string;
  readonly automaticFinding: "AMBIGUOUS_NUMERIC_PATTERN";
  readonly currentPiiStatus: "REQUIRES_REVIEW";
  readonly currentDisposition: "REQUIRES_PII_REVIEW";
}
interface MhsV2HumanPiiPacketPayload {
  readonly schemaVersion: typeof MHS_V2_HUMAN_PII_REVIEW_PACKET_SCHEMA;
  readonly packetVersion: typeof MHS_V2_HUMAN_PII_REVIEW_PACKET_VERSION;
  readonly phase: "T6L-7I2B";
  readonly reviewerRole: "PRIVACY_ONLY";
  readonly authorities: Readonly<Record<string, string>>;
  readonly membershipDigest: string;
  readonly rows: readonly MhsV2HumanPiiPacketRow[];
  readonly allowedDecisions: typeof HUMAN_PII_DECISIONS;
  readonly allowedReasonCodes: typeof HUMAN_PII_REASON_CODES;
  readonly boundaries: Readonly<Record<string, boolean>>;
  readonly generatedAt: typeof MHS_V2_HUMAN_PII_PACKET_GENERATED_AT;
}
export type MhsV2HumanPiiPacketArtifact = MhsV2HumanPiiPacketPayload & { readonly packetPayloadDigest: string };

export interface HumanPiiDecisionRow { readonly candidateId: string; readonly textSha256: string; readonly humanPiiDecision: HumanPiiDecision; readonly humanPiiReasonCode: HumanPiiReasonCode }

const unresolvedRows = (screening: MhsV2PiiScreeningArtifact, disposition: MhsV2PiiDispositionArtifact) => {
  const screenById = new Map(screening.rows.map((row) => [row.candidateId, row]));
  return disposition.rows.filter((row) => row.reviewDisposition === "REQUIRES_PII_REVIEW").map((row) => {
    const screened = screenById.get(row.candidateId);
    if (!screened || screened.piiStatus !== "REQUIRES_REVIEW" || screened.findingClasses.length !== 1 || screened.findingClasses[0] !== "AMBIGUOUS_NUMERIC_PATTERN") throw new Error("Human PII packet membership is not an authorized ambiguous-numeric finding");
    return screened;
  });
};

export const humanPiiMembershipDigest = (rows: readonly Pick<MhsV2HumanPiiPacketRow, "candidateId" | "textSha256">[]): string =>
  digest([...rows].map(({ candidateId, textSha256 }) => ({ candidateId, textSha256 })).sort((a, b) => a.candidateId.localeCompare(b.candidateId)));

export const createMhsV2HumanPiiReviewPacket = (candidate: MhsV2ExpansionCandidateArtifact, screening: MhsV2PiiScreeningArtifact, disposition: MhsV2PiiDispositionArtifact): MhsV2HumanPiiPacketArtifact => {
  validateMhsV2PiiArtifacts(screening, disposition, candidate);
  if (sha(canonicalJson(candidate)) !== MHS_V2_EXPANSION_CANDIDATE_SHA256 || sha(canonicalJson(screening)) !== MHS_V2_EXPANSION_PII_SCREENING_SHA256 || sha(canonicalJson(disposition)) !== MHS_V2_EXPANSION_PII_DISPOSITION_SHA256) throw new Error("Human PII packet upstream authority mismatch");
  const candidates = new Map(candidate.rows.map((row) => [row.candidateId, row]));
  const rows: MhsV2HumanPiiPacketRow[] = unresolvedRows(screening, disposition).map((screened) => {
    const source = candidates.get(screened.candidateId);
    if (!source || source.exactTextDigest !== screened.textSha256 || sha(source.text) !== source.exactTextDigest) throw new Error("Human PII packet text binding mismatch");
    return { candidateId: source.candidateId, text: source.text, textSha256: source.exactTextDigest, automaticFinding: "AMBIGUOUS_NUMERIC_PATTERN", currentPiiStatus: "REQUIRES_REVIEW", currentDisposition: "REQUIRES_PII_REVIEW" };
  });
  if (rows.length !== 3 || new Set(rows.map((row) => row.candidateId)).size !== 3) throw new Error("Human PII packet must contain exactly three unique candidates");
  const payload: MhsV2HumanPiiPacketPayload = {
    schemaVersion: MHS_V2_HUMAN_PII_REVIEW_PACKET_SCHEMA, packetVersion: MHS_V2_HUMAN_PII_REVIEW_PACKET_VERSION,
    phase: "T6L-7I2B", reviewerRole: "PRIVACY_ONLY",
    authorities: { policyArtifactSha256: TEXT_MODERATION_PII_POLICY_SHA256, policyPayloadDigest: TEXT_MODERATION_PII_POLICY_PAYLOAD_DIGEST, candidateArtifactSha256: MHS_V2_EXPANSION_CANDIDATE_SHA256, candidateMembershipDigest: MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST, screeningArtifactSha256: MHS_V2_EXPANSION_PII_SCREENING_SHA256, screeningPayloadDigest: MHS_V2_EXPANSION_PII_SCREENING_PAYLOAD_DIGEST, automaticDispositionArtifactSha256: MHS_V2_EXPANSION_PII_DISPOSITION_SHA256, automaticDispositionPayloadDigest: MHS_V2_EXPANSION_PII_DISPOSITION_PAYLOAD_DIGEST },
    membershipDigest: humanPiiMembershipDigest(rows), rows, allowedDecisions: HUMAN_PII_DECISIONS, allowedReasonCodes: HUMAN_PII_REASON_CODES,
    boundaries: { moderationReviewPerformed: false, moderationLabelsGenerated: false, redactionPerformed: false, candidateMutated: false, semanticProcessingPerformed: false, classifierInferencePerformed: false, trainingPerformed: false, internalTestAccessed: false, frozen140Accessed: false },
    generatedAt: MHS_V2_HUMAN_PII_PACKET_GENERATED_AT,
  };
  const artifact = { ...payload, packetPayloadDigest: digest(payload) }; validateMhsV2HumanPiiReviewPacket(artifact, candidate, screening, disposition); return artifact;
};

export const validateMhsV2HumanPiiReviewPacket = (packet: MhsV2HumanPiiPacketArtifact, candidate: MhsV2ExpansionCandidateArtifact, screening: MhsV2PiiScreeningArtifact, disposition: MhsV2PiiDispositionArtifact): void => {
  const { packetPayloadDigest, ...payload } = packet;
  if (packet.schemaVersion !== MHS_V2_HUMAN_PII_REVIEW_PACKET_SCHEMA || packet.packetVersion !== MHS_V2_HUMAN_PII_REVIEW_PACKET_VERSION || packet.phase !== "T6L-7I2B" || packet.reviewerRole !== "PRIVACY_ONLY" || packetPayloadDigest !== digest(payload)) throw new Error("Invalid human PII packet identity or digest");
  if (packet.rows.length !== 3 || new Set(packet.rows.map((row) => row.candidateId)).size !== 3 || packet.membershipDigest !== humanPiiMembershipDigest(packet.rows) || Object.values(packet.boundaries).some(Boolean)) throw new Error("Invalid human PII packet membership or boundary");
  const expected = createExpectedPacketRows(candidate, screening, disposition);
  if (canonicalJson(packet.rows) !== canonicalJson(expected)) throw new Error("Human PII packet membership or text binding mismatch");
  const forbidden = ["hate_speech_score", "hatespeech", "dehumanize", "insult", "humiliate", "violence", "genocide", "attack_defend", "finalSthnDecision", "finalSthnPrimaryCategory"];
  if (forbidden.some((key) => JSON.stringify(packet).includes(`\"${key}\"`))) throw new Error("Human PII packet contains moderation measurements");
};

const createExpectedPacketRows = (candidate: MhsV2ExpansionCandidateArtifact, screening: MhsV2PiiScreeningArtifact, disposition: MhsV2PiiDispositionArtifact): MhsV2HumanPiiPacketRow[] => {
  const candidates = new Map(candidate.rows.map((row) => [row.candidateId, row]));
  return unresolvedRows(screening, disposition).map((screened) => { const row = candidates.get(screened.candidateId); if (!row) throw new Error("Missing human PII candidate"); return { candidateId: row.candidateId, text: row.text, textSha256: row.exactTextDigest, automaticFinding: "AMBIGUOUS_NUMERIC_PATTERN", currentPiiStatus: "REQUIRES_REVIEW", currentDisposition: "REQUIRES_PII_REVIEW" }; });
};

export const createBlankHumanPiiDecisionTemplate = (packet: MhsV2HumanPiiPacketArtifact): string => serializeCsv(packet.rows.map((row) => ({ candidateId: row.candidateId, textSha256: row.textSha256, humanPiiDecision: "", humanPiiReasonCode: "" })));

const assertColumns = (records: readonly CsvRecord[]): void => {
  for (const record of records) if (canonicalJson(Object.keys(record)) !== canonicalJson(HUMAN_PII_DECISION_COLUMNS)) throw new Error(`Human PII decisions must use exactly: ${HUMAN_PII_DECISION_COLUMNS.join(", ")}`);
};

export const validateBlankHumanPiiDecisionTemplate = (csv: string, packet: MhsV2HumanPiiPacketArtifact): void => {
  const records = parseCsv(csv); assertColumns(records);
  if (records.length !== 3 || new Set(records.map((row) => row.candidateId)).size !== 3) throw new Error("Blank human PII template must contain exactly three unique IDs");
  const expected = new Map(packet.rows.map((row) => [row.candidateId, row.textSha256]));
  for (const row of records) if (expected.get(row.candidateId) !== row.textSha256 || row.humanPiiDecision !== "" || row.humanPiiReasonCode !== "") throw new Error("Blank human PII template contains stale binding or fabricated decision");
};

const reasonAllowed = (decision: HumanPiiDecision, reason: HumanPiiReasonCode): boolean => decision === "NONE" ? (HUMAN_PII_NONE_REASON_CODES as readonly string[]).includes(reason) : decision === "EXCLUDE" ? (PII_EXCLUSION_REASON_CODES as readonly string[]).includes(reason) : (HUMAN_PII_UNRESOLVED_REASON_CODES as readonly string[]).includes(reason);

export const parseCompletedHumanPiiDecisions = (csv: string, packet: MhsV2HumanPiiPacketArtifact): readonly HumanPiiDecisionRow[] => {
  const records = parseCsv(csv); assertColumns(records);
  if (records.length !== 3 || new Set(records.map((row) => row.candidateId)).size !== 3) throw new Error("Completed human PII decisions require exactly three unique IDs");
  const expected = new Map(packet.rows.map((row) => [row.candidateId, row.textSha256]));
  const rows = records.map((row) => {
    if (!expected.has(row.candidateId)) throw new Error("Unexpected human PII candidate ID");
    if (expected.get(row.candidateId) !== row.textSha256) throw new Error("Stale human PII text SHA binding");
    if (!(HUMAN_PII_DECISIONS as readonly string[]).includes(row.humanPiiDecision)) throw new Error("Invalid or missing human PII decision");
    if (!(HUMAN_PII_REASON_CODES as readonly string[]).includes(row.humanPiiReasonCode)) throw new Error("Invalid or missing human PII reason code");
    const decision = row.humanPiiDecision as HumanPiiDecision, reason = row.humanPiiReasonCode as HumanPiiReasonCode;
    if (!reasonAllowed(decision, reason)) throw new Error("Human PII decision/reason mismatch");
    return { candidateId: row.candidateId, textSha256: row.textSha256, humanPiiDecision: decision, humanPiiReasonCode: reason };
  });
  if (rows.some((row) => row.humanPiiDecision as string === "REDACTED")) throw new Error("REDACTED is not authorized");
  return rows;
};

export interface MhsV2HumanPiiFinalArtifact {
  readonly schemaVersion: typeof MHS_V2_HUMAN_PII_FINAL_SCHEMA; readonly dispositionVersion: typeof MHS_V2_HUMAN_PII_FINAL_VERSION; readonly phase: "T6L-7I2B";
  readonly reviewer: { readonly role: "PRIVACY_ONLY"; readonly reviewerId: string; readonly reviewedAt: string };
  readonly authorities: Readonly<Record<string, string>>; readonly membershipDigest: string;
  readonly completedDecisionInput: { readonly schemaVersion: typeof MHS_V2_HUMAN_PII_DECISION_SCHEMA; readonly filename: string; readonly sha256: string; readonly rowCount: 3 };
  readonly decisions: readonly { readonly candidateId: string; readonly textSha256: string; readonly automaticFinding: "AMBIGUOUS_NUMERIC_PATTERN"; readonly previousPiiStatus: "REQUIRES_REVIEW"; readonly previousDisposition: "REQUIRES_PII_REVIEW"; readonly humanPiiDecision: HumanPiiDecision; readonly humanPiiReasonCode: HumanPiiReasonCode; readonly resultingPiiStatus: HumanPiiDecision; readonly resultingReviewDisposition: "ELIGIBLE_FOR_REVIEW" | "REQUIRES_PII_REVIEW" | "EXCLUDED" }[];
  readonly finalRows: readonly { readonly candidateId: string; readonly textSha256: string; readonly piiStatus: HumanPiiDecision; readonly reviewDisposition: "ELIGIBLE_FOR_REVIEW" | "REQUIRES_PII_REVIEW" | "EXCLUDED"; readonly dispositionAuthority: "AUTOMATIC_SCREEN_V1" | "HUMAN_PRIVACY_REVIEW_V1" }[];
  readonly futureModerationReviewMembership: { readonly candidateIds: readonly string[]; readonly membershipDigest: string; readonly excludedCandidatesRemoved: true; readonly deterministicallyFrozen: true };
  readonly piiStatusCounts: { readonly NONE: number; readonly REQUIRES_REVIEW: number; readonly EXCLUDE: number; readonly REDACTED: 0; readonly total: 400 };
  readonly reviewDispositionCounts: { readonly ELIGIBLE_FOR_REVIEW: number; readonly REQUIRES_PII_REVIEW: number; readonly EXCLUDED: number; readonly total: 400 };
  readonly capacityAssessment: { readonly status: "PLAUSIBLE_CAPACITY_NOT_LABEL_GUARANTEE" | "INSUFFICIENT_REVIEWABLE_CAPACITY"; readonly eligibleCandidateCount: number; readonly targetNewAllow: 70; readonly targetNewBlock: 70; readonly threatOrViolenceSourceEnvelopeFloor: 15; readonly sourceMeasurementsInterpretedAsLabels: false };
  readonly authorizationDecision: "AUTHORIZE_T6L_7I3_REVIEWER_A_REVIEW" | "DO_NOT_AUTHORIZE_T6L_7I3_REVIEWER_A_REVIEW";
  readonly protections: Readonly<Record<string, boolean | number>>; readonly generatedAt: typeof MHS_V2_HUMAN_PII_DISPOSITION_GENERATED_AT; readonly dispositionPayloadDigest: string;
}

export const createMhsV2HumanPiiFinalDisposition = (packet: MhsV2HumanPiiPacketArtifact, automaticDisposition: MhsV2PiiDispositionArtifact, candidate: MhsV2ExpansionCandidateArtifact, decisionCsv: string, decisionFilename: string, reviewerId: string, reviewedAt: string = MHS_V2_HUMAN_PII_DISPOSITION_GENERATED_AT): MhsV2HumanPiiFinalArtifact => {
  if (!reviewerId.trim() || !Number.isFinite(Date.parse(reviewedAt))) throw new Error("Human PII reviewer authority and timestamp are required");
  if (sha(canonicalJson(automaticDisposition)) !== MHS_V2_EXPANSION_PII_DISPOSITION_SHA256 || sha(canonicalJson(candidate)) !== MHS_V2_EXPANSION_CANDIDATE_SHA256) throw new Error("Final human PII upstream authority mismatch");
  if (sha(canonicalJson(packet)) !== MHS_V2_HUMAN_PII_REVIEW_PACKET_SHA256 || packet.packetPayloadDigest !== MHS_V2_HUMAN_PII_REVIEW_PACKET_PAYLOAD_DIGEST || packet.membershipDigest !== MHS_V2_HUMAN_PII_REVIEW_MEMBERSHIP_DIGEST) throw new Error("Human PII packet authority mismatch");
  const parsedDecisions = parseCompletedHumanPiiDecisions(decisionCsv, packet), packetById = new Map(packet.rows.map((row) => [row.candidateId, row]));
  const decisions = parsedDecisions.map((human) => { const prior = packetById.get(human.candidateId); if (!prior) throw new Error("Human PII decision is outside packet membership"); const resultingReviewDisposition = human.humanPiiDecision === "NONE" ? "ELIGIBLE_FOR_REVIEW" as const : human.humanPiiDecision === "EXCLUDE" ? "EXCLUDED" as const : "REQUIRES_PII_REVIEW" as const; return { candidateId: human.candidateId, textSha256: human.textSha256, automaticFinding: prior.automaticFinding, previousPiiStatus: prior.currentPiiStatus, previousDisposition: prior.currentDisposition, humanPiiDecision: human.humanPiiDecision, humanPiiReasonCode: human.humanPiiReasonCode, resultingPiiStatus: human.humanPiiDecision, resultingReviewDisposition }; });
  const decisionsById = new Map(decisions.map((row) => [row.candidateId, row]));
  const finalRows = automaticDisposition.rows.map((row) => { const human = decisionsById.get(row.candidateId); if (!human) { if (row.piiStatus !== "NONE" || row.reviewDisposition !== "ELIGIBLE_FOR_REVIEW") throw new Error("Unresolved candidate lacks human PII decision"); return { candidateId: row.candidateId, textSha256: row.textSha256, piiStatus: "NONE" as const, reviewDisposition: "ELIGIBLE_FOR_REVIEW" as const, dispositionAuthority: "AUTOMATIC_SCREEN_V1" as const }; } const reviewDisposition = human.humanPiiDecision === "NONE" ? "ELIGIBLE_FOR_REVIEW" as const : human.humanPiiDecision === "EXCLUDE" ? "EXCLUDED" as const : "REQUIRES_PII_REVIEW" as const; return { candidateId: row.candidateId, textSha256: row.textSha256, piiStatus: human.humanPiiDecision, reviewDisposition, dispositionAuthority: "HUMAN_PRIVACY_REVIEW_V1" as const }; });
  if (finalRows.length !== 400 || new Set(finalRows.map((row) => row.candidateId)).size !== 400) throw new Error("Final human PII state must cover 400 unique candidates");
  const none = finalRows.filter((row) => row.piiStatus === "NONE").length, unresolved = finalRows.filter((row) => row.piiStatus === "REQUIRES_REVIEW").length, excluded = finalRows.filter((row) => row.piiStatus === "EXCLUDE").length;
  const futureCandidateIds = finalRows.filter((row) => row.reviewDisposition === "ELIGIBLE_FOR_REVIEW").map((row) => row.candidateId);
  const candidateById = new Map(candidate.rows.map((row) => [row.candidateId, row])), violenceEnvelope = futureCandidateIds.filter((candidateId) => candidateById.get(candidateId)?.selectionStratum === "VIOLENCE_GENOCIDE_SIGNAL").length;
  const capacityPlausible = futureCandidateIds.length >= 140 && violenceEnvelope >= 15;
  const payload = { schemaVersion: MHS_V2_HUMAN_PII_FINAL_SCHEMA, dispositionVersion: MHS_V2_HUMAN_PII_FINAL_VERSION, phase: "T6L-7I2B" as const, reviewer: { role: "PRIVACY_ONLY" as const, reviewerId: reviewerId.trim(), reviewedAt }, authorities: { ...packet.authorities, acquisitionArtifactSha256: MHS_V2_EXPANSION_ACQUISITION_SHA256, reviewPacketSha256: MHS_V2_HUMAN_PII_REVIEW_PACKET_SHA256, reviewPacketPayloadDigest: packet.packetPayloadDigest, blankDecisionTemplateSha256: MHS_V2_HUMAN_PII_BLANK_TEMPLATE_SHA256 }, membershipDigest: packet.membershipDigest, completedDecisionInput: { schemaVersion: MHS_V2_HUMAN_PII_DECISION_SCHEMA, filename: path.basename(decisionFilename), sha256: sha(decisionCsv), rowCount: 3 as const }, decisions, finalRows, futureModerationReviewMembership: { candidateIds: futureCandidateIds, membershipDigest: digest(futureCandidateIds), excludedCandidatesRemoved: true as const, deterministicallyFrozen: true as const }, piiStatusCounts: { NONE: none, REQUIRES_REVIEW: unresolved, EXCLUDE: excluded, REDACTED: 0 as const, total: 400 as const }, reviewDispositionCounts: { ELIGIBLE_FOR_REVIEW: none, REQUIRES_PII_REVIEW: unresolved, EXCLUDED: excluded, total: 400 as const }, capacityAssessment: { status: capacityPlausible ? "PLAUSIBLE_CAPACITY_NOT_LABEL_GUARANTEE" as const : "INSUFFICIENT_REVIEWABLE_CAPACITY" as const, eligibleCandidateCount: futureCandidateIds.length, targetNewAllow: 70 as const, targetNewBlock: 70 as const, threatOrViolenceSourceEnvelopeFloor: 15 as const, sourceMeasurementsInterpretedAsLabels: false as const }, authorizationDecision: unresolved === 0 && capacityPlausible ? "AUTHORIZE_T6L_7I3_REVIEWER_A_REVIEW" as const : "DO_NOT_AUTHORIZE_T6L_7I3_REVIEWER_A_REVIEW" as const, protections: { candidateMutations: 0, redactions: 0, moderationLabelsGenerated: 0, moderationReviewsPerformed: 0, semanticProcessingPerformed: false, classifierInferencePerformed: false, trainingPerformed: false, internalTestAccessed: false, frozen140Accessed: false }, generatedAt: MHS_V2_HUMAN_PII_DISPOSITION_GENERATED_AT };
  const artifact = { ...payload, dispositionPayloadDigest: digest(payload) }; validateMhsV2HumanPiiFinalDisposition(artifact); return artifact;
};

export const validateMhsV2HumanPiiFinalDisposition = (artifact: MhsV2HumanPiiFinalArtifact): void => {
  const { dispositionPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_HUMAN_PII_FINAL_SCHEMA || artifact.dispositionVersion !== MHS_V2_HUMAN_PII_FINAL_VERSION || artifact.generatedAt !== MHS_V2_HUMAN_PII_DISPOSITION_GENERATED_AT || dispositionPayloadDigest !== digest(payload) || artifact.decisions.length !== 3 || new Set(artifact.decisions.map((row) => row.candidateId)).size !== 3 || !/^[a-f0-9]{64}$/u.test(artifact.completedDecisionInput.sha256) || artifact.completedDecisionInput.rowCount !== 3 || artifact.finalRows.length !== 400 || new Set(artifact.finalRows.map((row) => row.candidateId)).size !== 400) throw new Error("Invalid final human PII disposition");
  const none = artifact.finalRows.filter((row) => row.piiStatus === "NONE").length, unresolved = artifact.finalRows.filter((row) => row.piiStatus === "REQUIRES_REVIEW").length, excluded = artifact.finalRows.filter((row) => row.piiStatus === "EXCLUDE").length;
  if (canonicalJson(artifact.piiStatusCounts) !== canonicalJson({ NONE: none, REQUIRES_REVIEW: unresolved, EXCLUDE: excluded, REDACTED: 0, total: 400 }) || artifact.futureModerationReviewMembership.membershipDigest !== digest(artifact.futureModerationReviewMembership.candidateIds) || artifact.futureModerationReviewMembership.candidateIds.some((candidateId) => artifact.finalRows.find((row) => row.candidateId === candidateId)?.reviewDisposition !== "ELIGIBLE_FOR_REVIEW")) throw new Error("Invalid final human PII counts or membership");
  const expected = unresolved === 0 && artifact.capacityAssessment.status === "PLAUSIBLE_CAPACITY_NOT_LABEL_GUARANTEE" ? "AUTHORIZE_T6L_7I3_REVIEWER_A_REVIEW" : "DO_NOT_AUTHORIZE_T6L_7I3_REVIEWER_A_REVIEW";
  if (artifact.authorizationDecision !== expected || Object.values(artifact.protections).some((value) => value !== false && value !== 0)) throw new Error("Invalid final human PII authorization boundary");
};

type PairPublisher = (packetTemporary: string, packetTarget: string, templateTemporary: string, templateTarget: string) => void;
const defaultPairPublisher: PairPublisher = (packetTemporary, packetTarget, templateTemporary, templateTarget) => { fs.renameSync(packetTemporary, packetTarget); fs.renameSync(templateTemporary, templateTarget); };
export const publishHumanPiiReviewMaterials = (packet: MhsV2HumanPiiPacketArtifact, template: string, outputDirectory: string, publish: PairPublisher = defaultPairPublisher): { packetPath: string; templatePath: string; packetSha256: string; templateSha256: string } => {
  validateBlankHumanPiiDecisionTemplate(template, packet); fs.mkdirSync(outputDirectory, { recursive: true });
  const packetPath = path.join(outputDirectory, MHS_V2_HUMAN_PII_REVIEW_PACKET_FILENAME), templatePath = path.join(outputDirectory, MHS_V2_HUMAN_PII_DECISION_TEMPLATE_FILENAME);
  if (fs.existsSync(packetPath) || fs.existsSync(templatePath)) throw new Error("Human PII review material exists; overwrite refused");
  const packetText = canonicalJson(packet), token = `${process.pid}-${crypto.randomBytes(8).toString("hex")}`, packetTemporary = `${packetPath}.${token}.partial`, templateTemporary = `${templatePath}.${token}.partial`;
  try { fs.writeFileSync(packetTemporary, packetText, { flag: "wx" }); fs.writeFileSync(templateTemporary, template, { flag: "wx" }); publish(packetTemporary, packetPath, templateTemporary, templatePath); if (fs.readFileSync(packetPath, "utf8") !== packetText || fs.readFileSync(templatePath, "utf8") !== template) throw new Error("Incomplete human PII review publication"); return { packetPath, templatePath, packetSha256: sha(packetText), templateSha256: sha(template) }; }
  catch (error) { for (const [filename, expected] of [[packetPath, packetText], [templatePath, template]] as const) if (fs.existsSync(filename) && fs.readFileSync(filename, "utf8") === expected) fs.rmSync(filename, { force: true }); throw error; }
  finally { fs.rmSync(packetTemporary, { force: true }); fs.rmSync(templateTemporary, { force: true }); }
};

type AtomicPublisher = (temporaryPath: string, targetPath: string) => void;
export const publishHumanPiiFinalDisposition = (artifact: MhsV2HumanPiiFinalArtifact, outputDirectory: string, publish: AtomicPublisher = fs.renameSync): { artifactPath: string; artifactSha256: string } => {
  validateMhsV2HumanPiiFinalDisposition(artifact);
  fs.mkdirSync(outputDirectory, { recursive: true }); const target = path.join(outputDirectory, MHS_V2_HUMAN_PII_FINAL_FILENAME); if (fs.existsSync(target)) throw new Error("Final human PII disposition exists; overwrite refused");
  const serialized = canonicalJson(artifact), temporary = `${target}.${process.pid}-${crypto.randomBytes(8).toString("hex")}.partial`; try { fs.writeFileSync(temporary, serialized, { flag: "wx" }); publish(temporary, target); if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== serialized) throw new Error("Incomplete final human PII disposition publication"); return { artifactPath: target, artifactSha256: sha(serialized) }; } catch (error) { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === serialized) fs.rmSync(target, { force: true }); throw error; } finally { fs.rmSync(temporary, { force: true }); }
};

export interface HumanPiiAuthorityHashes { readonly policy: string; readonly candidate: string; readonly acquisition: string; readonly screening: string; readonly disposition: string; readonly packet?: string; readonly blankTemplate?: string; readonly v1Candidate: string; readonly splitManifest: string; readonly internalTestFreeze: string }
export const assertHumanPiiAuthorityHashes = (paths: HumanPiiAuthorityHashes): void => {
  const checks: readonly [string, string][] = [[paths.policy, TEXT_MODERATION_PII_POLICY_SHA256], [paths.candidate, MHS_V2_EXPANSION_CANDIDATE_SHA256], [paths.acquisition, MHS_V2_EXPANSION_ACQUISITION_SHA256], [paths.screening, MHS_V2_EXPANSION_PII_SCREENING_SHA256], [paths.disposition, MHS_V2_EXPANSION_PII_DISPOSITION_SHA256], [paths.v1Candidate, MHS_CANDIDATE_ARTIFACT_SHA256], [paths.splitManifest, MHS_SPLIT_MANIFEST_SHA256], [paths.internalTestFreeze, MHS_INTERNAL_TEST_FREEZE_SHA256]];
  for (const [filename, expected] of checks) if (sha(fs.readFileSync(filename)) !== expected) throw new Error(`T6L-7I2B authority mismatch: ${path.basename(filename)}`);
  if (paths.packet && sha(fs.readFileSync(paths.packet)) !== MHS_V2_HUMAN_PII_REVIEW_PACKET_SHA256) throw new Error("T6L-7I2B review packet authority mismatch");
  if (paths.blankTemplate && sha(fs.readFileSync(paths.blankTemplate)) !== MHS_V2_HUMAN_PII_BLANK_TEMPLATE_SHA256) throw new Error("T6L-7I2B blank template authority mismatch");
};
