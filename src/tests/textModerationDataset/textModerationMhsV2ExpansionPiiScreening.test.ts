import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalJson } from "../../research/textModerationDataset/manifest";
import { MHS_CANDIDATE_ARTIFACT_SHA256 } from "../../research/textModerationDataset/mhsCandidateIntegrityAudit";
import { MHS_SPLIT_MANIFEST_SHA256 } from "../../research/textModerationDataset/mhsInternalTestFreeze";
import { MHS_INTERNAL_TEST_FREEZE_SHA256 } from "../../research/textModerationDataset/mhsTrainingEligibilityReleasePlan";
import { MHS_V2_EXPANSION_ACQUISITION_SHA256, MHS_V2_EXPANSION_CANDIDATE_SHA256, MhsV2ExpansionAcquisitionArtifact, MhsV2ExpansionCandidateArtifact } from "../../research/textModerationDataset/mhsV2ExpansionCandidateAcquisition";
import {
  MHS_V2_EXPANSION_PII_DISPOSITION_FILENAME, MHS_V2_EXPANSION_PII_DISPOSITION_PAYLOAD_DIGEST,
  MHS_V2_EXPANSION_PII_DISPOSITION_SCHEMA, MHS_V2_EXPANSION_PII_DISPOSITION_SHA256,
  MHS_V2_EXPANSION_PII_DISPOSITION_VERSION, MHS_V2_EXPANSION_PII_SCREENING_FILENAME,
  MHS_V2_EXPANSION_PII_SCREENING_PAYLOAD_DIGEST, MHS_V2_EXPANSION_PII_SCREENING_SCHEMA,
  MHS_V2_EXPANSION_PII_SCREENING_SHA256, MHS_V2_EXPANSION_PII_SCREENING_VERSION,
  MhsV2PiiDispositionArtifact, MhsV2PiiScreeningArtifact, publishMhsV2PiiPair,
  screenMhsV2CandidateText, screenMhsV2ExpansionCandidates, validateMhsV2PiiArtifacts,
} from "../../research/textModerationDataset/mhsV2ExpansionPiiScreening";
import { screenSyntheticTextUnderPiiPolicy, TEXT_MODERATION_PII_DETECTOR_VERSION, TEXT_MODERATION_PII_POLICY_SHA256, TextModerationPiiPolicyArtifact } from "../../research/textModerationDataset/textModerationPiiPolicy";

const root = process.cwd(), mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), pii = path.join(mhs, "expansion/pii");
const candidatePath = path.join(mhs, "expansion/candidates/mhs-v2-expansion-candidates-v1.json"), acquisitionPath = path.join(mhs, "expansion/candidates/mhs-v2-expansion-candidate-acquisition-v1.json"), policyPath = path.resolve(root, "dataset-research/text-moderation/policy/sthn-text-moderation-pii-policy-v1.json");
const screeningPath = path.join(pii, MHS_V2_EXPANSION_PII_SCREENING_FILENAME), dispositionPath = path.join(pii, MHS_V2_EXPANSION_PII_DISPOSITION_FILENAME);
const candidateBytes = fs.readFileSync(candidatePath), acquisitionBytes = fs.readFileSync(acquisitionPath), screeningBytes = fs.readFileSync(screeningPath), dispositionBytes = fs.readFileSync(dispositionPath);
const candidate = JSON.parse(candidateBytes.toString("utf8")) as MhsV2ExpansionCandidateArtifact, acquisition = JSON.parse(acquisitionBytes.toString("utf8")) as MhsV2ExpansionAcquisitionArtifact, policy = JSON.parse(fs.readFileSync(policyPath, "utf8")) as TextModerationPiiPolicyArtifact, screening = JSON.parse(screeningBytes.toString("utf8")) as MhsV2PiiScreeningArtifact, disposition = JSON.parse(dispositionBytes.toString("utf8")) as MhsV2PiiDispositionArtifact;
const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const synthetic = (text: string) => screenMhsV2CandidateText("synthetic", text, sha(text));
const keys = (value: unknown): string[] => value && typeof value === "object" ? Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => [key, ...keys(nested)]) : [];

