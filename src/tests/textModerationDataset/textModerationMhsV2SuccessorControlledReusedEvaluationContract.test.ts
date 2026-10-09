import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJson } from "../../research/textModerationDataset/manifest";
import {
  MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_FILENAME,
  MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_SHA256,
  MHS_V2_SUCCESSOR_REUSED_EVALUATION_OUTPUT_ROOT,
  MhsV2SuccessorReusedEvaluationContractArtifact,
  createMhsV2SuccessorReusedEvaluationContract,
  defaultMhsV2SuccessorReusedEvaluationContractPaths,
  publishMhsV2SuccessorReusedEvaluationContract,
  validateMhsV2SuccessorReusedEvaluationContract,
} from "../../research/textModerationDataset/mhsV2SuccessorControlledReusedEvaluationContract";
import { sha256FileStreaming } from "../../research/textModerationDataset/mhsV2SuccessorTrainingProvenanceRecovery";

const root = process.cwd(), paths = defaultMhsV2SuccessorReusedEvaluationContractPaths(root);
const outputDirectory = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/evaluation");
const artifactPath = path.join(outputDirectory, MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_FILENAME);
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as MhsV2SuccessorReusedEvaluationContractArtifact;
const authority = (name: string): Record<string, any> => artifact.authorities[name] as Record<string, any>;

