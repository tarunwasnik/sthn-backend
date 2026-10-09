import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { ProvenanceStagingRow } from "../research/textModerationDataset/contracts";
import { canonicalJson } from "../research/textModerationDataset/manifest";
import {
  MHS_AUDIT_STRATA, MHS_MAPPING_AUDIT_SEED, MHS_MAPPING_AUDIT_VERSION, calculateMhsStratumMetrics,
  classifyMhsAuditStrata, mhsAuditMembershipDigest, selectMhsMappingAuditSample, summarizeMhsSource, validateMhsAuditRow,
} from "../research/textModerationDataset/mhsMappingAudit";
import { MHS_MAPPING_AUDIT_SAMPLE_DIGEST, applyMhsMappingAuditReviewV1 } from "../research/textModerationDataset/mhsMappingAuditReviewV1";

const tally = (values: readonly string[]): Readonly<Record<string, number>> => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((candidate) => candidate === value).length]));

const main = async (): Promise<void> => {
  const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
  const reader = readline.createInterface({ input: fs.createReadStream(path.join(root, "provenance-staging.jsonl"), "utf8"), crlfDelay: Infinity });
  const staged: ProvenanceStagingRow[] = [];
  for await (const line of reader) if (line.trim()) staged.push(JSON.parse(line) as ProvenanceStagingRow);
  const pending = selectMhsMappingAuditSample(staged); const reviewed = applyMhsMappingAuditReviewV1(pending);
  reviewed.forEach((row) => validateMhsAuditRow(row));
  const digest = mhsAuditMembershipDigest(reviewed); if (digest !== MHS_MAPPING_AUDIT_SAMPLE_DIGEST) throw new Error("MHS audit digest mismatch");

  const corpusStrata: Record<string, number> = Object.fromEntries(MHS_AUDIT_STRATA.map((stratum) => [stratum, 0]));
  staged.forEach((row) => classifyMhsAuditStrata(row, summarizeMhsSource(row)).forEach((stratum) => { corpusStrata[stratum] += 1; }));
  const summary = {
    auditVersion: MHS_MAPPING_AUDIT_VERSION, auditSeed: MHS_MAPPING_AUDIT_SEED, sampleDigest: digest,
    sourceId: "MEASURING_HATE_SPEECH", sourceContentRows: staged.length, auditedRows: reviewed.length,
    uniqueSourceRowIds: new Set(reviewed.map((row) => row.sourceRowId)).size,
    uniqueCommentIds: new Set(reviewed.map((row) => row.commentId)).size,
    reviewStatusCounts: tally(reviewed.map((row) => row.reviewStatus)), decisionCounts: tally(reviewed.map((row) => row.humanDecision ?? "UNRESOLVED")),
    categoryCounts: tally(reviewed.flatMap((row) => [row.humanPrimaryCategory, ...row.humanSecondaryCategories].filter((value): value is NonNullable<typeof value> => value !== null))), reasonCounts: tally(reviewed.map((row) => row.auditReasonCode ?? "UNRESOLVED")),
    stratumMetrics: calculateMhsStratumMetrics(reviewed),
    stratumReasonCounts: Object.fromEntries(MHS_AUDIT_STRATA.map((stratum) => [stratum, tally(reviewed.filter((row) => row.selectionStrata.includes(stratum)).map((row) => row.auditReasonCode ?? "UNRESOLVED"))])),
    corpusStratumCounts: corpusStrata,
    automaticRuleCandidate: null,
    automaticRuleConclusion: "No narrow automatic MHS rule is proposed. One policy review per audit row is evidence only for review design; it is ineligible for automatic-rule certification.",
    mappingAuthority: "STHN_TEXT_MODERATION_PUBLIC_MAPPING_V1R2_UNCHANGED",
    scorePolicy: "No hate_speech_score threshold directly maps to an STHN decision or category.",
    manualReviewRecommendation: {
      disposition: "USE_WITH_MANUAL_REVIEW_ONLY",
      requiredReviewVolumeUnderCurrentAuthority: staged.length,
      priorityOrder: ["SOURCE_INCONSISTENCY", "HIGH_DISAGREEMENT", "VIOLENCE", "GENOCIDE", "DEHUMANIZATION", "PROTECTED_TARGET", "MIDDLE_SCORE", "CONTEXT_CANDIDATE"],
      recommendedFirstTranche: {
        deduplicatedRows: 3000,
        quotasBeforeOverlapDeduplication: {
          sourceInconsistencyOrHighDisagreement: 800, violenceOrGenocide: 600, protectedTargetDehumanizationHighScore: 600,
          lowScoreContextOrCounterspeech: 500, nonHateAbuseOrNoProtectedTarget: 500,
        },
        balancing: "Cap dominant target families and score bands; oversample the rare no-clear-protected-target pool; preserve source platform diversity; route overlaps to the highest-risk quota only.",
        categoryGoals: ["HATE versus ABUSIVE_OR_HARASSING", "THREAT_OR_VIOLENCE threat-first collisions", "SEXUAL and PROFANITY source-taxonomy gaps", "contextual ALLOW evidence"],
      },
      exclusions: ["annotator demographics", "unresolved PII", "incoherent or context-insufficient rows", "rows without adjudicated STHN labels"],
    },
  };
  fs.writeFileSync(path.join(root, "mhs-mapping-audit-v1.jsonl"), `${reviewed.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  fs.writeFileSync(path.join(root, "mhs-mapping-audit-v1-summary.json"), canonicalJson(summary), "utf8");
  console.log(canonicalJson(summary));
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
