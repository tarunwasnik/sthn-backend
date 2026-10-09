import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalJson } from "../../research/textModerationDataset/manifest";
import { TEXT_DUPLICATE_NORMALIZATION_VERSION } from "../../research/textModerationDataset/identity";
import { MHS_CANDIDATE_ARTIFACT_SHA256 } from "../../research/textModerationDataset/mhsCandidateIntegrityAudit";
import { TEXT_MODERATION_ACQUISITION_MANIFEST_SHA256 } from "../../research/textModerationDataset/mhsTrainingEligibilityReleasePlan";
import { MHS_TRAIN_EXPANSION_ACQUISITION_SEED, MHS_TRAIN_EXPANSION_DESIGN_SHA256 } from "../../research/textModerationDataset/mhsTrainExpansionDesign";
import {
  MHS_PINNED_SOURCE_ARTIFACT_SHA256,
  MHS_PINNED_SOURCE_REVISION,
  MHS_PROPOSAL_REQUESTED_COUNTS,
  MHS_PROPOSAL_STRATA,
  MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_FILENAME,
  MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_PAYLOAD_DIGEST,
  MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SCHEMA,
  MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256,
  MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_VERSION,
  publishMhsTrainExpansionTrancheProposal,
  readMhsTrainExpansionTrancheProposal,
  validateMhsTrainExpansionTrancheProposal,
} from "../../research/textModerationDataset/mhsTrainExpansionTrancheProposal";

