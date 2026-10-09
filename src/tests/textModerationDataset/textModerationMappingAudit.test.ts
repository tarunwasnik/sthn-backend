import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { applyPublicMappingAuditReviewV1, PUBLIC_MAPPING_AUDIT_SAMPLE_DIGEST } from "../../research/textModerationDataset/auditReviewV1";
import { calculateAuditMetrics, calculateIdentitySensitivePrecision, calculateSourceTargetBreakdown, MappingAuditRow, PUBLIC_MAPPING_AUDIT_SEED, selectMappingAuditSample, validateAuditRow } from "../../research/textModerationDataset/audit";
import { ProvenanceStagingRow } from "../../research/textModerationDataset/contracts";
import { PUBLIC_MAPPING_VERSION, PUBLIC_MAPPING_VERSION_V1R, previewMappings, previewRowMapping, publicMappingRulesV1, publicMappingRulesV1R, validateMappingRules } from "../../research/textModerationDataset/mapping";
import { stageHatemoji } from "../../research/textModerationDataset/staging";
import { HATEMOJI_COLUMNS } from "../../research/textModerationDataset/validators";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation");
const staged = (): ProvenanceStagingRow[] => ["HATEMOJI_BUILD", "TOXIGEN_ANNOTATED"].flatMap((source) => fs.readFileSync(path.join(root, source, "provenance-staging.jsonl"), "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line) as ProvenanceStagingRow));
let cached: readonly MappingAuditRow[] | undefined;
const completed = (): readonly MappingAuditRow[] => cached ??= applyPublicMappingAuditReviewV1(selectMappingAuditSample(staged()));
const hatemoji = (type: string, target = "['wom']"): ProvenanceStagingRow => stageHatemoji([Object.fromEntries(HATEMOJI_COLUMNS.map((key) => [key, ({ entry_id: "audit-test", text: "sample", type, target, "round.base": "1", "round.set": "1", set: "1", split: "train", label_gold: "1", matched_text: "", matched_id: "2" } as Record<string, string>)[key] ?? ""]))], "train", "2026-09-08T00:00:00.000Z")[0];

test("T6L-6G deterministic stratified audit sampling", () => {
  const rows = staged(); const first = selectMappingAuditSample(rows); const second = selectMappingAuditSample([...rows].reverse());
  assert.equal(first.length, 480); assert.deepEqual(first.map((row) => row.auditId), second.map((row) => row.auditId)); assert.equal(first[0].auditSeed, PUBLIC_MAPPING_AUDIT_SEED);
});
test("T6L-6G sample contains 240 rows per acquired source and oversamples every V1 automatic rule", () => {
  const rows = completed(); assert.equal(rows.filter((row) => row.sourceId === "HATEMOJI_BUILD").length, 240); assert.equal(rows.filter((row) => row.sourceId === "TOXIGEN_ANNOTATED").length, 240);
  for (const ruleId of ["HATEMOJI_DEHUMANIZING_HATE_V1", "HATEMOJI_HATE_THREAT_V1", "TOXIGEN_STRONG_HATE_V1"]) assert.ok(rows.some((row) => row.previewRuleId === ruleId));
});
test("T6L-6G audit row schema uses bounded preview and complete provenance", () => completed().forEach((row) => { assert.ok(row.textPreview.length > 0 && row.textPreview.length <= 280); assert.ok(row.sourceRowId); assert.ok(row.auditId); validateAuditRow(row); }));
test("T6L-6G audit outcome validation fails closed", () => {
  const row = completed()[0]; assert.throws(() => validateAuditRow({ ...row, humanDecision: "ALLOW", humanPrimaryCategory: "HATE" }), /Non-BLOCK/); assert.throws(() => validateAuditRow({ ...row, humanDecision: "BLOCK", humanPrimaryCategory: null }), /lacks category/);
});
test("T6L-6G all recorded human outcomes and reason codes are bounded", () => {
  const outcomes = new Set(completed().map((row) => row.humanDecision)); assert.deepEqual([...outcomes].sort(), ["ALLOW", "BLOCK", "EXCLUDE", "NEEDS_ADJUDICATION"]);
  assert.ok(completed().every((row) => row.auditReasonCode !== null)); assert.equal(PUBLIC_MAPPING_AUDIT_SAMPLE_DIGEST.length, 64);
});
test("T6L-6G automatic BLOCK and category precision are calculated separately", () => {
  const metrics = calculateAuditMetrics(completed()); assert.equal(metrics.HATEMOJI_HATE_THREAT_V1.blockPrecision, 1); assert.equal(metrics.HATEMOJI_HATE_THREAT_V1.categoryPrecision, 0); assert.equal(metrics.TOXIGEN_STRONG_HATE_V1.falseBlock, 11); assert.ok((metrics.TOXIGEN_STRONG_HATE_V1.blockPrecision ?? 1) < 0.95);
});
test("T6L-6G reports identity-sensitive precision and source-target breakdowns", () => {
  const identity = calculateIdentitySensitivePrecision(completed()); const targets = calculateSourceTargetBreakdown(completed()); assert.ok(identity.HATEMOJI_BUILD); assert.ok(identity.TOXIGEN_ANNOTATED); assert.ok(Object.keys(targets).some((key) => key.startsWith("HATEMOJI_BUILD|"))); assert.ok(Object.values(targets).every((item) => item.sampled > 0));
});
test("T6L-6G category-collision review makes threat primary and HATE secondary", () => {
  const collisions = completed().filter((row) => row.auditReasonCode === "CATEGORY_COLLISION_MISMATCH"); assert.ok(collisions.length > 0); assert.ok(collisions.every((row) => row.humanPrimaryCategory === "THREAT_OR_VIOLENCE" && row.humanSecondaryCategories.includes("HATE")));
});
test("T6L-6G V1R corrects Hatemoji threat precedence", () => {
  const mapped = previewRowMapping(hatemoji("threateninglanguage"), publicMappingRulesV1R); assert.equal(mapped.mappedPrimaryCategory, "THREAT_OR_VIOLENCE"); assert.deepEqual(mapped.mappedSecondaryCategories, ["HATE"]);
});
test("T6L-6G V1R removes HATE from the non-protected working-class target", () => {
  const mapped = previewRowMapping(hatemoji("threateninglanguage", "['wc']"), publicMappingRulesV1R); assert.equal(mapped.mappedPrimaryCategory, "THREAT_OR_VIOLENCE"); assert.deepEqual(mapped.mappedSecondaryCategories, []);
  assert.equal(previewRowMapping(hatemoji("dehumanizinglanguage", "['wc']"), publicMappingRulesV1R).mappedDecision, "NEEDS_REVIEW");
});
test("T6L-6G preserves V1 and validates V1R as distinct authorities", () => {
  assert.doesNotThrow(() => validateMappingRules(publicMappingRulesV1)); assert.doesNotThrow(() => validateMappingRules(publicMappingRulesV1R)); assert.equal(publicMappingRulesV1[0].mappingVersion, PUBLIC_MAPPING_VERSION); assert.equal(publicMappingRulesV1R[0].mappingVersion, PUBLIC_MAPPING_VERSION_V1R); assert.throws(() => validateMappingRules([publicMappingRulesV1[0], ...publicMappingRulesV1R.slice(1)]), /version mismatch/);
});
test("T6L-6G demotes all ToxiGen V1R rows to NEEDS_REVIEW and creates no ALLOW rule", () => {
  assert.equal(publicMappingRulesV1R.filter((rule) => rule.sourceId === "TOXIGEN_ANNOTATED").length, 1); assert.equal(publicMappingRulesV1R.find((rule) => rule.sourceId === "TOXIGEN_ANNOTATED")?.mappedDecision, "NEEDS_REVIEW"); assert.ok(publicMappingRulesV1R.every((rule) => rule.mappedDecision !== "ALLOW"));
});
test("T6L-6G audit and V1R preview do not mutate canonical staging", () => {
  const rows = staged(); const snapshots = rows.slice(0, 8).map((row) => JSON.stringify(row)); selectMappingAuditSample(rows); previewMappings(rows.slice(0, 8), publicMappingRulesV1R); assert.deepEqual(rows.slice(0, 8).map((row) => JSON.stringify(row)), snapshots); assert.ok(rows.every((row) => row.decision === null && row.mappingVersion === null));
});
test("T6L-6G research implementation does not import or name frozen fixtures", () => {
  const files = ["audit.ts", "auditReviewV1.ts", "mapping.ts"].map((name) => fs.readFileSync(path.resolve(process.cwd(), "src", "research", "textModerationDataset", name), "utf8")); assert.ok(files.every((body) => !body.includes("STHN_TEXT_MODERATION_FIXTURES_V1R")));
});
test("T6L-6G failed Parquet compatibility attempt leaves no dependency or import", () => {
  const manifest = fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"); const lock = fs.readFileSync(path.resolve(process.cwd(), "package-lock.json"), "utf8"); assert.ok(!manifest.includes("@addmaple/parquet-lite") && !lock.includes("@addmaple/parquet-lite"));
  const research = fs.readdirSync(path.resolve(process.cwd(), "src", "research", "textModerationDataset")).filter((name) => name.endsWith(".ts")).map((name) => fs.readFileSync(path.resolve(process.cwd(), "src", "research", "textModerationDataset", name), "utf8")).join("\n"); assert.ok(!research.includes("@addmaple/parquet-lite"));
});
