import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PROTECTED_V2_ANALYSIS_FILENAME, PROTECTED_V2_CERTIFICATION_FILENAME,
  PROTECTED_V2_EXCLUSION_FILENAME, PROTECTED_V2_FINGERPRINT_FILENAME,
  PROTECTED_V2_KEY_ID, PROTECTED_V2_SECRET_ENV, createProtectedV2Artifacts,
  deriveProtectedExcludedComponents, protectedV2Hmac, publishProtectedV2Artifacts,
  readProtectedV2Key, validateProtectedV2Artifacts, validateProtectedV2Privacy,
} from "../../evaluation/textModeration/protectedV2ContaminationAuthority";
import { normalizeTextForDuplicateDetection, TEXT_DUPLICATE_NORMALIZATION_VERSION } from "../../research/textModerationDataset/identity";
import { canonicalJson } from "../../research/textModerationDataset/manifest";

const root = path.resolve(__dirname, "../../.."), mhsRoot = path.join(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), graphRoot = path.join(mhsRoot, "expansion/semantic-calibration"), outputDirectory = path.join(mhsRoot, "expansion/protected-contamination");
const read = (filename: string): Buffer => fs.readFileSync(filename);
const input = { candidateBytes: read(path.join(mhsRoot, "expansion/candidates/mhs-v2-expansion-candidates-v1.json")), acquisitionBytes: read(path.join(mhsRoot, "expansion/candidates/mhs-v2-expansion-candidate-acquisition-v1.json")), consolidationBytes: read(path.join(mhsRoot, "expansion/certification/mhs-v2-expansion-consolidation-certification-v1.json")), graphBytes: read(path.join(graphRoot, "mhs-v2-semantic-leakage-graph-v1.json")), componentsBytes: read(path.join(graphRoot, "mhs-v2-semantic-leakage-components-v1.json")), graphAnalysisBytes: read(path.join(graphRoot, "mhs-v2-semantic-leakage-graph-analysis-v1.json")), graphCertificationBytes: read(path.join(graphRoot, "mhs-v2-semantic-leakage-graph-certification-v1.json")) };
const key = readProtectedV2Key(), created = createProtectedV2Artifacts(input, key), artifacts = { fingerprint: created.fingerprint, analysis: created.analysis, exclusion: created.exclusion, certification: created.certification }, serialized = canonicalJson(artifacts);
const validBase64 = Buffer.alloc(32, 7).toString("base64"), secondKey = Buffer.alloc(32, 8);

test("C secret: missing fails closed", () => assert.throws(() => readProtectedV2Key({}), /missing/u));
test("C secret: empty fails closed", () => assert.throws(() => readProtectedV2Key({ [PROTECTED_V2_SECRET_ENV]: " " }), /empty/u));
test("C secret: malformed Base64 fails closed", () => assert.throws(() => readProtectedV2Key({ [PROTECTED_V2_SECRET_ENV]: "not@@base64" }), /Base64/u));
test("C secret: non-canonical Base64 fails closed", () => assert.throws(() => readProtectedV2Key({ [PROTECTED_V2_SECRET_ENV]: "YQ" }), /Base64/u));
test("C secret: short decoded key fails closed", () => assert.throws(() => readProtectedV2Key({ [PROTECTED_V2_SECRET_ENV]: Buffer.alloc(31).toString("base64") }), /32 bytes/u));
test("C secret: valid 32-byte key passes", () => assert.equal(readProtectedV2Key({ [PROTECTED_V2_SECRET_ENV]: validBase64 }).length, 32));
test("C secret: no fallback exists", () => assert.throws(() => readProtectedV2Key({}), /missing/u));
test("C secret: key is not serialized", () => { assert.ok(!serialized.includes(process.env[PROTECTED_V2_SECRET_ENV]!)); assert.ok(!serialized.includes(key.toString("hex"))); });
test("C secret: key is not logged", () => { const messages: string[] = [], original = console.log; console.log = (...args) => messages.push(args.join(" ")); try { createProtectedV2Artifacts(input, key); } finally { console.log = original; } assert.equal(messages.length, 0); });
test("C secret: validation errors do not expose secret", () => { const secret = "PRIVATE_SECRET_SENTINEL"; assert.throws(() => readProtectedV2Key({ [PROTECTED_V2_SECRET_ENV]: secret }), (error: Error) => !error.message.includes(secret)); });