const checks: readonly [string, () => void][] = [
  ["01 artifact validates", () => assert.doesNotThrow(() => validateMhsV2SuccessorReusedEvaluationContract(artifact))],
  ["02 status exact", () => assert.equal(artifact.status, "SUCCESSOR_CONTROLLED_REUSED_EVALUATION_CONTRACT_READY")],
  ["03 artifact SHA exact", () => assert.equal(sha256FileStreaming(artifactPath), MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_SHA256)],
  ["04 payload digest exact", () => assert.equal(artifact.contractPayloadDigest, MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_PAYLOAD_DIGEST)],
  ["05 publication canonical", () => assert.equal(fs.readFileSync(artifactPath, "utf8"), canonicalJson(artifact))],
  ["06 8F-A SHA and payload exact", () => assert.deepEqual([authority("methodology").sha256, authority("methodology").payloadDigest], ["62031d2a99fd89eb0280f15d3a96d740bd277422de4b271e30d61ef597377865", "aacdb93598825d9e5797441049daa8906a9cabd6438b15eb330c890d31eeaa54"])],
  ["07 8F-A status exact", () => assert.equal(authority("methodology").status, "CONTROLLED_REUSED_PROTECTED_COMPARISON_AUTHORIZED")],
  ["08 successor certification exact", () => assert.deepEqual([authority("successorCertification").sha256, authority("successorCertification").payloadDigest, authority("successorCertification").status], ["00e6877a52a07bcaa23c472246f316e645ceb260ea5fd90991e1b95497a0ac34", "2545404d8aac500431f2ff5658c46272762bfdbefeb2f2243ec35d74e137e7e7", "SUCCESSOR_TRAINING_RUN_CERTIFIED_WITH_PROVENANCE_WAIVER"])],
  ["09 provenance waiver exact", () => assert.deepEqual([artifact.provenanceWaiver.code, artifact.provenanceWaiver.provenanceRecovered, artifact.provenanceWaiver.exactHistoricalExecutedRunnerOrCustomModelBytesProven], ["MISSING_EXECUTED_SOURCE_BYTE_ATTESTATION", false, false])],
  ["10 successor model exact", () => assert.deepEqual([artifact.candidate.selectedEpoch, artifact.candidate.finalModelSha256, artifact.candidate.finalConfigSha256], [3, "9c6f3e1033e5146bbd1eed3df6c68be2e2be9b1b5815afda3d41baa5a739ac3f", "2f48155190967d11204a0ad87787a179e4ec0d708ac47e8730a1c8ed77f6ec78"])],
  ["11 base model exact", () => assert.deepEqual(artifact.candidate.baseModel, { repository: "FacebookAI/xlm-roberta-base", revision: "e73636d4f797dec63c3081bb6ed5c7b0bb3f2089", weightSha256: "6fd4797bc397c3b8b55d6bb5740366b57e6a3ce91c04c77f22aafc0c128e6feb" })],
  ["12 tokenizer exact", () => assert.deepEqual(artifact.candidate.tokenizer, { implementation: "XLMRobertaTokenizerFast", sha256: "a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c", authorityBindingSha256: "14e87b41020fe70b01b1dfcf4c3250bd2e4f0b49caeaa7c5f8bdc1376f00d654", finalBindingSha256: "151e78bcd3f3132a49671497baac2f7c8fa0af6808e6572a41b57b1d092a4629" })],
  ["13 INTERNAL_TEST authority exact", () => assert.deepEqual(authority("internalTest"), { sha256: "11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36", payloadDigest: "23392bc4123a36fff1c5969c9bf01f7736105fc853a6fffac8d280e78b7464cb", membershipDigest: "618fcec63bd963884e97efc353b2390f891f2c925103cca52be1f4df5180fd13", rows: 13, ALLOW: 9, BLOCK: 4 })],
  ["14 benchmark authority exact", () => assert.deepEqual(authority("benchmark"), { version: "STHN_TEXT_MODERATION_FIXTURES_V1R", sha256: "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747", rows: 140, ALLOW: 67, BLOCK: 73 })],
  ["15 first evaluation certification exact", () => assert.deepEqual([authority("firstEvaluationCertification").sha256, authority("firstEvaluationCertification").payloadDigest, authority("firstEvaluationCertification").status], ["8a08cb3cd8949b94013f5029003f4193842682b2119be71de394da4cee86c07a", "cdfcf7b5625dc038883bb7afe542de24447ee769a12dded535901898427ca943", "CONTROLLED_EVALUATION_CERTIFIED"])],
  ["16 first INTERNAL_TEST predictions exact", () => assert.deepEqual(authority("firstPredictionEvidence").INTERNAL_TEST, { relativePath: "evaluation-cache/text-moderation/classifier-evaluation/mhs-v2-xlm-roberta-first-controlled-evaluation-v1/internal-test/predictions.jsonl", sha256: "c535751b23fd6b51744c01245760d3c92361bb40e97d5e10ccdc16590192c7be", byteSize: 6053, rows: 13 })],
  ["17 first benchmark predictions exact", () => assert.deepEqual(authority("firstPredictionEvidence").EXTERNAL_BENCHMARK, { relativePath: "evaluation-cache/text-moderation/classifier-evaluation/mhs-v2-xlm-roberta-first-controlled-evaluation-v1/external-benchmark/predictions.jsonl", sha256: "4681515a84c42e633a5d22693c9fabf7d432719e31af452c2d7427c320c80743", byteSize: 78620, rows: 140 })],
  ["18 first prediction manifest exact", () => assert.equal(authority("firstPredictionEvidence").runManifestSha256, "e0d8bef728402d9efed635c31da67400d3ea095f38fd715aaa487fac14776718")],
  ["19 reused classification exact", () => assert.equal(artifact.classification.name, "CONTROLLED_REUSED_PROTECTED_COMPARISON")],
  ["20 fresh holdout false", () => assert.equal(artifact.classification.freshUnseenHoldout, false)],
  ["21 independent production estimate false", () => assert.equal(artifact.classification.independentProductionGeneralizationEstimate, false)],
  ["22 one cycle before exposure", () => assert.equal(artifact.reuseBudget.authorizedAdditionalSuccessorCyclesBeforeExposure, 1)],
  ["23 zero cycles after first exposure", () => assert.equal(artifact.reuseBudget.remainingAuthorizedSuccessorCyclesAfterFirstProtectedAccess, 0)],
  ["24 zero cycles after completion", () => assert.equal(artifact.reuseBudget.remainingAuthorizedSuccessorCyclesAfterSuccessfulCompletion, 0)],
  ["25 unlimited retries prohibited", () => assert.deepEqual([artifact.reuseBudget.unlimitedRetryAuthorized, artifact.retrySemantics.unlimitedFailedExecutionLoop], [false, false])],
  ["26 exposure start durable before loader", () => assert.equal(artifact.exposureSemantics.accessStartMustBeDurableBeforeLoaderInvocation, true)],
  ["27 exposure ledger excludes raw text", () => assert.equal(artifact.exposureSemantics.rawTextIncluded, false)],
  ["28 exposure events bind source candidate and cycle", () => assert.equal(artifact.exposureSemantics.sourceAndCandidateAndCycleBoundPerEvent, true)],
  ["29 pre-inference retry bounded", () => assert.match(artifact.retrySemantics.preInferenceFailure, /ZERO_SOURCE_ACCESS_EVENTS/u)],
  ["30 post-exposure recovery bounded", () => assert.deepEqual([artifact.retrySemantics.recoveryMayReaccessStartedSource, artifact.retrySemantics.postExposureFailure], [false, "NO_FRESH_RESTART_OR_NEW_OUTPUT_ROOT;_SEPARATELY_AUTHORIZED_IN_PLACE_RECOVERY_ONLY"])],
  ["31 completed replay refused", () => assert.equal(artifact.retrySemantics.completedReplay, "REFUSED")],
  ["32 CPU only", () => assert.equal(artifact.runtime.device, "CPU")],
  ["33 FP32 exact", () => assert.deepEqual([artifact.runtime.precision, artifact.runtime.mixedPrecision], ["FP32", false])],
  ["34 no gradients and evaluation mode", () => assert.deepEqual([artifact.runtime.gradients, artifact.runtime.evaluationMode, artifact.runtime.training], [false, true, false])],
  ["35 batch and workers exact", () => assert.deepEqual([artifact.runtime.batchSize, artifact.runtime.workers], [8, 0])],
  ["36 no GPU", () => assert.equal(artifact.runtime.gpuAuthorized, false)],
  ["37 no RAM gate", () => assert.deepEqual([artifact.ramPolicy.eligibilityGate, artifact.ramPolicy.resourceDiagnostics.authoritativeForEligibility, artifact.ramPolicy.warningMayBlock], ["NONE", false, false])],
  ["38 preprocessing exact", () => assert.deepEqual([artifact.preprocessing.maxLength, artifact.preprocessing.padding, artifact.preprocessing.truncation, artifact.preprocessing.exactUnicode], [160, "DYNAMIC_RIGHT", "DETERMINISTIC_RIGHT", true])],
  ["39 no text mutation", () => assert.ok([artifact.preprocessing.normalization, artifact.preprocessing.rewriting, artifact.preprocessing.translation, artifact.preprocessing.transliteration, artifact.preprocessing.augmentation, artifact.preprocessing.protectedTextMutation].every((value: unknown) => value === false))],
  ["40 binary-only observation", () => assert.equal(artifact.modelObservation.authorizedOutput, "BINARY_MODERATION_LOGITS_ONLY")],
  ["41 auxiliary observation prohibited", () => assert.deepEqual([artifact.modelObservation.auxiliaryHeadObservation, artifact.modelObservation.persistAuxiliaryLogits, artifact.modelObservation.persistAuxiliaryScores, artifact.modelObservation.persistAuxiliaryPredictions, artifact.modelObservation.auxiliaryMetrics], ["PROHIBITED", false, false, false, false])],
  ["42 unavoidable auxiliary computation transient only", () => assert.equal(artifact.modelObservation.auxiliaryTensorInternalComputationIfArchitecturallyUnavoidable, "TRANSIENT_ONLY_NOT_READ_RETURNED_LOGGED_PERSISTED_OR_USED")],
  ["43 binary argmax exact", () => assert.equal(artifact.decisionAndScores.rule, "ARGMAX_ALLOW_LOGIT_BLOCK_LOGIT")],
  ["44 tie resolves ALLOW", () => assert.deepEqual([artifact.decisionAndScores.labels, artifact.decisionAndScores.tieRule], [{ ALLOW: 0, BLOCK: 1 }, "LOWEST_LABEL_INDEX_ALLOW"])],
  ["45 threshold not used", () => assert.deepEqual([artifact.decisionAndScores.thresholdControlsDecision, artifact.thresholdPolicy.productionStatus], [false, "NOT_SELECTED"])],
  ["46 score semantics exact", () => assert.deepEqual([artifact.decisionAndScores.scoreLabel, artifact.decisionAndScores.confidenceClaimAuthorized], ["UNCALIBRATED_MODEL_SCORE", false])],
  ["47 row schema exact", () => assert.deepEqual(artifact.rowLevelOutput.requiredFields, ["source", "exampleId", "textSha256", "trueDecision", "trueTarget", "predictedDecision", "predictedTarget", "allowLogit", "blockLogit", "allowScore", "blockScore", "correct", "truncated", "metadata"])],
  ["48 raw text forbidden", () => assert.ok(artifact.rowLevelOutput.forbiddenFields.includes("text") && artifact.rowLevelOutput.forbiddenFields.includes("rawText"))],
  ["49 auxiliary output forbidden", () => assert.ok(artifact.rowLevelOutput.forbiddenFields.includes("auxiliaryLogits") && artifact.rowLevelOutput.forbiddenFields.includes("auxiliaryPrediction"))],
  ["50 representations forbidden", () => assert.ok(["embeddings", "hiddenStates", "tokenIds", "attentionTensors", "gradients"].every((field) => artifact.rowLevelOutput.forbiddenFields.includes(field)))],
  ["51 paired keys exact", () => assert.deepEqual(artifact.pairedComparison.joinKeys, ["SOURCE", "EXAMPLE_ID", "TEXT_SHA256", "TRUE_TARGET"])],
  ["52 first model not rerun", () => assert.equal(artifact.firstCandidateComparison.rerunFirstModel, false)],
  ["53 primary metrics exact", () => assert.deepEqual(artifact.metrics.PRIMARY, ["BENCHMARK_PAIRED_TRANSITIONS", "BENCHMARK_MACRO_F1_DELTA", "BENCHMARK_BALANCED_ACCURACY_DELTA", "BENCHMARK_BLOCK_RECALL_DELTA", "BENCHMARK_FALSE_NEGATIVE_DELTA", "BENCHMARK_FALSE_POSITIVE_DELTA"])],
  ["54 secondary metrics frozen", () => assert.equal(artifact.metrics.SECONDARY.length, 4)],
  ["55 diagnostic metrics frozen", () => assert.equal(artifact.metrics.DIAGNOSTIC.length, 4)],
  ["56 delta directions explicit", () => assert.deepEqual([artifact.pairedComparison.rateAndScoreDeltaDirection, artifact.pairedComparison.errorCountDeltaDirection, artifact.pairedComparison.errorDeltaInterpretation.negativeFalseNegativeDelta], ["SUCCESSOR_MINUS_FIRST", "SUCCESSOR_MINUS_FIRST", "FEWER_FALSE_NEGATIVES"])],
  ["57 category policy exact", () => assert.deepEqual(artifact.slicePolicies.category.denominators, { ABUSIVE_OR_HARASSING: 11, HATE: 10, OTHER_INAPPROPRIATE: 5, PROFANITY: 4, SEXUAL: 18, THREAT_OR_VIOLENCE: 25 })],
  ["58 difficulty groups exact", () => assert.deepEqual(artifact.slicePolicies.difficulty.groups, ["ADVERSARIAL", "CONTEXTUAL", "EASY"])],
  ["59 language groups exact", () => assert.deepEqual(artifact.slicePolicies.language.groups, ["en", "en-hi", "hi", "hi-Latn", "th"])],
  ["60 descriptive statistics only", () => assert.deepEqual([artifact.statisticalPolicy.classification, artifact.statisticalPolicy.bootstrapConfidenceIntervals, artifact.statisticalPolicy.mcnemarTest, artifact.statisticalPolicy.pValues], ["DESCRIPTIVE_PAIRED_COMPARISON_ONLY", false, false, false])],
  ["61 pooled score prohibited", () => assert.equal(artifact.interpretation.pooled153RowMetric, false)],
  ["62 no quality threshold or winner rule", () => assert.deepEqual([artifact.thresholdPolicy.qualityPassFailThreshold, artifact.thresholdPolicy.globalWinnerRule], [null, null])],
  ["63 production unauthorized", () => assert.ok(artifact.interpretation.prohibitedClaims.includes("PRODUCTION_APPROVAL"))],
  ["64 no new manual data required", () => assert.equal(artifact.futureConsequences.newManualDatasetOrReviewRequired, false)],
  ["65 failure policy fail closed", () => assert.ok(artifact.failureSemantics.failClosedOn.includes("FIRST_PREDICTION_JOIN_MISMATCH") && artifact.failureSemantics.failClosedOn.includes("EXPOSURE_LEDGER_FAILURE") && artifact.failureSemantics.silentlySkipRows === false)],
  ["66 atomic completion exact", () => assert.deepEqual([artifact.publicationSemantics.artifactWrites, artifact.publicationSemantics.completionCommitAuthority, artifact.publicationSemantics.overwriteRefused], ["TEMPORARY_THEN_ATOMIC_RENAME", "COMPLETED_LIFECYCLE_PUBLISHED_LAST", true])],
  ["67 execution counters zero", () => assert.ok(Object.values(artifact.boundaries).every((value) => value === 0))],
  ["68 deterministic output root exact", () => assert.equal(artifact.evaluationCycle.outputRoot, MHS_V2_SUCCESSOR_REUSED_EVALUATION_OUTPUT_ROOT)],
];
for (const [name, check] of checks) test(name, check);

