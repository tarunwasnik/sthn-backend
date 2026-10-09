import assert from "node:assert/strict";
import test from "node:test";
import { ProvenanceStagingRow } from "../../research/textModerationDataset/contracts";
import { PUBLIC_MAPPING_VERSION, PublicMappingRule, previewMappings, publicMappingRulesV1, validateMappingRules } from "../../research/textModerationDataset/mapping";
import { stageHatemoji } from "../../research/textModerationDataset/staging";
import { HATEMOJI_COLUMNS } from "../../research/textModerationDataset/validators";

const hatemoji = (type: string, label = "1"): ProvenanceStagingRow => stageHatemoji([Object.fromEntries(HATEMOJI_COLUMNS.map((key) => [key, ({ entry_id: "1", text: "sample", type, target: "['wom']", "round.base": "1", "round.set": "1", set: "1", split: "train", label_gold: label, matched_text: "", matched_id: "2" } as Record<string, string>)[key] ?? ""]))], "train", "2026-09-08T00:00:00.000Z")[0];

test("mapping registry is valid", () => assert.doesNotThrow(() => validateMappingRules(publicMappingRulesV1)));
test("duplicate rule IDs fail closed", () => assert.throws(() => validateMappingRules([...publicMappingRulesV1, publicMappingRulesV1[0]]), /Duplicate/));
test("unknown source fails closed", () => { const changed = { ...publicMappingRulesV1[0], sourceId: "UNKNOWN" } as unknown as PublicMappingRule; assert.throws(() => validateMappingRules([changed, ...publicMappingRulesV1.slice(1)])); });
test("unsupported categories fail closed including OTHER_INAPPROPRIATE", () => { const changed = { ...publicMappingRulesV1[0], mappedPrimaryCategory: "OTHER_INAPPROPRIATE" } as PublicMappingRule; assert.throws(() => validateMappingRules([changed, ...publicMappingRulesV1.slice(1)]), /unsupported category/); });
test("diagnostic source is rejected", () => { const changed = { ...publicMappingRulesV1[0], sourceId: "MULTILINGUAL_HATECHECK" } as unknown as PublicMappingRule; assert.throws(() => validateMappingRules([changed, ...publicMappingRulesV1.slice(1)])); });
test("NEEDS_REVIEW is preserved", () => { const result = previewMappings([hatemoji("derogation")], publicMappingRulesV1); assert.equal(result[0].wouldNeedReview, 1); assert.equal(result[0].wouldBlock, 0); });
test("high-confidence Hatemoji threat maps only in preview", () => { const staged = hatemoji("threateninglanguage"); const snapshot = JSON.stringify(staged); const result = previewMappings([staged], publicMappingRulesV1); assert.equal(result[0].wouldBlock, 1); assert.equal(result[0].categoryCounts.HATE, 1); assert.equal(result[0].categoryCounts.THREAT_OR_VIOLENCE, 1); assert.equal(JSON.stringify(staged), snapshot); assert.equal(staged.decision, null); assert.equal(staged.mappingVersion, null); });
test("preview counts are deterministic", () => { const rows = [hatemoji("dehumanizinglanguage"), hatemoji("derogation", "0")]; assert.deepEqual(previewMappings(rows, publicMappingRulesV1), previewMappings(rows, publicMappingRulesV1)); assert.equal(previewMappings(rows, publicMappingRulesV1)[0].mappingVersion, PUBLIC_MAPPING_VERSION); });