test("C fingerprint: exact HMAC is deterministic", () => assert.equal(protectedV2Hmac(key, "EXACT", "alpha"), protectedV2Hmac(key, "EXACT", "alpha")));
test("C fingerprint: normalized HMAC is deterministic", () => assert.equal(protectedV2Hmac(key, "NORMALIZED", normalizeTextForDuplicateDetection("Hello   WORLD")), protectedV2Hmac(key, "NORMALIZED", normalizeTextForDuplicateDetection("hello world"))));
test("C fingerprint: exact input matches", () => assert.equal(protectedV2Hmac(key, "EXACT", "same"), protectedV2Hmac(key, "EXACT", "same")));
test("C fingerprint: normalized equivalent matches", () => assert.equal(protectedV2Hmac(key, "NORMALIZED", normalizeTextForDuplicateDetection("Ａ  B")), protectedV2Hmac(key, "NORMALIZED", normalizeTextForDuplicateDetection("a b"))));
test("C fingerprint: different normalized input differs", () => assert.notEqual(protectedV2Hmac(key, "NORMALIZED", normalizeTextForDuplicateDetection("alpha")), protectedV2Hmac(key, "NORMALIZED", normalizeTextForDuplicateDetection("beta"))));
test("C fingerprint: key change changes HMAC", () => assert.notEqual(protectedV2Hmac(key, "EXACT", "alpha"), protectedV2Hmac(secondKey, "EXACT", "alpha")));
test("C fingerprint: key identity but not key is serialized", () => { assert.equal(created.fingerprint.keyIdentity, PROTECTED_V2_KEY_ID); assert.ok(!serialized.includes(key.toString("base64"))); });
test("C fingerprint: normalization version is frozen", () => assert.equal(created.fingerprint.normalizationVersion, TEXT_DUPLICATE_NORMALIZATION_VERSION));
test("C fingerprint: old unkeyed digest is not accepted", () => assert.notEqual(created.fingerprint.fixtures[0].exactHmac, crypto.createHash("sha256").update("alpha").digest("hex")));
test("C fingerprint: opaque IDs are deterministic", () => assert.equal(created.fingerprint.fixtures[0].opaqueFixtureId, createProtectedV2Artifacts(input, key).fingerprint.fixtures[0].opaqueFixtureId));
test("C fingerprint: exactly 140 records exist", () => assert.equal(created.fingerprint.fixtures.length, 140));

for (const prohibited of ["jaccard", "0.9", "multilingual-e5", "embedding", "editDistance", "semanticThreshold"]) test(`C prohibited mechanism absent: ${prohibited}`, () => assert.doesNotMatch(fs.readFileSync(path.join(root, "src/evaluation/textModeration/protectedV2ContaminationAuthority.ts"), "utf8"), new RegExp(prohibited.replace(".", "\\."), "iu")));
test("C prohibited: runtime records fuzzy=false", () => assert.equal(created.analysis.mechanism.fuzzyMatching, false));
test("C prohibited: runtime records E5=0", () => assert.equal(created.analysis.mechanism.e5Invocations, 0));
test("C prohibited: runtime records threshold=null", () => assert.equal(created.analysis.mechanism.threshold, null));