test("69 deterministic reconstruction equals publication", () => assert.equal(canonicalJson(createMhsV2SuccessorReusedEvaluationContract(paths)), fs.readFileSync(artifactPath, "utf8")));
test("70 changed classification rejected", () => { const clone = structuredClone(artifact); clone.classification.freshUnseenHoldout = true; assert.throws(() => validateMhsV2SuccessorReusedEvaluationContract(clone), /payload|boundary/u); });
test("71 changed reuse budget rejected", () => { const clone = structuredClone(artifact); clone.reuseBudget.authorizedAdditionalSuccessorCyclesBeforeExposure = 2; assert.throws(() => validateMhsV2SuccessorReusedEvaluationContract(clone), /payload|boundary/u); });
test("72 upstream authority mutation fails closed", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-t6l-8f-b-upstream-")); try { const changed = path.join(directory, "methodology.json"); fs.copyFileSync(paths.methodology, changed); fs.appendFileSync(changed, " "); assert.throws(() => createMhsV2SuccessorReusedEvaluationContract({ ...paths, methodology: changed }), /SHA mismatch/u); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("73 publication replay refused", () => assert.throws(() => publishMhsV2SuccessorReusedEvaluationContract(artifact, outputDirectory), /overwrite refused/u));
test("74 failed publication rolls back", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-t6l-8f-b-publish-")); try { assert.throws(() => publishMhsV2SuccessorReusedEvaluationContract(artifact, directory, () => { throw new Error("injected"); }), /injected/u); assert.equal(fs.existsSync(path.join(directory, MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_FILENAME)), false); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("75 implementation contains no model execution", () => { const source = fs.readFileSync(path.resolve(root, "src/research/textModerationDataset/mhsV2SuccessorControlledReusedEvaluationContract.ts"), "utf8"); assert.doesNotMatch(source, /from_pretrained|AutoModel|trainer\.train|trainer\.evaluate|torch|forward\s*\(/iu); });
