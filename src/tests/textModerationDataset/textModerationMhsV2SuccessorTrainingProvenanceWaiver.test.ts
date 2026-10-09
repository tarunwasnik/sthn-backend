import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJson } from "../../research/textModerationDataset/manifest";
import {
  MHS_V2_SUCCESSOR_WAIVER_FILENAME,
  MHS_V2_SUCCESSOR_WAIVER_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_WAIVER_SHA256,
  MhsV2SuccessorProvenanceWaiverArtifact,
  createMhsV2SuccessorTrainingProvenanceWaiver,
  defaultMhsV2SuccessorWaiverPaths,
  publishMhsV2SuccessorTrainingProvenanceWaiver,
  validateMhsV2SuccessorTrainingProvenanceWaiver,
} from "../../research/textModerationDataset/mhsV2SuccessorTrainingProvenanceWaiver";
import { sha256FileStreaming } from "../../research/textModerationDataset/mhsV2SuccessorTrainingProvenanceRecovery";

const root = process.cwd();
const paths = defaultMhsV2SuccessorWaiverPaths(root);
const training = path.dirname(paths.d0Analysis);
const artifactPath = path.join(training, MHS_V2_SUCCESSOR_WAIVER_FILENAME);
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as MhsV2SuccessorProvenanceWaiverArtifact;
const authority = (name: string): Record<string, unknown> => artifact.authorities[name] as Record<string, unknown>;
const completed = authority("completedRun");
const preparation = authority("preparation");
const gaps = artifact.waivedGap as Record<string, unknown>;
const missing = artifact.unresolvedProvenance.missingDirectBindingsPreserved as Record<string, unknown>;

