import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { TEXT_DUPLICATE_NORMALIZATION_VERSION, textDuplicateFingerprint } from "../../research/textModerationDataset/identity";
import { canonicalJson } from "../../research/textModerationDataset/manifest";
import { MHS_CANDIDATE_ARTIFACT_SHA256 } from "../../research/textModerationDataset/mhsCandidateIntegrityAudit";
import { MHS_SPLIT_MANIFEST_SHA256 } from "../../research/textModerationDataset/mhsInternalTestFreeze";
import { MHS_TRAIN_EXPANSION_DESIGN_SHA256 } from "../../research/textModerationDataset/mhsTrainExpansionDesign";
import { MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256 } from "../../research/textModerationDataset/mhsTrainExpansionTrancheProposal";
import { MHS_INTERNAL_TEST_FREEZE_SHA256 } from "../../research/textModerationDataset/mhsTrainingEligibilityReleasePlan";
import {
  MHS_V2_EXPANSION_ACQUISITION_PAYLOAD_DIGEST, MHS_V2_EXPANSION_ACQUISITION_SCHEMA,
  MHS_V2_EXPANSION_ACQUISITION_SHA256, MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST,
  MHS_V2_EXPANSION_CANDIDATE_PAYLOAD_DIGEST, MHS_V2_EXPANSION_CANDIDATE_SCHEMA,
  MHS_V2_EXPANSION_CANDIDATE_SHA256, MhsV2ExpansionAcquisitionArtifact,
  MhsV2ExpansionCandidateArtifact, publishMhsV2ExpansionPair, validateMhsV2ExpansionArtifacts,
} from "../../research/textModerationDataset/mhsV2ExpansionCandidateAcquisition";

