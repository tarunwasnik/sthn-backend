import fs from "node:fs";
import path from "node:path";
import { canonicalJson } from "../research/textModerationDataset/manifest";
import {
  MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST, MHS_REVIEW_PILOT_SEED, MHS_REVIEW_PILOT_SIZE, MHS_REVIEW_PILOT_VERSION,
  createMhsPilotReviewerCsv, mhsReviewPilotMembershipDigest, selectMhsReviewPilot, validatePreparedMhsPilotPacket,
} from "../research/textModerationDataset/mhsReviewPilot";
import {
  MHS_REVIEW_ALLOCATION, MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST, MHS_REVIEW_TRANCHE_SIZE, MHS_REVIEW_TRANCHE_VERSION,
  MhsReviewTrancheRow, mhsReviewTrancheMembershipDigest, validateMhsReviewTrancheRow,
} from "../research/textModerationDataset/mhsReviewTranche";

const tally = (values: readonly string[]): Readonly<Record<string, number>> => Object.fromEntries(
  [...new Set(values)].sort().map((value) => [value, values.filter((candidate) => candidate === value).length]),
);

const main = (): void => {
  const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
  const parentPath = path.join(root, "mhs-review-tranche-v1.jsonl");
  const parentBytesBefore = fs.readFileSync(parentPath);
  const parent = parentBytesBefore.toString("utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as MhsReviewTrancheRow);
  if (parent.length !== MHS_REVIEW_TRANCHE_SIZE) throw new Error("Frozen parent tranche must contain exactly 3,000 rows");
  parent.forEach(validateMhsReviewTrancheRow);
  if (mhsReviewTrancheMembershipDigest(parent) !== MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST) throw new Error("Frozen parent tranche membership changed");

  const pilot = selectMhsReviewPilot(parent);
  const membershipDigest = mhsReviewPilotMembershipDigest(pilot);
  if (membershipDigest !== MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST) throw new Error("Frozen pilot membership changed");
  const reviewerA = createMhsPilotReviewerCsv(pilot, "A");
  validatePreparedMhsPilotPacket(reviewerA, "A", pilot);

  const basePath = path.join(root, "mhs-review-pilot-v1");
  const manifest = {
    pilotVersion: MHS_REVIEW_PILOT_VERSION,
    seed: MHS_REVIEW_PILOT_SEED,
    membershipDigest,
    parentTrancheVersion: MHS_REVIEW_TRANCHE_VERSION,
    parentTrancheMembershipDigest: MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST,
    rows: pilot.map(({ pilotRowNumber, sourceRowId, commentId, allocation, membershipStrata, textDigest, piiStatus }) => ({
      pilotRowNumber, sourceRowId, commentId, allocation, membershipStrata, textDigest, piiStatus,
    })),
  };
  const summary = {
    pilotVersion: MHS_REVIEW_PILOT_VERSION,
    seed: MHS_REVIEW_PILOT_SEED,
    membershipDigest,
    parentTrancheVersion: MHS_REVIEW_TRANCHE_VERSION,
    parentTrancheMembershipDigest: MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST,
    uniquePilotRows: pilot.length,
    uniqueSourceRowIds: new Set(pilot.map((row) => row.sourceRowId)).size,
    uniqueCommentIds: new Set(pilot.map((row) => row.commentId)).size,
    allocationTargets: Object.fromEntries(Object.keys(MHS_REVIEW_ALLOCATION).map((allocation) => [allocation, 20])),
    allocationCounts: tally(pilot.map((row) => row.allocation)),
    membershipStratumCounts: tally(pilot.flatMap((row) => row.membershipStrata)),
    reviewerWorkflow: { authority: "SINGLE_REVIEWER_A", reviewerACompleted: 0, importedReviews: 0, unresolvedAdjudication: 0 },
    trainingEligible: 0,
    status: "PILOT_PREPARED_AWAITING_HUMAN_REVIEW",
  };
  fs.writeFileSync(`${basePath}-reviewer-a.csv`, reviewerA, "utf8");
  fs.writeFileSync(`${basePath}-manifest.json`, canonicalJson(manifest), "utf8");
  fs.writeFileSync(`${basePath}-summary.json`, canonicalJson(summary), "utf8");
  if (!fs.readFileSync(parentPath).equals(parentBytesBefore)) throw new Error("Pilot preparation mutated the frozen parent tranche");
  console.log(canonicalJson(summary));
};

main();