const checks: readonly [string, () => void][] = [
  ["01 artifact validates", () => assert.doesNotThrow(() => validateMhsV2SuccessorTrainingProvenanceWaiver(artifact))],
  ["02 status exact", () => assert.equal(artifact.status, "PROVENANCE_WAIVER_ACCEPTED_CERTIFICATION_ADMISSIBLE")],
  ["03 artifact SHA exact", () => assert.equal(sha256FileStreaming(artifactPath), MHS_V2_SUCCESSOR_WAIVER_SHA256)],
  ["04 payload digest exact", () => assert.equal(artifact.waiverPayloadDigest, MHS_V2_SUCCESSOR_WAIVER_PAYLOAD_DIGEST)],
  ["05 canonical publication", () => assert.equal(fs.readFileSync(artifactPath, "utf8"), canonicalJson(artifact))],
  ["06 D0 SHA exact", () => assert.equal((authority("d0Analysis")).sha256, "494555916a7f0db88a5112fabcc078b48eea8cd8b2990ac863cc1a997bc32681")],
  ["07 D0 payload and status exact", () => assert.deepEqual([(authority("d0Analysis")).payloadDigest, (authority("d0Analysis")).status], ["4fbe8cca975da257db61ea895aa749d960b79a5ee3039b3710e570f8bf2fd3c5", "WAIVER_REQUIRES_EXPLICIT_AUTHORIZATION"])],
  ["08 manifest SHA exact", () => assert.equal(completed.manifestSha256, "b7d90bef68fd3c72242c39fb299a59f67af097d6820b4c302280666117ccffac")],
  ["09 manifest payload exact", () => assert.equal(completed.manifestPayloadDigest, "d7ddb001bdc817cf14ba0f8516dacaed08e69d069d5eefe5a7243841c640059b")],
  ["10 lifecycle exact", () => assert.deepEqual([completed.lifecycleSha256, completed.lifecycleStatus], ["47ae7ead37a2c71ff0db6d802acf5ff25ed327c4cac8255a4160f2040ef9fab9", "COMPLETED"])],
  ["11 result exact", () => assert.deepEqual([completed.resultSummarySha256, completed.resultStatus], ["8f0c65c47cfa7d3db43e6fd1738f8e057924fb59b3664a5e4cc32be587fb372e", "SUCCESSOR_TRAINING_RUN_COMPLETED"])],
  ["12 selected and final model exact", () => assert.deepEqual([completed.selectedEpoch03ModelSha256, completed.finalModelSha256], ["9c6f3e1033e5146bbd1eed3df6c68be2e2be9b1b5815afda3d41baa5a739ac3f", "9c6f3e1033e5146bbd1eed3df6c68be2e2be9b1b5815afda3d41baa5a739ac3f"])],
  ["13 strategy exact", () => assert.deepEqual(Object.values(authority("strategy")), ["c2a4ca5b41587b2f73cf57f1694bb5e2176d0b5466102d882dd510ada157b9f3", "e693587aad615eb4a210503513a6d5b93d8e6be468ab64c2bcfa620e6b451a1e"])],
  ["14 contract exact", () => assert.deepEqual(Object.values(authority("contract")), ["b3fdddf017c33b2c4af093ed62c4c4b2afc520f2fdb6953a745c9ff4f1bcd5b3", "80f8f7b65899ec4cf52dbee269dacaced0c3483cbc057daa47d07694e2dab591"])],
  ["15 preparation exact", () => assert.deepEqual([preparation.sha256, preparation.payloadDigest], ["61c8aaaa0f05330638c880a4cd017d6504509458939d28cb4562d5d3bc151c6f", "430f9d9667ca91b7f7108171116c7f6d6c0c0c9a98d52a9e33608228d6267942"])],
  ["16 expected runner exact", () => assert.equal(preparation.expectedPreparedRunnerSha256, "2a6fc2a2f36796a4e1845d07edacf9c7e54e8bc24291838ef51733c7942c25ed")],
  ["17 expected model source exact", () => assert.equal(preparation.expectedPreparedModelImplementationSha256, "f60e9d29e16ce9f8da7ea3c573daae793f0a5723ae9bd725807bfb2861177831")],
  ["18 direct preparation binding stays absent", () => assert.equal(missing.preparationSha256, null)],
  ["19 direct runner binding stays absent", () => assert.equal(missing.runnerSha256, null)],
  ["20 direct model binding stays absent", () => assert.equal(missing.modelImplementationSha256, null)],
  ["21 no direct executed-source attestation", () => assert.equal(gaps.directlyAttestedExecutedSourceIdentities, false)],
  ["22 provenance not recovered", () => assert.equal(gaps.provenanceRecovered, false)],
  ["23 exact source not verified", () => assert.equal(gaps.exactSourceVerified, false)],
  ["24 no false chained provenance", () => assert.equal(artifact.evidenceClassification.cryptographicChainedCompleteRunToExecutedSources, false)],
  ["25 waiver code exact", () => assert.equal(gaps.code, "MISSING_EXECUTED_SOURCE_BYTE_ATTESTATION")],
  ["26 waiver scope exact", () => assert.deepEqual(gaps.appliesTo, ["DIRECT_RUN_TO_8E_C_PREPARATION_LINK", "EXACT_HISTORICAL_RUNNER_BYTES_EXECUTED", "EXACT_HISTORICAL_CUSTOM_MODEL_BYTES_EXECUTED"])],
  ["27 non-waived requirements preserved", () => assert.deepEqual(artifact.nonWaivedRequirements, ["RUN_MANIFEST_INTEGRITY", "LIFECYCLE_INTEGRITY", "RESULT_SUMMARY_INTEGRITY", "TRAIN_AUTHORITY", "VALIDATION_AUTHORITY", "DEVELOPMENT_PROJECTION_AUTHORITY", "BASE_MODEL_AUTHORITY", "TOKENIZER_AUTHORITY", "EXPERIMENT_CONTRACT_COMPLIANCE", "CHECKPOINT_INTEGRITY", "SELECTED_MODEL_INTEGRITY", "PROTECTED_DATA_ISOLATION", "RESERVE_ISOLATION", "EXCLUSION_ISOLATION", "THRESHOLD_ISOLATION", "IMMUTABLE_EVIDENCE"])],
  ["28 authorization is not falsely signed", () => assert.equal(artifact.authorization.cryptographicallySignedByUser, false)],
  ["29 admissible only under waiver", () => assert.deepEqual([artifact.admissibility.certificationAdmissible, artifact.admissibility.admissibleOnlyUnderExplicitWaiver], [true, true])],
  ["30 waiver disclosure required", () => assert.equal(artifact.admissibility.certificationMustDiscloseWaiver, true)],
  ["31 protected evaluation unauthorized", () => assert.equal(artifact.prohibitions.protectedEvaluationAuthorized, false)],
  ["32 threshold remains not selected", () => assert.deepEqual([artifact.prohibitions.thresholdSelectionAuthorized, artifact.prohibitions.productionThresholdStatus], [false, "NOT_SELECTED"])],
  ["33 production unauthorized", () => assert.equal(artifact.prohibitions.productionAuthorized, false)],
  ["34 retraining unauthorized", () => assert.equal(artifact.prohibitions.retrainingAuthorized, false)],
  ["35 no tampering evidence", () => assert.deepEqual([artifact.unresolvedProvenance.evidenceOfTampering, artifact.unresolvedProvenance.missingProvenanceIsNotEvidenceOfTampering], [false, true])],
  ["36 auxiliary diagnostics remain absent", () => assert.deepEqual([artifact.limitations.auxiliaryComponentLossesPersisted, artifact.limitations.auxiliaryMetricsPersisted], [false, false])],
  ["37 runtime and loss terminal-only", () => assert.deepEqual([(artifact.limitations.trainerRuntimeSeconds as Record<string, unknown>).classification, (artifact.limitations.overallTrainerLoss as Record<string, unknown>).classification], ["TERMINAL_ONLY_CORROBORATING", "TERMINAL_ONLY_CORROBORATING"])],
  ["38 execution counters zero", () => assert.ok(Object.values(artifact.boundaries).every((value) => value === 0))],
];
for (const [name, check] of checks) test(name, check);