const root = process.cwd(), mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH");
const expansion = path.join(mhs, "expansion/candidates"), candidatePath = path.join(expansion, "mhs-v2-expansion-candidates-v1.json"), acquisitionPath = path.join(expansion, "mhs-v2-expansion-candidate-acquisition-v1.json");
const candidateBytes = fs.readFileSync(candidatePath), acquisitionBytes = fs.readFileSync(acquisitionPath);
const candidate = JSON.parse(candidateBytes.toString("utf8")) as MhsV2ExpansionCandidateArtifact, acquisition = JSON.parse(acquisitionBytes.toString("utf8")) as MhsV2ExpansionAcquisitionArtifact;
const proposal = JSON.parse(fs.readFileSync(path.join(mhs, "expansion/mhs-train-expansion-tranche-proposal-v1.json"), "utf8")) as { proposalMembers: { sourceRowId: string; exactTextDigest: string; selectionStratum: string; sourceMeasurements: unknown }[] };
const parent = fs.readFileSync(path.join(mhs, "mhs-review-tranche-v1.jsonl"), "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as { sourceRowId: string; text: string });
const v1Integrity = JSON.parse(fs.readFileSync(path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1-integrity-audit.json"), "utf8")) as { rows: { sourceRowId: string }[] };
const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const cloneCandidate = (): MhsV2ExpansionCandidateArtifact => JSON.parse(JSON.stringify(candidate)) as MhsV2ExpansionCandidateArtifact;

test("01 7I design SHA enforced", () => assert.equal(acquisition.authorities.expansionDesignSha256, MHS_TRAIN_EXPANSION_DESIGN_SHA256));
test("02 7I1 proposal SHA enforced", () => assert.deepEqual([acquisition.authorities.proposalSha256, sha(fs.readFileSync(path.join(mhs, "expansion/mhs-train-expansion-tranche-proposal-v1.json")))], [MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256, MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256]));
test("03 source artifact SHA enforced", () => assert.equal(acquisition.authorities.pinnedSourceArtifactSha256, sha(fs.readFileSync(path.join(mhs, "train-00000-of-00001.parquet")))));
test("04 proposal count is 400", () => assert.equal(proposal.proposalMembers.length, 400));
test("05 all source IDs resolve", () => { const ids = new Set(parent.map((row) => row.sourceRowId)); assert.equal(candidate.rows.filter((row) => ids.has(row.sourceRowId)).length, 400); });
test("06 source identity recomputes", () => assert.equal(candidate.rows.every((row) => row.sourceIdentityRecomputed && row.candidateId === row.sourceRowId), true));
test("07 source text present", () => assert.equal(candidate.rows.every((row) => row.text.length > 0), true));
test("08 source text preserved exactly", () => { const source = new Map(parent.map((row) => [row.sourceRowId, row.text])); assert.equal(candidate.rows.every((row) => source.get(row.sourceRowId) === row.text && sha(row.text) === row.exactTextDigest), true); });
test("09 proposal stratum preserved", () => { const members = new Map(proposal.proposalMembers.map((row) => [row.sourceRowId, row.selectionStratum])); assert.equal(candidate.rows.every((row) => members.get(row.sourceRowId) === row.selectionStratum), true); });
test("10 measurements are provenance-only", () => { const members = new Map(proposal.proposalMembers.map((row) => [row.sourceRowId, canonicalJson(row.sourceMeasurements)])); assert.equal(candidate.rows.every((row) => row.sourceMeasurementsOnly && members.get(row.sourceRowId) === canonicalJson(row.sourceMeasurements)), true); });
test("11 no final ALLOW/BLOCK", () => assert.equal(candidate.rows.every((row) => row.finalSthnDecision === null), true));
test("12 no final classification", () => assert.equal(candidate.rows.every((row) => row.finalSthnPrimaryCategory === null), true));
test("13 candidate IDs unique", () => assert.equal(new Set(candidate.rows.map((row) => row.candidateId)).size, 400));
test("14 membership deterministic", () => assert.deepEqual([candidate.membershipDigest, acquisition.candidateMembershipDigest], [MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST, MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST]));
test("15 candidate authority separate from V1", () => assert.notEqual(path.resolve(candidatePath), path.resolve(mhs, "candidates/mhs-review-pilot-v1-candidate-v1.json")));
test("16 current 86 unchanged", () => assert.deepEqual([v1Integrity.rows.length, sha(fs.readFileSync(path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1.json")))], [86, MHS_CANDIDATE_ARTIFACT_SHA256]));
test("17 exact duplicate audit deterministic", () => assert.deepEqual([acquisition.duplicateAudit.withinCandidateExactMatches, acquisition.duplicateAudit.currentLifecycleExactMatches], [0, 0]));
test("18 normalized duplicate audit deterministic", () => { assert.equal(acquisition.duplicateAudit.normalizationVersion, TEXT_DUPLICATE_NORMALIZATION_VERSION); assert.equal(candidate.rows.every((row) => textDuplicateFingerprint(row.text) === row.normalizedTextFingerprint), true); assert.deepEqual([acquisition.duplicateAudit.withinCandidateNormalizedMatches, acquisition.duplicateAudit.currentLifecycleNormalizedMatches], [0, 0]); });
test("19 PII screening deterministic", () => assert.deepEqual([acquisition.piiAudit.automaticDetectorAvailable, acquisition.piiAudit.automaticallyResolved, acquisition.piiAudit.unresolvedRequiresReview], [false, 0, 400]));
test("20 unresolved PII quarantined", () => assert.equal(candidate.rows.every((row) => row.piiStatus === "REQUIRES_REVIEW" && row.candidateStatus === "QUARANTINED"), true));
test("21 EXCLUDE cannot be review eligible", () => { const tampered = cloneCandidate() as any; tampered.rows[0].piiStatus = "EXCLUDE"; tampered.rows[0].candidateStatus = "ELIGIBLE_FOR_REVIEW"; assert.throws(() => validateMhsV2ExpansionArtifacts(tampered, acquisition)); });
test("22 malformed row cannot be review eligible", () => { const tampered = cloneCandidate() as any; delete tampered.rows[0].candidateId; tampered.rows[0].candidateStatus = "ELIGIBLE_FOR_REVIEW"; assert.throws(() => validateMhsV2ExpansionArtifacts(tampered, acquisition)); });
test("23 provenance failures fail closed", () => { const tampered = cloneCandidate() as any; tampered.rows[0].lineageRootId = "wrong"; assert.throws(() => validateMhsV2ExpansionArtifacts(tampered, acquisition)); });
test("24 status counts sum to 400", () => assert.equal(acquisition.statusCounts.eligibleForReview + acquisition.statusCounts.quarantined + acquisition.statusCounts.excluded, 400));
test("25 no semantic inference", () => assert.deepEqual([acquisition.duplicateAudit.semanticSimilarityExecuted, acquisition.boundaries.semanticE5Executed], [false, false]));
test("26 no candidate merged", () => { const ids = new Set(v1Integrity.rows.map((row) => row.sourceRowId)); assert.equal(candidate.rows.some((row) => ids.has(row.candidateId)), false); });
test("27 no current split changed", () => assert.equal(sha(fs.readFileSync(path.join(mhs, "splits/mhs-split-manifest-v1.json"))), MHS_SPLIT_MANIFEST_SHA256));
test("28 no training eligibility", () => assert.equal(candidate.rows.every((row) => !row.trainingEligible), true));
test("29 INTERNAL_TEST text not accessed", () => assert.deepEqual([acquisition.boundaries.internalTestAccessed, sha(fs.readFileSync(path.join(mhs, "splits/mhs-internal-test-freeze-v1.json")))], [false, MHS_INTERNAL_TEST_FREEZE_SHA256]));
test("30 frozen 140 not accessed", () => assert.equal(acquisition.boundaries.frozen140Accessed, false));
test("31 candidate artifact canonical", () => { assert.equal(candidateBytes.toString("utf8"), canonicalJson(candidate)); assert.deepEqual([sha(candidateBytes), candidate.candidatePayloadDigest], [MHS_V2_EXPANSION_CANDIDATE_SHA256, MHS_V2_EXPANSION_CANDIDATE_PAYLOAD_DIGEST]); });
test("32 acquisition manifest canonical", () => { assert.equal(acquisitionBytes.toString("utf8"), canonicalJson(acquisition)); assert.deepEqual([sha(acquisitionBytes), acquisition.acquisitionPayloadDigest], [MHS_V2_EXPANSION_ACQUISITION_SHA256, MHS_V2_EXPANSION_ACQUISITION_PAYLOAD_DIGEST]); assert.doesNotThrow(() => validateMhsV2ExpansionArtifacts(candidate, acquisition)); });
test("33 paired publication atomic", () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-7i2-pair-")); try { const result = publishMhsV2ExpansionPair(candidate, acquisition, dir); assert.equal(fs.existsSync(result.candidatePath) && fs.existsSync(result.acquisitionPath), true); } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
test("34 overwrite refused", () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-7i2-overwrite-")); try { fs.writeFileSync(path.join(dir, "mhs-v2-expansion-candidates-v1.json"), "existing"); assert.throws(() => publishMhsV2ExpansionPair(candidate, acquisition, dir), /overwrite refused/); } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
test("35 simulated failure leaves neither artifact", () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-7i2-failure-")); try { assert.throws(() => publishMhsV2ExpansionPair(candidate, acquisition, dir, (candidateTemp, candidateTarget) => { fs.renameSync(candidateTemp, candidateTarget); throw new Error("simulated pair failure"); }), /simulated pair failure/); assert.deepEqual(fs.readdirSync(dir), []); } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
test("36 no human review", () => assert.deepEqual([acquisition.boundaries.humanReviewPerformed, acquisition.boundaries.humanReviewPacketCreated, candidate.rows.every((row) => row.humanReviewState === "UNREVIEWED")], [false, false, true]));
test("37 no training", () => assert.deepEqual([acquisition.boundaries.trainingPerformed, acquisition.boundaries.datasetMaterialized, acquisition.acquisitionDecision], [false, false, "DO_NOT_AUTHORIZE_T6L_7I3_REVIEWER_A_REVIEW"]));