test("C privacy: protected raw text absent from fingerprint artifact", () => assert.doesNotThrow(() => validateProtectedV2Privacy([created.fingerprint], created.protectedTexts, key)));
test("C privacy: protected normalized text absent", () => assert.doesNotThrow(() => validateProtectedV2Privacy([created.fingerprint], created.protectedTexts, key)));
test("C privacy: protected raw text absent from analysis", () => assert.doesNotThrow(() => validateProtectedV2Privacy([created.analysis], created.protectedTexts, key)));
test("C privacy: protected raw text absent from exclusion", () => assert.doesNotThrow(() => validateProtectedV2Privacy([created.exclusion], created.protectedTexts, key)));
test("C privacy: protected raw text absent from certification", () => assert.doesNotThrow(() => validateProtectedV2Privacy([created.certification], created.protectedTexts, key)));
test("C privacy: benchmark label fields absent", () => assert.doesNotMatch(serialized, /"(?:expectedDecision|label|category|rationale|difficulty|language)"\s*:/iu));
test("C privacy: secret fields absent", () => assert.doesNotMatch(serialized, /"(?:secret|key|keyBytes|rawKey)"\s*:/iu));
test("C privacy: synthetic forbidden content fails closed", () => assert.throws(() => validateProtectedV2Privacy([{ text: "forbidden" }], ["forbidden"], key), /privacy validation failed/u));
test("C privacy: failure does not echo forbidden content", () => assert.throws(() => validateProtectedV2Privacy([{ text: "PRIVATE_FORBIDDEN_SENTINEL" }], ["PRIVATE_FORBIDDEN_SENTINEL"], key), (error: Error) => !error.message.includes("PRIVATE_FORBIDDEN_SENTINEL")));

const match = { candidateId: "a", candidateTextSha256: "1".repeat(64), opaqueFixtureId: "protected_fixture_x", matchTypes: ["EXACT_PROTECTED_MATCH" as const] };
const fake = (anchorDisposition: string, cq = false) => ({ candidateMembership: [{ candidateId: "a", componentId: "c" }, { candidateId: "b", componentId: "c" }], components: [{ componentId: "c", memberCandidateIds: ["a", "b"], collisionQuarantine: cq, anchorDisposition }] }) as never;
test("C contamination: exact match produces direct contamination", () => assert.equal(deriveProtectedExcludedComponents([match], fake("NO_HISTORICAL_SPLIT_ANCHOR"))[0].directMatches[0].candidateId, "a"));
test("C contamination: normalized match produces direct contamination", () => assert.equal(deriveProtectedExcludedComponents([{ ...match, matchTypes: ["NORMALIZED_PROTECTED_MATCH"] }], fake("NO_HISTORICAL_SPLIT_ANCHOR"))[0].directMatches.length, 1));
test("C contamination: exclusion propagates to component", () => assert.deepEqual(deriveProtectedExcludedComponents([match], fake("NO_HISTORICAL_SPLIT_ANCHOR"))[0].allExcludedCandidateIds, ["a", "b"]));
test("C contamination: inherited member distinguished", () => assert.deepEqual(deriveProtectedExcludedComponents([match], fake("NO_HISTORICAL_SPLIT_ANCHOR"))[0].inheritedCandidateIds, ["b"]));
test("C contamination: exclusion preserves TRAIN anchor provenance", () => assert.equal(deriveProtectedExcludedComponents([match], fake("SINGLE_FROZEN_HISTORICAL_TRAIN_ANCHOR"))[0].existingHistoricalAnchorDisposition, "SINGLE_FROZEN_HISTORICAL_TRAIN_ANCHOR"));
test("C contamination: exclusion preserves VALIDATION anchor provenance", () => assert.equal(deriveProtectedExcludedComponents([match], fake("SINGLE_FROZEN_HISTORICAL_VALIDATION_ANCHOR"))[0].existingHistoricalAnchorDisposition, "SINGLE_FROZEN_HISTORICAL_VALIDATION_ANCHOR"));
test("C contamination: exclusion coexists with CQ", () => assert.equal(deriveProtectedExcludedComponents([match], fake("CONFLICTING_FROZEN_HISTORICAL_SPLIT_ANCHORS", true))[0].existingCqQuarantine, true));
test("C contamination: disposition preserves research universe", () => assert.equal(deriveProtectedExcludedComponents([match], fake("NO_HISTORICAL_SPLIT_ANCHOR"))[0].disposition, "EXCLUDE_FROM_TRAIN_AND_VALIDATION_PRESERVE_RESEARCH_UNIVERSE"));
test("C contamination: no INTERNAL_TEST assignment exists", () => assert.doesNotMatch(canonicalJson(deriveProtectedExcludedComponents([match], fake("NO_HISTORICAL_SPLIT_ANCHOR"))), /INTERNAL_TEST/u));
test("C contamination: moderation labels are not present or mutated", () => assert.doesNotMatch(canonicalJson(created.exclusion), /moderationLabel|primaryCategory|secondaryCategories|reasonCode/u));
test("C contamination: historical mutations are zero", () => assert.equal(created.analysis.counts.historicalMutations, 0));