test("39 deterministic reconstruction equals publication", () => assert.equal(canonicalJson(createMhsV2SuccessorTrainingProvenanceWaiver(paths)), fs.readFileSync(artifactPath, "utf8")));
test("40 modified admissibility rejected", () => { const clone = structuredClone(artifact); (clone.admissibility as Record<string, unknown>).certificationAdmissible = false; assert.throws(() => validateMhsV2SuccessorTrainingProvenanceWaiver(clone), /payload|admissibility/u); });
test("41 false direct binding rejected", () => { const clone = structuredClone(artifact); ((clone.unresolvedProvenance.missingDirectBindingsPreserved as Record<string, unknown>)).runnerSha256 = "0".repeat(64); assert.throws(() => validateMhsV2SuccessorTrainingProvenanceWaiver(clone), /payload/u); });
test("42 publication replay refused", () => assert.throws(() => publishMhsV2SuccessorTrainingProvenanceWaiver(artifact, training), /overwrite refused/u));
test("43 failed publication rolls back", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-t6l-8e-d0w-")); try { assert.throws(() => publishMhsV2SuccessorTrainingProvenanceWaiver(artifact, directory, () => { throw new Error("injected"); }), /injected/u); assert.equal(fs.existsSync(path.join(directory, MHS_V2_SUCCESSOR_WAIVER_FILENAME)), false); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("44 implementation contains no ML execution", () => { const source = fs.readFileSync(path.resolve(root, "src/research/textModerationDataset/mhsV2SuccessorTrainingProvenanceWaiver.ts"), "utf8"); assert.doesNotMatch(source, /from_pretrained|AutoModel|trainer\.train|trainer\.evaluate|torch/iu); });
