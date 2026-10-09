import crypto from "node:crypto";
import { canonicalJson } from "./manifest";

export const V3_CANDIDATE_AUDIT_SCHEMA = "STHN_TEXT_MODERATION_EXTERNAL_CANDIDATE_AUDIT_V3" as const;
export const V3_COMPONENT_MANIFEST_SCHEMA = "STHN_TEXT_MODERATION_EXTERNAL_DUPLICATE_COMPONENT_V3" as const;
export type CandidateTerminal = "MAPPING_EXCLUDED" | "LANGUAGE_CAP_EXCLUDED" | "SOURCE_CAP_EXCLUDED" | "BINARY_CONFLICT_EXCLUDED" | "CATEGORY_CAP_EXCLUDED" | "MATERIALIZED_TRAIN" | "MATERIALIZED_VALIDATION";
export type V3CandidateAudit = { schemaVersion: typeof V3_CANDIDATE_AUDIT_SCHEMA; candidateId: string; sourceId: string; artifact: string; archiveMember: string | null; sourceSplit: string | null; sourceRow: number; sourceNativeLabelMetadata: Record<string, string | number>; language: string; annotationProvenance: string; mappingRuleId: string | null; mappingDecision: "ALLOW" | "BLOCK" | "EXCLUDE"; binaryTarget: "ALLOW" | "BLOCK" | null; auxiliaryTarget: string; sourceTextSha256: string; normalizedFingerprint: string; sourcePriorityRank: number; languagePolicyOutcome: string; sourceCapOutcome: string; sourceCapRank: number | null; duplicateComponentId: string | null; componentOutcome: string | null; representativeCandidateId: string | null; categoryCapOutcome: string | null; categoryCapRank: number | null; developmentAssignment: "TRAIN" | "VALIDATION" | "EXCLUDED"; materializedTextSha256: string | null; terminalState: CandidateTerminal; terminalReason: string };
export const stableCandidateId = (sourceId: string, artifact: string, row: number, sourceTextSha256: string): string => `cand_${crypto.createHash("sha256").update(canonicalJson([sourceId, artifact, row, sourceTextSha256])).digest("hex")}`;
export const validateV3CandidateAudit = (row: V3CandidateAudit): void => { if (row.schemaVersion !== V3_CANDIDATE_AUDIT_SCHEMA || !/^cand_[a-f0-9]{64}$/.test(row.candidateId) || !/^[a-f0-9]{64}$/.test(row.sourceTextSha256) || !/^[a-f0-9]{64}$/.test(row.normalizedFingerprint) || (row.terminalState.startsWith("MATERIALIZED") && row.materializedTextSha256 !== row.sourceTextSha256)) throw new Error("Invalid V3 candidate audit evidence"); };
export const transitionV3Candidate = (row: V3CandidateAudit, next: CandidateTerminal): V3CandidateAudit => {
  const excluded = ["MAPPING_EXCLUDED", "LANGUAGE_CAP_EXCLUDED", "SOURCE_CAP_EXCLUDED", "BINARY_CONFLICT_EXCLUDED", "CATEGORY_CAP_EXCLUDED", "MATERIALIZED_TRAIN", "MATERIALIZED_VALIDATION"] as const;
  if (!excluded.includes(next) || row.terminalState !== next) throw new Error("V3 candidate transition must end in its persisted terminal state");
  if ((next === "MATERIALIZED_TRAIN" && row.developmentAssignment !== "TRAIN") || (next === "MATERIALIZED_VALIDATION" && row.developmentAssignment !== "VALIDATION") || (next.includes("EXCLUDED") && row.developmentAssignment !== "EXCLUDED")) throw new Error("Invalid V3 terminal assignment");
  validateV3CandidateAudit(row); return row;
};