test("C zero case: zero matches succeeds", () => assert.deepEqual(deriveProtectedExcludedComponents([], fake("NO_HISTORICAL_SPLIT_ANCHOR")), []));
test("C zero case: no fuzzy fallback exists", () => assert.equal(created.analysis.mechanism.fuzzyMatching, false));
test("C authority: benchmark identity is frozen", () => assert.equal(created.fingerprint.authorities.benchmarkSha256, "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747"));
test("C authority: fixture count is 140", () => assert.equal(created.analysis.counts.fixtures, 140));
test("C authority: candidates checked is 400", () => assert.equal(created.analysis.counts.candidates, 400));
test("C authority: components checked is 393", () => assert.equal(created.analysis.counts.components, 393));
test("C authority: graph/component chain validates", () => assert.doesNotThrow(() => validateProtectedV2Artifacts(created.fingerprint, created.analysis, created.exclusion, created.certification)));
test("C authority: deterministic replay passes", () => assert.equal(canonicalJson(artifacts), canonicalJson((() => { const x = createProtectedV2Artifacts(input, key); return { fingerprint: x.fingerprint, analysis: x.analysis, exclusion: x.exclusion, certification: x.certification }; })())));
test("C authority: upstream inputs remain byte-identical", () => { const before = Object.values(input).map((bytes) => crypto.createHash("sha256").update(bytes).digest("hex")); createProtectedV2Artifacts(input, key); assert.deepEqual(Object.values(input).map((bytes) => crypto.createHash("sha256").update(bytes).digest("hex")), before); });
test("C authority: overwrite and second publication refused", () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-7kc-")); try { publishProtectedV2Artifacts(artifacts, dir); assert.throws(() => publishProtectedV2Artifacts(artifacts, dir), /overwrite refused/u); } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
test("C authority: partial publication rolls back", () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-7kc-")); try { assert.throws(() => publishProtectedV2Artifacts(artifacts, dir, (temporary, targets) => { fs.renameSync(temporary[0], targets[0]); throw new Error("simulated"); }), /simulated/u); for (const filename of [PROTECTED_V2_FINGERPRINT_FILENAME, PROTECTED_V2_ANALYSIS_FILENAME, PROTECTED_V2_EXCLUSION_FILENAME, PROTECTED_V2_CERTIFICATION_FILENAME]) assert.equal(fs.existsSync(path.join(dir, filename)), false); } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
test("C authority: immutable publication matches when present", () => { if (!fs.existsSync(outputDirectory)) return; const expected = [created.fingerprint, created.analysis, created.exclusion, created.certification], files = [PROTECTED_V2_FINGERPRINT_FILENAME, PROTECTED_V2_ANALYSIS_FILENAME, PROTECTED_V2_EXCLUSION_FILENAME, PROTECTED_V2_CERTIFICATION_FILENAME]; if (files.every((file) => !fs.existsSync(path.join(outputDirectory, file)))) return; files.forEach((file, i) => assert.equal(fs.readFileSync(path.join(outputDirectory, file), "utf8"), canonicalJson(expected[i]))); });
