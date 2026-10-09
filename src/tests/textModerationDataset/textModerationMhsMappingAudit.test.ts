import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import test from "node:test";
import { ProvenanceStagingRow } from "../../research/textModerationDataset/contracts";
import {
  MHS_AUDIT_STRATA, MHS_AUTOMATIC_RULE_CANDIDATES, MHS_DRAFT_MAPPING_VERSION, MHS_MAPPING_AUDIT_SIZE,
  MhsPolicyReview, assertAutomaticRuleEvidence, mhsAuditMembershipDigest, resolveMhsReviews,
  selectMhsMappingAuditSample,
} from "../../research/textModerationDataset/mhsMappingAudit";
import { MHS_MAPPING_AUDIT_SAMPLE_DIGEST, applyMhsMappingAuditReviewV1 } from "../../research/textModerationDataset/mhsMappingAuditReviewV1";
import { PUBLIC_MAPPING_VERSION_V1R2, publicMappingRules, publicMappingRulesV1R2 } from "../../research/textModerationDataset/mapping";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
let stagedPromise: Promise<readonly ProvenanceStagingRow[]> | null = null;
const staged = (): Promise<readonly ProvenanceStagingRow[]> => stagedPromise ??= (async () => {
  const rows: ProvenanceStagingRow[] = []; const reader = readline.createInterface({ input: fs.createReadStream(path.join(root, "provenance-staging.jsonl"), "utf8"), crlfDelay: Infinity });
  for await (const line of reader) if (line.trim()) rows.push(JSON.parse(line) as ProvenanceStagingRow); return rows;
})();
let samplePromise: Promise<ReturnType<typeof selectMhsMappingAuditSample>> | null = null;
const sample = (): Promise<ReturnType<typeof selectMhsMappingAuditSample>> => samplePromise ??= staged().then((rows) => selectMhsMappingAuditSample(rows));

test("T6L-6I deterministically samples exactly 300 content rows", async () => {
  const rows = await staged(); const first = selectMhsMappingAuditSample(rows); const second = selectMhsMappingAuditSample(rows);
  assert.equal(first.length, MHS_MAPPING_AUDIT_SIZE); assert.deepEqual(first.map((row) => row.auditId), second.map((row) => row.auditId));
});

test("T6L-6I comment and source-row identities are unique", async () => {
  const rows = await sample(); assert.equal(new Set(rows.map((row) => row.commentId)).size, 300); assert.equal(new Set(rows.map((row) => row.sourceRowId)).size, 300);
});

test("T6L-6I samples grouped comments, never annotation rows", async () => {
  const rows = await sample(); assert.ok(rows.every((row) => row.sourceId === "MEASURING_HATE_SPEECH" && row.sourceSummary.annotationCount >= 1));
  assert.ok(rows.some((row) => row.sourceSummary.annotationCount > 1)); assert.equal((await staged()).length, 39565);
});

test("T6L-6I membership is digest-bound", async () => assert.equal(mhsAuditMembershipDigest(await sample()), MHS_MAPPING_AUDIT_SAMPLE_DIGEST));

test("T6L-6I covers positive, negative, and middle score strata", async () => {
  const rows = await sample(); ["HIGH_SCORE", "LOW_SCORE", "MIDDLE_SCORE"].forEach((stratum, index) => assert.ok(rows.slice(index * 20, index * 20 + 20).every((row) => row.selectionStrata.includes(stratum as never))));
});

test("T6L-6I covers genuine high agreement and disagreement", async () => {
  const rows = await sample(); assert.ok(rows.slice(60, 80).every((row) => row.sourceSummary.annotationCount >= 2 && row.sourceSummary.disagreement.band === "LOW"));
  assert.ok(rows.slice(80, 100).every((row) => row.sourceSummary.disagreement.band === "HIGH"));
});

test("T6L-6I covers all required construct strata", async () => {
  const rows = await sample(); ["DEHUMANIZATION", "INSULT_OR_HUMILIATION", "VIOLENCE", "GENOCIDE", "ATTACK_OR_DEFEND"].forEach((stratum) => assert.ok(rows.filter((row) => row.selectionStrata.includes(stratum as never)).length >= 20));
});

