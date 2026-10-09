import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJson } from "../../research/textModerationDataset/manifest";
import {
  MHS_V2_SUCCESSOR_CERTIFICATION_FILENAME,
  MHS_V2_SUCCESSOR_CERTIFICATION_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_CERTIFICATION_SHA256,
  MhsV2SuccessorCertificationArtifact,
  createMhsV2SuccessorLocalTrainingCertification,
  defaultMhsV2SuccessorCertificationPaths,
  publishMhsV2SuccessorLocalTrainingCertification,
  validateMhsV2SuccessorLocalTrainingCertification,
} from "../../research/textModerationDataset/mhsV2SuccessorLocalTrainingCertification";
import { sha256FileStreaming } from "../../research/textModerationDataset/mhsV2SuccessorTrainingProvenanceRecovery";

const root = process.cwd(), paths = defaultMhsV2SuccessorCertificationPaths(root), training = path.dirname(paths.contract);
const artifactPath = path.join(training, MHS_V2_SUCCESSOR_CERTIFICATION_FILENAME);
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as MhsV2SuccessorCertificationArtifact;
const a = artifact.authorities, w = artifact.provenanceWaiver, run = artifact.run, inputs = artifact.inputs, execution = artifact.execution;
const checkpoints = artifact.checkpoints, isolation = artifact.isolation, limits = artifact.limitations;
const checks: readonly [string, () => void][] = [
  ["01 artifact validates", () => assert.doesNotThrow(() => validateMhsV2SuccessorLocalTrainingCertification(artifact))],
  ["02 status exact", () => assert.equal(artifact.status, "SUCCESSOR_TRAINING_RUN_CERTIFIED_WITH_PROVENANCE_WAIVER")],
  ["03 artifact SHA", () => assert.equal(sha256FileStreaming(artifactPath), MHS_V2_SUCCESSOR_CERTIFICATION_SHA256)],
  ["04 payload digest", () => assert.equal(artifact.certificationPayloadDigest, MHS_V2_SUCCESSOR_CERTIFICATION_PAYLOAD_DIGEST)],
  ["05 canonical publication", () => assert.equal(fs.readFileSync(artifactPath, "utf8"), canonicalJson(artifact))],
  ["06 D0 exact", () => assert.deepEqual([a.d0.sha256, a.d0.payloadDigest, a.d0.status], ["494555916a7f0db88a5112fabcc078b48eea8cd8b2990ac863cc1a997bc32681", "4fbe8cca975da257db61ea895aa749d960b79a5ee3039b3710e570f8bf2fd3c5", "WAIVER_REQUIRES_EXPLICIT_AUTHORIZATION"])],
  ["07 waiver exact", () => assert.deepEqual([a.waiver.sha256, a.waiver.payloadDigest, a.waiver.status], ["ae4d33fc9e43cd6d7c23ab4a4302855c9eed2ba1fca638a5137ebf1d1148c29b", "0738082cdaab0f6a8041560b5e58c5010b65bd11a6a6f7f1686659f6532c8253", "PROVENANCE_WAIVER_ACCEPTED_CERTIFICATION_ADMISSIBLE"])],
  ["08 waiver required", () => assert.deepEqual([w.requiredForCertification, w.accepted, artifact.disposition.certifiedOnlyWithProvenanceWaiver], [true, true, true])],
  ["09 waived gap exact", () => assert.equal(w.code, "MISSING_EXECUTED_SOURCE_BYTE_ATTESTATION")],
  ["10 missing preparation binding", () => assert.equal(w.directRunBindings.preparationSha256, null)],
  ["11 missing runner binding", () => assert.equal(w.directRunBindings.runnerSha256, null)],
  ["12 missing model binding", () => assert.equal(w.directRunBindings.modelImplementationSha256, null)],
  ["13 no false source proof", () => assert.equal(w.exactHistoricalExecutedSourceBytesProven, false)],
  ["14 provenance not recovered", () => assert.equal(w.provenanceRecovered, false)],
  ["15 strategy exact", () => assert.deepEqual([a.strategy.sha256, a.strategy.payloadDigest], ["e693587aad615eb4a210503513a6d5b93d8e6be468ab64c2bcfa620e6b451a1e", "c2a4ca5b41587b2f73cf57f1694bb5e2176d0b5466102d882dd510ada157b9f3"])],
  ["16 contract exact", () => assert.deepEqual([a.contract.sha256, a.contract.payloadDigest], ["80f8f7b65899ec4cf52dbee269dacaced0c3483cbc057daa47d07694e2dab591", "b3fdddf017c33b2c4af093ed62c4c4b2afc520f2fdb6953a745c9ff4f1bcd5b3"])],
  ["17 preparation exact", () => assert.deepEqual([a.preparation.sha256, a.preparation.payloadDigest], ["61c8aaaa0f05330638c880a4cd017d6504509458939d28cb4562d5d3bc151c6f", "430f9d9667ca91b7f7108171116c7f6d6c0c0c9a98d52a9e33608228d6267942"])],
  ["18 expected sources exact", () => assert.deepEqual([a.expectedPreparedRunnerSha256, a.expectedPreparedModelImplementationSha256], ["2a6fc2a2f36796a4e1845d07edacf9c7e54e8bc24291838ef51733c7942c25ed", "f60e9d29e16ce9f8da7ea3c573daae793f0a5723ae9bd725807bfb2861177831"])],
  ["19 run manifest exact", () => assert.deepEqual([run.manifestSha256, run.manifestPayloadDigest], ["b7d90bef68fd3c72242c39fb299a59f67af097d6820b4c302280666117ccffac", "d7ddb001bdc817cf14ba0f8516dacaed08e69d069d5eefe5a7243841c640059b"])],
  ["20 lifecycle exact", () => assert.deepEqual([run.lifecycleSha256, run.lifecycleStatus], ["47ae7ead37a2c71ff0db6d802acf5ff25ed327c4cac8255a4160f2040ef9fab9", "COMPLETED"])],
  ["21 summary exact", () => assert.deepEqual([run.resultSummarySha256, run.resultStatus], ["8f0c65c47cfa7d3db43e6fd1738f8e057924fb59b3664a5e4cc32be587fb372e", "SUCCESSOR_TRAINING_RUN_COMPLETED"])],
  ["22 completed accounting", () => assert.deepEqual([run.epochsCompleted, run.optimizerSteps, run.schedulerSteps, run.validationEvaluations], [3, 75, 75, 3])],
  ["23 TRAIN identity/counts", () => assert.deepEqual(inputs.TRAIN, { ALLOW: 110, BLOCK: 90, payloadDigest: "f2c0e863db5169bf3989b3cdf72e2e71efdb71da982540bbfdebd8dc560f03ff", rows: 200, sha256: "fa9eaeb3fa519ded246bffda1fb57902ca2fcae4c64fb10968d430fab4a4bf74" })],
  ["24 VALIDATION identity/counts", () => assert.deepEqual(inputs.VALIDATION, { ALLOW: 9, BLOCK: 4, payloadDigest: "a1c46eff57f8ee501440fa92eb86f990d8a8648d425a771fd48bbe72447be095", rows: 13, sha256: "5c01425c9c7e6e1f4348e38a98eaf1740898c3ba98f2bb6114d77175631b0d29" })],
  ["25 binary objective", () => assert.deepEqual(artifact.objective.primary, { appliesTo: "ALL_ROWS", loss: "TWO_LOGIT_CROSS_ENTROPY", mapping: { ALLOW: 0, BLOCK: 1 }, weight: 1 })],
  ["26 auxiliary objective and weight", () => assert.deepEqual([artifact.objective.auxiliary.loss, artifact.objective.auxiliary.weight, artifact.objective.auxiliary.otherInappropriateIncluded], ["MASKED_FIVE_LOGIT_CROSS_ENTROPY", .25, false])],
  ["27 category mapping", () => assert.deepEqual(artifact.objective.auxiliary.category2id, { ABUSIVE_OR_HARASSING: 0, HATE: 1, PROFANITY: 2, SEXUAL: 3, THREAT_OR_VIOLENCE: 4 })],
  ["28 masking exact", () => assert.deepEqual([artifact.masking.binaryAllRows, artifact.masking.allowAuxiliaryEligible, artifact.masking.supportedBlockAuxiliaryEligible, artifact.masking.otherInappropriateEligible, artifact.masking.unsupportedBlockFailsClosed], [true, false, true, false, true])],
  ["29 zero eligible safe", () => assert.equal(artifact.masking.zeroEligibleBatch, "DIFFERENTIABLE_ZERO_NO_EMPTY_CROSS_ENTROPY")],
  ["30 natural sampling", () => assert.equal(execution.sampling.policy, "NATURAL_SEEDED_RANDOM_WITHOUT_REPLACEMENT")],
  ["31 no rebalance", () => assert.deepEqual([execution.sampling.oversampling, execution.sampling.categoryBalancing, execution.sampling.classWeighting, execution.sampling.augmentation], [false, false, "NONE", false])],
  ["32 optimizer configuration", () => assert.deepEqual([execution.configuration.optimizer, execution.configuration.learningRate, execution.configuration.betas, execution.configuration.epsilon, execution.configuration.weightDecay], ["AdamW", 2e-5, [0.9, .999], 1e-8, .01])],
  ["33 batching", () => assert.deepEqual([execution.configuration.trainBatchSize, execution.configuration.validationBatchSize, execution.configuration.gradientAccumulation, execution.configuration.effectiveBatchSize], [8, 8, 1, 8])],
  ["34 scheduler and clipping", () => assert.deepEqual([execution.configuration.scheduler, execution.configuration.warmupSteps, execution.configuration.maxGradNorm], ["linear", 2, 1])],
  ["35 CPU FP32 workers", () => assert.deepEqual([execution.device, execution.gpuAuthorized, execution.configuration.precision, execution.workers], ["CPU_REQUIRED", false, "FP32", 0])],
  ["36 no RAM gate", () => assert.deepEqual([execution.ramEligibilityGate, execution.resourceDiagnosticsAuthoritativeForEligibility], ["NONE", false])],
  ["37 seed", () => assert.deepEqual(execution.seed, { integer: 926509953, string: "STHN_T6L_8E_B_MHS_V2_SUCCESSOR_CATEGORY_AWARE_TRAINING_RUN_V1" })],
  ["38 preprocessing", () => assert.deepEqual([artifact.preprocessing.maxLength, artifact.preprocessing.padding, artifact.preprocessing.truncation, artifact.preprocessing.trainTruncations, artifact.preprocessing.validationTruncations], [160, "DYNAMIC_RIGHT", "DETERMINISTIC_RIGHT", 0, 0])],
  ["39 epoch 1 exact", () => assert.deepEqual(artifact.epochMetrics[0], { accuracy: .6923076923076923, allowF1: .8181818181818181, allowPrecision: .6923076923076923, allowRecall: 1, balancedAccuracy: .5, binaryValidationLoss: .6231505870819092, blockF1: 0, blockPrecision: 0, blockRecall: 0, confusionMatrix: [[9,0],[4,0]], epoch: 1, globalStep: 25, macroF1: .40909090909090906 })],
  ["40 epoch 2 exact", () => assert.deepEqual([artifact.epochMetrics[1].binaryValidationLoss, artifact.epochMetrics[1].macroF1, artifact.epochMetrics[1].confusionMatrix], [.5079421401023865, .40909090909090906, [[9,0],[4,0]]])],
  ["41 epoch 3 exact", () => assert.deepEqual([artifact.epochMetrics[2].binaryValidationLoss, artifact.epochMetrics[2].macroF1, artifact.epochMetrics[2].balancedAccuracy, artifact.epochMetrics[2].confusionMatrix], [.4987126886844635, .7067669172932332, .6944444444444444, [[8,1],[2,2]]])],
  ["42 validation warning", () => assert.deepEqual([limits.validationWarning, limits.validationRows, limits.highSamplingVariance], ["VALIDATION_HAS_13_ROWS_HIGH_SAMPLING_VARIANCE", 13, true])],
  ["43 auxiliary diagnostics absent", () => assert.deepEqual([limits.auxiliaryComponentLossesPersisted, limits.auxiliaryValidationMetricsPersisted], [false, false])],
  ["44 terminal values corroborating", () => assert.deepEqual([limits.trainerRuntimeSeconds.classification, limits.totalReportedTrainingLoss.classification], ["TERMINAL_ONLY_CORROBORATING_NOT_DURABLE_RUN_AUTHORITY", "TERMINAL_ONLY_CORROBORATING_NOT_DURABLE_RUN_AUTHORITY"])],
  ["45 retained checkpoints", () => assert.deepEqual(checkpoints.retained.map((row: Record<string, unknown>) => [row.epoch, row.modelSha256]), [[2, "37394daf66404b753c059262230192536a2d48c67f60a990d2f2c06944eeace7"], [3, "9c6f3e1033e5146bbd1eed3df6c68be2e2be9b1b5815afda3d41baa5a739ac3f"]])],
  ["46 retention cap", () => assert.deepEqual([checkpoints.retainedCount, checkpoints.maximumRetained], [2, 2])],
  ["47 epoch 3 selected", () => assert.deepEqual([checkpoints.selectedEpoch, checkpoints.selectionReason, checkpoints.tieBreakUsed], [3, "STRICTLY_HIGHEST_BINARY_VALIDATION_MACRO_F1", false])],
  ["48 no auxiliary selection", () => assert.equal(checkpoints.auxiliaryMetricsSelectionAuthority, false)],
  ["49 selected/final consistency", () => assert.deepEqual([checkpoints.selectedCheckpointModelSha256, checkpoints.finalModelSha256, checkpoints.finalModelMatchesSelectedCheckpoint], ["9c6f3e1033e5146bbd1eed3df6c68be2e2be9b1b5815afda3d41baa5a739ac3f", "9c6f3e1033e5146bbd1eed3df6c68be2e2be9b1b5815afda3d41baa5a739ac3f", true])],
  ["50 isolation zeros", () => assert.deepEqual([isolation.protectedInference, isolation.protectedRawTextAccesses, isolation.internalTestAccesses, isolation.externalBenchmarkAccesses, isolation.reserveUses, isolation.exclusionUses, isolation.thresholdSelections], [0,0,0,0,0,0,0])],
  ["51 threshold and production", () => assert.deepEqual([isolation.productionThresholdStatus, isolation.protectedEvaluationAuthorized, isolation.productionAuthorized], ["NOT_SELECTED", false, false])],
  ["52 certification execution zeros", () => assert.ok(Object.values(artifact.certificationExecution).every((value) => value === 0))],
  ["53 unsupported conclusions preserved", () => assert.ok(artifact.unsupportedConclusions.includes("PROVENANCE_RECOVERED") && artifact.unsupportedConclusions.includes("PRODUCTION_APPROVAL"))],
];
for (const [name, check] of checks) test(name, check);
test("54 deterministic reconstruction", () => assert.equal(canonicalJson(createMhsV2SuccessorLocalTrainingCertification(paths)), fs.readFileSync(artifactPath, "utf8")));
test("55 modified waiver rejected", () => { const clone = structuredClone(artifact); clone.provenanceWaiver.provenanceRecovered = true; assert.throws(() => validateMhsV2SuccessorLocalTrainingCertification(clone), /payload|waiver/u); });
test("56 publication replay refused", () => assert.throws(() => publishMhsV2SuccessorLocalTrainingCertification(artifact, training), /overwrite refused/u));
test("57 failed publication rolls back", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-t6l-8e-d-")); try { assert.throws(() => publishMhsV2SuccessorLocalTrainingCertification(artifact, directory, () => { throw new Error("injected"); }), /injected/u); assert.equal(fs.existsSync(path.join(directory, MHS_V2_SUCCESSOR_CERTIFICATION_FILENAME)), false); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("58 implementation contains no ML execution", () => { const source = fs.readFileSync(path.resolve(root, "src/research/textModerationDataset/mhsV2SuccessorLocalTrainingCertification.ts"), "utf8"); assert.doesNotMatch(source, /from_pretrained|trainer\.train|trainer\.evaluate|torch\./iu); });