const root = process.cwd(), mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH");
const artifactPath = path.join(mhs, "expansion", MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_FILENAME), bytes = fs.readFileSync(artifactPath), artifact = readMhsTrainExpansionTrancheProposal(artifactPath);
const candidate = JSON.parse(fs.readFileSync(path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1.json"), "utf8")) as { rows: { sourceRowId: string; candidateAdmitted: boolean }[] };
const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const rank = (sourceRowId: string): string => sha(JSON.stringify([MHS_TRAIN_EXPANSION_ACQUISITION_SEED, MHS_PINNED_SOURCE_REVISION, sourceRowId]));

test("T6L-7I1 deterministic MHS expansion-tranche proposal", async (t) => {
  const checks: readonly [string, () => void][] = [
    ["01 expansion-design SHA", () => assert.equal(artifact.authorities.expansionDesignSha256, MHS_TRAIN_EXPANSION_DESIGN_SHA256)],
    ["02 acquisition-manifest SHA", () => assert.equal(artifact.authorities.acquisitionManifestSha256, TEXT_MODERATION_ACQUISITION_MANIFEST_SHA256)],
    ["03 pinned source authority", () => assert.deepEqual([artifact.authorities.sourceArtifactSha256, artifact.sourceAuthority.sourceRevision], [MHS_PINNED_SOURCE_ARTIFACT_SHA256, MHS_PINNED_SOURCE_REVISION])],
    ["04 source row count", () => assert.equal(artifact.sourceUniverse.totalSourceIdentities, 39565)],
    ["05 current admitted count", () => assert.equal(artifact.sourceUniverse.currentAdmittedIdentities, 86)],
    ["06 lifecycle-adjusted unused universe", () => assert.deepEqual([artifact.sourceUniverse.outsideCurrentAdmittedIdentities, artifact.sourceUniverse.otherCurrentLifecycleIdentities, artifact.sourceUniverse.proposalEligibleAfterLifecycleExclusions], [39479, 14, 39465])],
    ["07 exact seed", () => assert.equal(artifact.deterministicSelection.seed, MHS_TRAIN_EXPANSION_ACQUISITION_SEED)],
    ["08 five source strata", () => assert.deepEqual(artifact.stratumPrecedence, MHS_PROPOSAL_STRATA)],
    ["09 requested stratum counts", () => assert.deepEqual(Object.fromEntries(MHS_PROPOSAL_STRATA.map((value) => [value, artifact.parentTrancheInventory[value].requested])), MHS_PROPOSAL_REQUESTED_COUNTS)],
    ["10 predicates use source fields", () => { const definitions = JSON.stringify(artifact.stratumDefinitions); assert.match(definitions, /hate_speech_score/); assert.match(definitions, /violence/); assert.match(definitions, /dehumanize/); assert.doesNotMatch(definitions, /"profanity"/i); }],
    ["11 deterministic precedence", () => assert.deepEqual(artifact.stratumPrecedence, ["DISAGREEMENT_SOURCE_INCONSISTENCY_SIGNAL", "VIOLENCE_GENOCIDE_SIGNAL", "PROTECTED_DEHUMANIZATION_HIGH_SCORE_SIGNAL", "LOW_SCORE_CONTEXT_COUNTERSPEECH_SIGNAL", "NON_HATE_ABUSE_NO_CLEAR_TARGET_SIGNAL"])],
    ["12 current lifecycle identities excluded", () => { const occupied = new Set(candidate.rows.map((row) => row.sourceRowId)); assert.equal(artifact.proposalMembers.some((row) => occupied.has(row.sourceRowId)), false); }],
    ["13 selected identities unique", () => assert.equal(new Set(artifact.proposalMembers.map((row) => row.sourceRowId)).size, 400)],
    ["14 selected membership deterministic", () => { artifact.proposalMembers.forEach((row) => assert.equal(row.deterministicRank, rank(row.sourceRowId))); for (const stratum of MHS_PROPOSAL_STRATA) { const ranks = artifact.proposalMembers.filter((row) => row.selectionStratum === stratum).map((row) => row.deterministicRank); assert.deepEqual(ranks, [...ranks].sort()); } }],
    ["15 no final STHN labels", () => assert.equal(artifact.proposalMembers.some((row) => row.finalSthnDecision !== null || row.finalSthnPrimaryCategory !== null), false)],
    ["16 measurements explicitly source-only", () => assert.equal(artifact.proposalMembers.every((row) => row.sourceMeasurementsOnly), true)],
    ["17 exact duplicate screen", () => assert.deepEqual([artifact.exactNormalizedScreen.currentAdmittedCompared, artifact.exactNormalizedScreen.exactTextOverlapsWithCurrent, artifact.exactNormalizedScreen.selectedExactDuplicateCollisions], [86, 0, 0])],
    ["18 normalized duplicate policy", () => assert.deepEqual([artifact.exactNormalizedScreen.normalizationVersion, artifact.exactNormalizedScreen.normalizedTextOverlapsWithCurrent, artifact.exactNormalizedScreen.selectedNormalizedDuplicateCollisions], [TEXT_DUPLICATE_NORMALIZATION_VERSION, 0, 0])],
    ["19 protected text not accessed", () => assert.deepEqual([artifact.boundaries.internalTestAccessed, artifact.contaminationStage.internalTestTextAccessed], [false, false])],
    ["20 frozen 140 not accessed", () => assert.deepEqual([artifact.boundaries.frozen140Accessed, artifact.contaminationStage.frozen140TextAccessed], [false, false])],
    ["21 source-side PII policy", () => assert.deepEqual([artifact.piiSourceSideSummary.REQUIRES_REVIEW, artifact.piiSourceSideSummary.disposition], [400, "QUARANTINE_PENDING_T6L_7I2_PII_INTEGRITY_SCREEN"])],
    ["22 bounded proposal", () => assert.ok(artifact.proposalCount <= 400)],
    ["23 one primary stratum", () => assert.equal(artifact.proposalMembers.every((row) => MHS_PROPOSAL_STRATA.includes(row.selectionStratum)), true)],
    ["24 V2 capacity assessment", () => assert.deepEqual([artifact.v2CapacityAssessment.status, artifact.v2CapacityAssessment.authorizeCandidateAcquisition], ["PLAUSIBLE_CAPACITY_NOT_LABEL_GUARANTEE", true])],
    ["25 TRAIN unchanged", () => assert.equal(artifact.boundaries.currentTrainMutated, false)],
    ["26 VALIDATION unchanged", () => assert.equal(artifact.boundaries.validationMutated, false)],
    ["27 INTERNAL_TEST unchanged", () => assert.equal(artifact.boundaries.internalTestMutated, false)],
    ["28 no candidates created", () => assert.deepEqual([artifact.boundaries.acquisitionPerformed, artifact.boundaries.candidatesCreated], [false, false])],
    ["29 no human review", () => assert.deepEqual([artifact.boundaries.humanReviewPacketCreated, artifact.boundaries.humanReviewPerformed], [false, false])],
    ["30 no training", () => assert.deepEqual([artifact.boundaries.trainingPerformed, artifact.boundaries.run3Designed], [false, false])],
    ["31 canonical proposal", () => { assert.deepEqual([artifact.schemaVersion, artifact.proposalVersion, sha(bytes), artifact.proposalPayloadDigest], [MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SCHEMA, MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_VERSION, MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256, MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_PAYLOAD_DIGEST]); assert.equal(bytes.toString("utf8"), canonicalJson(artifact)); assert.doesNotThrow(() => validateMhsTrainExpansionTrancheProposal(artifact)); }],
    ["32 overwrite refused", () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-7i1-overwrite-")), target = path.join(dir, "proposal.json"); try { fs.writeFileSync(target, "existing"); assert.throws(() => publishMhsTrainExpansionTrancheProposal(bytes, target), /overwrite refused/); assert.equal(fs.readFileSync(target, "utf8"), "existing"); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }],
    ["33 publication rollback", () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-7i1-publish-")), target = path.join(dir, "proposal.json"); try { assert.throws(() => publishMhsTrainExpansionTrancheProposal(bytes, target, () => { throw new Error("simulated publication failure"); }), /simulated publication failure/); assert.equal(fs.existsSync(target), false); assert.deepEqual(fs.readdirSync(dir), []); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }],
  ];
  for (const [name, check] of checks) await t.test(name, check);
});
