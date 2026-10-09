import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import test from "node:test";
import { ProvenanceStagingRow } from "../../research/textModerationDataset/contracts";
import {
  MHS_REVIEW_ALLOCATION, MHS_REVIEW_AUTHORITY_POLICY_VERSION, MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST,
  MHS_REVIEW_TRANCHE_SIZE, MhsReviewTrancheRow, TrancheAdjudication, TrancheReview, applyPiiDisposition,
  applyTrancheRedaction, mhsReviewTrancheMembershipDigest, selectMhsReviewTranche, submitTrancheAdjudication,
  submitTrancheReview, toPublicReviewedCandidate, validateMhsReviewTrancheRow,
} from "../../research/textModerationDataset/mhsReviewTranche";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
const parentPath = path.join(root, "mhs-review-tranche-v1.jsonl");
const candidatePath = path.join(root, "mhs-review-tranche-v1-public-reviewed-candidates.jsonl");
const artifactPath = path.join(root, "reviews", "mhs-review-pilot-v1-reviewer-a-validated.json");
const fileDigest = (filename: string): string => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
let stagedPromise: Promise<readonly ProvenanceStagingRow[]> | null = null;
const staged = (): Promise<readonly ProvenanceStagingRow[]> => stagedPromise ??= (async () => {
  const rows: ProvenanceStagingRow[] = []; const reader = readline.createInterface({ input: fs.createReadStream(path.join(root, "provenance-staging.jsonl"), "utf8"), crlfDelay: Infinity });
  for await (const line of reader) if (line.trim()) rows.push(JSON.parse(line) as ProvenanceStagingRow); return rows;
})();
let tranchePromise: Promise<ReturnType<typeof selectMhsReviewTranche>> | null = null;
const tranche = (): Promise<ReturnType<typeof selectMhsReviewTranche>> => tranchePromise ??= staged().then(selectMhsReviewTranche);
const frozenParent: readonly MhsReviewTrancheRow[] = fs.readFileSync(parentPath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as MhsReviewTrancheRow);

const review = (row: MhsReviewTrancheRow, decision: TrancheReview["decision"], primary: TrancheReview["primaryCategory"] = null,
  secondary: TrancheReview["secondaryCategories"] = []): TrancheReview => ({
  slot: "A", reviewerId: "reviewer_a_01", independenceDeclaration: "INDEPENDENT_REVIEW_WITHOUT_PRIOR_JUDGMENT_ACCESS",
  decision, primaryCategory: primary, secondaryCategories: secondary,
  reasonCode: decision === "ALLOW" ? "POLICY_ACCEPTABLE" : decision === "EXCLUDE" ? "PII_OR_DATA_QUALITY"
    : decision === "NEEDS_ADJUDICATION" ? "INSUFFICIENT_CONTEXT" : "TARGETED_ABUSE",
  reviewNotes: null, reviewedTextDigest: row.textDigest, reviewedAt: "2026-09-11T10:00:00.000Z",
});

test("T6L-6J deterministic tranche membership", async () => {
  const rows = await staged(); assert.deepEqual(selectMhsReviewTranche(rows).map((row) => row.sourceRowId), selectMhsReviewTranche(rows).map((row) => row.sourceRowId));
});

test("T6L-6J selects exactly 3,000 unique content rows", async () => {
  const rows = await tranche(); assert.equal(rows.length, MHS_REVIEW_TRANCHE_SIZE); assert.equal(new Set(rows.map((row) => row.commentId)).size, 3000);
});

test("T6L-6J preserves every frozen allocation", async () => {
  const rows = await tranche(); Object.entries(MHS_REVIEW_ALLOCATION).forEach(([allocation, quota]) => assert.equal(rows.filter((row) => row.allocation === allocation).length, quota));
});

test("T6L-6J frozen membership digest is unchanged", () => assert.equal(mhsReviewTrancheMembershipDigest(frozenParent), MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST));

test("T6L-6J Reviewer A alone satisfies the human-review-count requirement", () => {
  const resolved = submitTrancheReview(frozenParent[0], review(frozenParent[0], "ALLOW")); assert.equal(resolved.reviewerIndependenceStatus, "SOLE_REVIEWER_COMPLETE"); assert.ok(resolved.reviewA);
});

test("T6L-6J Reviewer B is not required", () => {
  const resolved = submitTrancheReview(frozenParent[0], review(frozenParent[0], "ALLOW")); assert.equal(resolved.finalDisposition, "RESOLVED"); assert.equal(resolved.reviewB, null);
});

test("T6L-6J no active workflow waits for Reviewer B", () => {
  const active = ["mhsReviewTranche.ts", "mhsReviewPilot.ts"].map((name) => fs.readFileSync(path.resolve(process.cwd(), "src", "research", "textModerationDataset", name), "utf8"))
    .concat(["prepareMhsReviewTranche.ts", "prepareMhsReviewPilot.ts"].map((name) => fs.readFileSync(path.resolve(process.cwd(), "src", "scripts", name), "utf8"))).join("\n");
  assert.ok(!active.includes("reviewerBCompleted") && !active.includes("sameJudgment")
    && !active.includes("!row.reviewA || !row.reviewB") && !active.includes("createMhsPilotReviewerCsv(pilot, \"B\")"));
});

test("T6L-6J single-review ALLOW remains ALLOW", () => {
  const resolved = submitTrancheReview(frozenParent[0], review(frozenParent[0], "ALLOW")); assert.equal(resolved.finalDecision, "ALLOW"); assert.equal(resolved.finalDisposition, "RESOLVED");
});

