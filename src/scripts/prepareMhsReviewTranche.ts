import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { ProvenanceStagingRow } from "../research/textModerationDataset/contracts";
import { canonicalJson } from "../research/textModerationDataset/manifest";
import {
  MHS_REVIEW_ALLOCATION, MHS_REVIEW_SOURCE_REVISION, MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST, MHS_REVIEW_TRANCHE_SEED, MHS_REVIEW_TRANCHE_VERSION,
  mhsReviewTrancheMembershipDigest, selectMhsReviewTranche, validateMhsReviewTrancheRow,
} from "../research/textModerationDataset/mhsReviewTranche";

const tally = (values: readonly string[]): Readonly<Record<string, number>> => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((candidate) => candidate === value).length]));

const main = async (): Promise<void> => {
  const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
  const reader = readline.createInterface({ input: fs.createReadStream(path.join(root, "provenance-staging.jsonl"), "utf8"), crlfDelay: Infinity });
  const staged: ProvenanceStagingRow[] = []; for await (const line of reader) if (line.trim()) staged.push(JSON.parse(line) as ProvenanceStagingRow);
  const tranche = selectMhsReviewTranche(staged); tranche.forEach(validateMhsReviewTrancheRow);
  const membershipDigest = mhsReviewTrancheMembershipDigest(tranche); if (membershipDigest !== MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST) throw new Error("Frozen MHS review tranche membership changed");
  const scoreBands = tranche.map((row) => row.membershipStrata.includes("HIGH_SCORE") ? "HIGH_SCORE" : row.membershipStrata.includes("LOW_SCORE") ? "LOW_SCORE" : "MIDDLE_SCORE");
  const targetFamilies = tranche.flatMap((row) => row.sourceEvidenceSummary.target.protectedFamilies);
  const summary = {
    trancheVersion: MHS_REVIEW_TRANCHE_VERSION, seed: MHS_REVIEW_TRANCHE_SEED, membershipDigest, sourceRevision: MHS_REVIEW_SOURCE_REVISION,
    sourceContentRows: staged.length, uniqueTrancheRows: tranche.length, uniqueCommentIds: new Set(tranche.map((row) => row.commentId)).size,
    allocationTargets: MHS_REVIEW_ALLOCATION, allocationCounts: tally(tranche.map((row) => row.allocation)),
    membershipStratumCounts: Object.fromEntries([...new Set(tranche.flatMap((row) => row.membershipStrata))].sort().map((stratum) => [stratum, tranche.filter((row) => row.membershipStrata.includes(stratum)).length])),
    sourceScoreDistribution: tally(scoreBands),
    sourceTargetDistribution: { clearProtectedTarget: tranche.filter((row) => row.sourceEvidenceSummary.target.hasClearProtectedTarget).length, noClearProtectedTarget: tranche.filter((row) => !row.sourceEvidenceSummary.target.hasClearProtectedTarget).length, protectedFamilyMentions: tally(targetFamilies) },
    reviewerWorkflow: { authority: "SINGLE_REVIEWER_A", reviewerACompleted: 0, unresolvedAdjudication: 0 },
    finalDecisions: { ALLOW: 0, BLOCK: 0, EXCLUDE: 0, unresolved: tranche.length }, blockCategoryDistribution: {},
    piiDispositions: tally(tranche.map((row) => row.piiStatus)), transformations: 0, trainingEligible: 0,
    status: "TRANCHE_PREPARED_REVIEW_WORKFLOW_READY_AWAITING_HUMAN_ANNOTATION",
    modelInputContract: ["text"], mappingAuthority: "STHN_TEXT_MODERATION_PUBLIC_MAPPING_V1R2_UNCHANGED", split: "UNASSIGNED",
  };
  const basePath = path.join(root, "mhs-review-tranche-v1");
  const serialized = `${tranche.map((row) => JSON.stringify(row)).join("\n")}\n`;
  fs.writeFileSync(`${basePath}.jsonl`, serialized, "utf8");
  const packet = `${tranche.map((row) => JSON.stringify({ trancheVersion: row.trancheVersion, sourceId: row.sourceId, sourceRowId: row.sourceRowId, commentId: row.commentId, allocation: row.allocation, membershipStrata: row.membershipStrata, sourceEvidenceSummary: row.sourceEvidenceSummary, originalLabels: row.originalLabels, text: row.text, textDigest: row.textDigest, piiStatus: row.piiStatus })).join("\n")}\n`;
  fs.writeFileSync(`${basePath}-reviewer-a-packet.jsonl`, packet, "utf8");
  fs.writeFileSync(`${basePath}-public-reviewed-candidates.jsonl`, "", "utf8");
  fs.writeFileSync(`${basePath}-summary.json`, canonicalJson(summary), "utf8"); console.log(canonicalJson(summary));
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