test("01 policy SHA exact", () => assert.equal(sha(fs.readFileSync(policyPath)), TEXT_MODERATION_PII_POLICY_SHA256));
test("02 candidate SHA exact", () => assert.equal(sha(candidateBytes), MHS_V2_EXPANSION_CANDIDATE_SHA256));
test("03 acquisition manifest SHA exact", () => assert.equal(sha(acquisitionBytes), MHS_V2_EXPANSION_ACQUISITION_SHA256));
test("04 candidate count 400", () => assert.equal(candidate.rows.length, 400));
test("05 each candidate screened once", () => assert.deepEqual([screening.rows.length, new Set(screening.rows.map((row) => row.candidateId)).size], [400, 400]));
test("06 exact text digest bound", () => { const byId = new Map(candidate.rows.map((row) => [row.candidateId, row.exactTextDigest])); assert.equal(screening.rows.every((row) => byId.get(row.candidateId) === row.textSha256), true); });
test("07 detector version exact", () => assert.equal(screening.rows.every((row) => row.detectorVersion === TEXT_MODERATION_PII_DETECTOR_VERSION), true));
test("08 email detection deterministic", () => assert.deepEqual(synthetic("email test@example.com").findingClasses, ["EMAIL_PATTERN"]));
test("09 strong phone detection deterministic", () => assert.deepEqual(synthetic("phone +1 202-555-0100").findingClasses, ["PHONE_PATTERN_STRONG"]));
test("10 IPv4 octets validated", () => assert.deepEqual(synthetic("host 192.168.1.20").findingClasses, ["IPV4_PATTERN_VALID"]));
test("11 invalid dotted number not IPv4", () => assert.equal(synthetic("host 999.999.999.999").findingClasses.includes("IPV4_PATTERN_VALID"), false));
test("12 ambiguous number deterministic", () => assert.deepEqual(synthetic("reference 123456789").findingClasses, ["AMBIGUOUS_NUMERIC_PATTERN"]));
test("13 ordinary year protected", () => assert.deepEqual(synthetic("year 2026").findingClasses, []));
test("14 ordinary short number protected", () => assert.deepEqual(synthetic("score 42").findingClasses, []));
test("15 zero finding becomes NONE", () => assert.deepEqual([synthetic("ordinary public text").piiStatus, synthetic("ordinary public text").disposition], ["NONE", "ELIGIBLE_FOR_REVIEW"]));
test("16 supported positive requires review", () => assert.deepEqual([synthetic("test@example.com").piiStatus, synthetic("test@example.com").disposition], ["REQUIRES_REVIEW", "REQUIRES_PII_REVIEW"]));
test("17 supported positive cannot become NONE", () => assert.notEqual(synthetic("192.168.1.20").piiStatus, "NONE"));
test("18 automatic EXCLUDE impossible", () => assert.equal(screening.rows.some((row) => (row.piiStatus as string) === "EXCLUDE"), false));
test("19 automatic REDACTED impossible", () => assert.equal(screening.rows.some((row) => (row.piiStatus as string) === "REDACTED"), false));
test("20 finding order deterministic", () => assert.deepEqual(synthetic("test@example.com +1 202-555-0100 192.168.1.20 123456789").findingClasses, ["EMAIL_PATTERN", "PHONE_PATTERN_STRONG", "IPV4_PATTERN_VALID", "AMBIGUOUS_NUMERIC_PATTERN"]));
test("21 multiple findings deterministic", () => { const value = synthetic("test@example.com and 192.168.1.20"); assert.deepEqual([value.findingCount, value.findingClasses], [2, ["EMAIL_PATTERN", "IPV4_PATTERN_VALID"]]); });
test("22 source measurements do not affect result", () => assert.deepEqual(screenSyntheticTextUnderPiiPolicy("same exact text"), screenSyntheticTextUnderPiiPolicy("same exact text")));
test("23 proposal stratum does not affect result", () => { const row = synthetic("same exact text"); assert.equal(Object.prototype.hasOwnProperty.call(row, "selectionStratum"), false); });
test("24 raw sensitive values absent", () => { const forbidden = /^(text|rawMatch|email|phone|ip|ambiguousNumber)$/i; assert.equal([...keys(screening), ...keys(disposition)].some((key) => forbidden.test(key)), false); });
test("25 screening records 400", () => assert.equal(screening.statistics.candidateCount, 400));
test("26 disposition records 400", () => assert.equal(disposition.rows.length, 400));
test("27 status counts sum 400", () => assert.equal(disposition.piiStatusCounts.NONE + disposition.piiStatusCounts.REDACTED + disposition.piiStatusCounts.REQUIRES_REVIEW + disposition.piiStatusCounts.EXCLUDE, 400));
test("28 disposition counts sum 400", () => assert.equal(disposition.reviewDispositionCounts.ELIGIBLE_FOR_REVIEW + disposition.reviewDispositionCounts.REQUIRES_PII_REVIEW + disposition.reviewDispositionCounts.EXCLUDED, 400));
test("29 eligible rows have NONE", () => assert.equal(disposition.rows.filter((row) => row.reviewDisposition === "ELIGIBLE_FOR_REVIEW").every((row) => row.piiStatus === "NONE"), true));
test("30 unresolved rows require review", () => assert.equal(disposition.rows.filter((row) => row.reviewDisposition === "REQUIRES_PII_REVIEW").every((row) => row.piiStatus === "REQUIRES_REVIEW"), true));
test("31 unresolved cannot enter moderation", () => assert.deepEqual([disposition.reviewDispositionCounts.REQUIRES_PII_REVIEW, disposition.partialReviewArchitecture.fullTranchePiiResolutionRequired], [3, true]));
test("32 candidate byte-identical", () => assert.equal(sha(fs.readFileSync(candidatePath)), MHS_V2_EXPANSION_CANDIDATE_SHA256));
test("33 V1 candidate byte-identical", () => assert.equal(sha(fs.readFileSync(path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1.json"))), MHS_CANDIDATE_ARTIFACT_SHA256));
test("34 TRAIN unchanged", () => { const split = JSON.parse(fs.readFileSync(path.join(mhs, "splits/mhs-split-manifest-v1.json"), "utf8")) as { candidateMembershipIndex: { split: string }[] }; assert.equal(split.candidateMembershipIndex.filter((row) => row.split === "TRAIN").length, 60); });
test("35 VALIDATION unchanged", () => { const split = JSON.parse(fs.readFileSync(path.join(mhs, "splits/mhs-split-manifest-v1.json"), "utf8")) as { candidateMembershipIndex: { split: string }[] }; assert.equal(split.candidateMembershipIndex.filter((row) => row.split === "VALIDATION").length, 13); });
test("36 INTERNAL_TEST unchanged", () => assert.equal(sha(fs.readFileSync(path.join(mhs, "splits/mhs-split-manifest-v1.json"))), MHS_SPLIT_MANIFEST_SHA256));
test("37 INTERNAL_TEST content not accessed", () => assert.equal(screening.protections.internalTestAccessed, false));
test("38 frozen 140 not accessed", () => assert.equal(screening.protections.frozen140Accessed, false));
test("39 no moderation labels", () => assert.deepEqual([screening.protections.moderationLabelsGenerated, disposition.protections.moderationLabelsGenerated], [0, 0]));
test("40 no semantic E5", () => assert.equal(disposition.protections.semanticWorkPerformed, false));
test("41 no model inference", () => assert.equal(disposition.protections.modelInferencePerformed, false));
test("42 no training", () => assert.equal(disposition.protections.trainingPerformed, false));
test("43 screening canonical", () => { assert.deepEqual([screening.schemaVersion, screening.screeningVersion, sha(screeningBytes), screening.screeningPayloadDigest], [MHS_V2_EXPANSION_PII_SCREENING_SCHEMA, MHS_V2_EXPANSION_PII_SCREENING_VERSION, MHS_V2_EXPANSION_PII_SCREENING_SHA256, MHS_V2_EXPANSION_PII_SCREENING_PAYLOAD_DIGEST]); assert.equal(screeningBytes.toString("utf8"), canonicalJson(screening)); });
test("44 disposition canonical", () => { assert.deepEqual([disposition.schemaVersion, disposition.dispositionVersion, sha(dispositionBytes), disposition.dispositionPayloadDigest], [MHS_V2_EXPANSION_PII_DISPOSITION_SCHEMA, MHS_V2_EXPANSION_PII_DISPOSITION_VERSION, MHS_V2_EXPANSION_PII_DISPOSITION_SHA256, MHS_V2_EXPANSION_PII_DISPOSITION_PAYLOAD_DIGEST]); assert.equal(dispositionBytes.toString("utf8"), canonicalJson(disposition)); assert.doesNotThrow(() => validateMhsV2PiiArtifacts(screening, disposition, candidate)); });
test("45 pair publication atomic", () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-7i2a-pair-")); try { const result = publishMhsV2PiiPair(screening, disposition, candidate, dir); assert.equal(fs.existsSync(result.screeningPath) && fs.existsSync(result.dispositionPath), true); } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
test("46 overwrite refused", () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-7i2a-overwrite-")); try { fs.writeFileSync(path.join(dir, MHS_V2_EXPANSION_PII_SCREENING_FILENAME), "existing"); assert.throws(() => publishMhsV2PiiPair(screening, disposition, candidate, dir), /overwrite refused/); } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
test("47 failure leaves neither authority", () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-7i2a-failure-")); try { assert.throws(() => publishMhsV2PiiPair(screening, disposition, candidate, dir, (temporary, target) => { fs.renameSync(temporary, target); throw new Error("simulated failure"); }), /simulated failure/); assert.deepEqual(fs.readdirSync(dir), []); } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
test("48 decision matches disposition", () => { assert.deepEqual([disposition.finalAuthorizationDecision, disposition.piiStatusCounts, disposition.reviewDispositionCounts], ["REQUIRE_T6L_7I2B_HUMAN_PII_DISPOSITION_BEFORE_T6L_7I3", { NONE: 397, REDACTED: 0, REQUIRES_REVIEW: 3, EXCLUDE: 0, total: 400 }, { ELIGIBLE_FOR_REVIEW: 397, REQUIRES_PII_REVIEW: 3, EXCLUDED: 0, total: 400 }]); assert.equal(sha(fs.readFileSync(path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"))), MHS_INTERNAL_TEST_FREEZE_SHA256); const replay = screenMhsV2ExpansionCandidates(candidate, acquisition, policy); assert.deepEqual(replay, { screening, disposition }); });