test("T6L-6J single-review BLOCK remains BLOCK with categories", () => {
  const resolved = submitTrancheReview(frozenParent[0], review(frozenParent[0], "BLOCK", "ABUSIVE_OR_HARASSING", ["PROFANITY"]));
  assert.equal(resolved.finalDecision, "BLOCK"); assert.equal(resolved.finalPrimaryCategory, "ABUSIVE_OR_HARASSING"); assert.deepEqual(resolved.finalSecondaryCategories, ["PROFANITY"]);
});

test("T6L-6J NEEDS_ADJUDICATION remains unresolved", () => {
  const unresolved = submitTrancheReview(frozenParent[0], review(frozenParent[0], "NEEDS_ADJUDICATION"));
  assert.equal(unresolved.finalDisposition, "ADJUDICATION_REQUIRED"); assert.equal(unresolved.finalDecision, null); assert.equal(unresolved.trainingEligible, false);
});

test("T6L-6J EXCLUDE remains excluded", () => {
  const excluded = submitTrancheReview(frozenParent[0], review(frozenParent[0], "EXCLUDE")); assert.equal(excluded.finalDisposition, "EXCLUDED"); assert.equal(excluded.trainingEligible, false);
});

test("T6L-6J PII disposition remains independent", () => {
  const resolved = submitTrancheReview(frozenParent[0], review(frozenParent[0], "ALLOW")); assert.equal(resolved.piiStatus, "REQUIRES_REVIEW"); assert.equal(resolved.trainingEligible, false);
  const cleared = applyPiiDisposition(resolved, "NONE"); assert.equal(cleared.piiStatus, "NONE"); assert.equal(cleared.finalDecision, "ALLOW"); assert.equal(cleared.trainingEligible, false);
  assert.equal(applyPiiDisposition(resolved, "EXCLUDE").finalDisposition, "EXCLUDED");
});

test("T6L-6J single-review completion creates no training eligibility", () => {
  const allowBase = applyPiiDisposition(frozenParent[0], "NONE"); const blockBase = applyPiiDisposition(frozenParent[1], "NONE");
  const allow = submitTrancheReview(allowBase, review(allowBase, "ALLOW")); const block = submitTrancheReview(blockBase, review(blockBase, "BLOCK", "HATE"));
  assert.equal(allow.trainingEligible, false); assert.equal(block.trainingEligible, false); assert.throws(() => toPublicReviewedCandidate(allow));
});

test("T6L-6J immutable review and text binding remain enforced", () => {
  const first = submitTrancheReview(frozenParent[0], review(frozenParent[0], "ALLOW")); assert.throws(() => submitTrancheReview(first, review(frozenParent[0], "ALLOW")), /already occupied/);
  assert.throws(() => submitTrancheReview(frozenParent[0], { ...review(frozenParent[0], "ALLOW"), reviewedTextDigest: "altered" }), /final text/);
});

test("T6L-6J no second-review artifact is synthesized", () => {
  const resolved = submitTrancheReview(frozenParent[0], review(frozenParent[0], "ALLOW")); assert.equal(resolved.reviewB, null);
  assert.deepEqual(fs.readdirSync(path.dirname(artifactPath)).filter((name) => name.includes("validated")), [path.basename(artifactPath)]);
});

test("T6L-6J adjudication remains deferred to a separately authorized phase", () => {
  const unresolved = submitTrancheReview(frozenParent[0], review(frozenParent[0], "NEEDS_ADJUDICATION"));
  const proposed = { adjudicatorId: "not-authorized", finalDecision: "ALLOW", finalPrimaryCategory: null, finalSecondaryCategories: [],
    adjudicationReasonCode: "INSUFFICIENT_CONTEXT", adjudicationNotes: null, reviewedTextDigest: unresolved.textDigest, adjudicatedAt: "2026-09-11T11:00:00.000Z" } as TrancheAdjudication;
  assert.throws(() => submitTrancheAdjudication(unresolved, proposed), /separately authorized/);
});

test("T6L-6J redaction remains lineage-bound and pre-review", () => {
  const redacted = applyTrancheRedaction(frozenParent[0], "[REDACTED] final review text", "Remove personal identifier", "2026-09-11T09:00:00.000Z");
  assert.equal(redacted.piiStatus, "REDACTED"); assert.throws(() => submitTrancheReview(redacted, review(frozenParent[0], "ALLOW")), /final text/);
  const reviewed = submitTrancheReview(redacted, review(redacted, "ALLOW")); assert.doesNotThrow(() => validateMhsReviewTrancheRow(reviewed));
});

test("T6L-6J policy migration leaves frozen parent unchanged", () => {
  const before = fileDigest(parentPath); submitTrancheReview(frozenParent[0], review(frozenParent[0], "ALLOW")); assert.equal(fileDigest(parentPath), before);
});

test("T6L-6J policy migration leaves candidate output unchanged", () => {
  const before = fileDigest(candidatePath); submitTrancheReview(frozenParent[0], review(frozenParent[0], "ALLOW")); assert.equal(fileDigest(candidatePath), before); assert.equal(fs.statSync(candidatePath).size, 0);
});

test("T6L-6J current policy version is explicit", () => assert.equal(MHS_REVIEW_AUTHORITY_POLICY_VERSION, "STHN_TEXT_MODERATION_MHS_SINGLE_REVIEW_AUTHORITY_V1"));

test("T6L-6J implementation has no frozen benchmark imports", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src", "research", "textModerationDataset", "mhsReviewTranche.ts"), "utf8"); assert.ok(!source.includes("textModerationEvaluation") && !source.includes("fixtures/text-moderation"));
});