test("T6L-6I covers protected and no-clear-protected targets", async () => {
  const rows = await sample(); assert.ok(rows.slice(200, 220).every((row) => row.sourceSummary.target.hasClearProtectedTarget)); assert.ok(rows.slice(220, 240).every((row) => !row.sourceSummary.target.hasClearProtectedTarget));
});

test("T6L-6I covers counterspeech/supportive context with reviewed allows", async () => {
  const reviewed = applyMhsMappingAuditReviewV1(await sample()); const contextual = reviewed.filter((row) => row.selectionStrata.includes("CONTEXT_CANDIDATE"));
  assert.ok(contextual.length >= 20); assert.ok(contextual.some((row) => row.humanDecision === "ALLOW" && row.auditReasonCode === "COUNTERSPEECH_OR_REPORTING"));
});

const policyReview = (reviewerId: string, decision: "ALLOW" | "BLOCK"): MhsPolicyReview => ({ reviewerId, decision, categories: decision === "BLOCK" ? ["HATE"] : [], reasonCode: "SOURCE_MEASUREMENT_MATCHES_STHN", notes: null });

test("T6L-6I rejects single-review automatic-rule evidence", async () => {
  const row = resolveMhsReviews((await sample())[0], [policyReview("one", "BLOCK")]); assert.throws(() => assertAutomaticRuleEvidence([row]), /two independent/);
});

test("T6L-6I routes two-review disagreement to adjudication", async () => {
  const row = (await sample())[0]; const reviews = [policyReview("one", "BLOCK"), policyReview("two", "ALLOW")]; const unresolved = resolveMhsReviews(row, reviews);
  assert.equal(unresolved.reviewStatus, "NEEDS_ADJUDICATION"); assert.equal(unresolved.humanDecision, null);
  const resolved = resolveMhsReviews(row, reviews, policyReview("adjudicator", "BLOCK")); assert.equal(resolved.reviewStatus, "ADJUDICATED"); assert.doesNotThrow(() => assertAutomaticRuleEvidence([resolved]));
});

test("T6L-6I creates no automatic rule from insufficient support", () => assert.deepEqual(MHS_AUTOMATIC_RULE_CANDIDATES, []));

test("T6L-6I sampling and review never mutate canonical staging", async () => {
  const rows = await staged(); const before = rows.slice(0, 25).map((row) => JSON.stringify(row)); applyMhsMappingAuditReviewV1(await sample());
  assert.deepEqual(rows.slice(0, 25).map((row) => JSON.stringify(row)), before); assert.ok(rows.every((row) => row.decision === null && row.primaryCategory === null && row.mappingVersion === null && row.split === "UNASSIGNED"));
});

test("T6L-6I preserves V1R2 historical and current authority", () => {
  assert.equal(publicMappingRules, publicMappingRulesV1R2); assert.ok(publicMappingRulesV1R2.every((rule) => rule.mappingVersion === PUBLIC_MAPPING_VERSION_V1R2 && rule.mappedDecision === "NEEDS_REVIEW"));
});

test("T6L-6I does not create or promote a draft mapping version", () => assert.equal(MHS_DRAFT_MAPPING_VERSION, null));

test("T6L-6I isolated implementation has no frozen benchmark import", () => {
  const files = ["mhsMappingAudit.ts", "mhsMappingAuditReviewV1.ts"].map((name) => fs.readFileSync(path.resolve(process.cwd(), "src", "research", "textModerationDataset", name), "utf8"));
  files.push(fs.readFileSync(path.resolve(process.cwd(), "src", "scripts", "createMhsMappingAudit.ts"), "utf8"));
  assert.ok(files.every((source) => !source.includes("textModerationEvaluation") && !source.includes("fixtures/text-moderation")));
});

test("T6L-6I audit omits annotator demographics and unsupported OTHER_INAPPROPRIATE", async () => {
  const reviewed = applyMhsMappingAuditReviewV1(await sample()); const serialized = JSON.stringify(reviewed);
  assert.ok(!serialized.includes("annotator_id") && !serialized.includes("annotator_")); assert.ok(reviewed.every((row) => row.humanPrimaryCategory !== "OTHER_INAPPROPRIATE" && !row.humanSecondaryCategories.includes("OTHER_INAPPROPRIATE")));
  assert.deepEqual(MHS_AUDIT_STRATA.length, 15);
});
