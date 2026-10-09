import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJson } from "../../research/textModerationDataset/manifest";
import {
  MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_FILENAME,
  MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_SHA256,
  MhsV2SuccessorReusedEvaluationPreparationArtifact,
  createMhsV2SuccessorReusedEvaluationPreparation,
  defaultMhsV2SuccessorReusedEvaluationPreparationPaths,
  publishMhsV2SuccessorReusedEvaluationPreparation,
  validateMhsV2SuccessorReusedEvaluationPreparation,
} from "../../research/textModerationDataset/mhsV2SuccessorControlledReusedEvaluationPreparation";
import { sha256FileStreaming } from "../../research/textModerationDataset/mhsV2SuccessorTrainingProvenanceRecovery";

const root = process.cwd();
const paths = defaultMhsV2SuccessorReusedEvaluationPreparationPaths(root);
const authorityDirectory = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/evaluation");
const artifactPath = path.join(authorityDirectory, MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_FILENAME);
const outputRoot = path.resolve(root, "evaluation-cache/text-moderation/classifier-evaluation/mhs-v2-xlm-roberta-category-aware-reused-protected-evaluation-v1");
const completedLifecycle = path.join(outputRoot, "run/lifecycle.json"), completedLedger = path.join(outputRoot, "run/protected-exposure-ledger.jsonl");
const assertCompletedExposureUnchanged = (): void => { const lifecycle = JSON.parse(fs.readFileSync(completedLifecycle, "utf8")) as Record<string, unknown>; assert.deepEqual([lifecycle.status, lifecycle.cycleId], ["COMPLETED", "mhs-v2-successor-reused-protected-evaluation-cycle-v1-51ce8fb5f4cc29a4f6fed21f"]); assert.equal(sha256FileStreaming(completedLedger), "ae9e3de88f1321e85a48b6aac97baa1dfc747af1bf1d57b7c06068aa13c3d31b"); };
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as MhsV2SuccessorReusedEvaluationPreparationArtifact;
const runner = fs.readFileSync(paths.runner, "utf8");
const bridge = fs.readFileSync(paths.protectedBridge, "utf8");
const model = fs.readFileSync(paths.modelAdapter, "utf8");

const checks: readonly [string, () => void][] = [
  ["01 artifact validates", () => assert.doesNotThrow(() => validateMhsV2SuccessorReusedEvaluationPreparation(artifact))],
  ["02 status exact", () => assert.equal(artifact.status, "LOCAL_SUCCESSOR_CONTROLLED_REUSED_EVALUATION_READY")],
  ["03 artifact SHA exact", () => assert.equal(sha256FileStreaming(artifactPath), MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_SHA256)],
  ["04 payload exact", () => assert.equal(artifact.preparationPayloadDigest, MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_PAYLOAD_DIGEST)],
  ["05 canonical publication", () => assert.equal(fs.readFileSync(artifactPath, "utf8"), canonicalJson(artifact))],
  ["06 8F-A binding", () => assert.deepEqual(artifact.authorities.methodology, { sha256: "62031d2a99fd89eb0280f15d3a96d740bd277422de4b271e30d61ef597377865", payloadDigest: "aacdb93598825d9e5797441049daa8906a9cabd6438b15eb330c890d31eeaa54" })],
  ["07 8F-B binding", () => assert.deepEqual(artifact.authorities.contract, { sha256: "5c0053213dc3993424ab687d2800f2ed9716ba7f10dfbaa34fd863f5afaecb02", payloadDigest: "0dfdcf4e0746d1c6a39acc4530c40780d59cf9f7471bc7361893db003a875d59" })],
  ["08 certification binding", () => assert.equal(artifact.authorities.successorCertification.sha256, "00e6877a52a07bcaa23c472246f316e645ceb260ea5fd90991e1b95497a0ac34")],
  ["09 waiver remains unrecovered", () => assert.deepEqual([artifact.authorities.d0.sha256, artifact.authorities.d0w.sha256], ["494555916a7f0db88a5112fabcc078b48eea8cd8b2990ac863cc1a997bc32681", "ae4d33fc9e43cd6d7c23ab4a4302855c9eed2ba1fca638a5137ebf1d1148c29b"])],
  ["10 model binding", () => assert.equal(artifact.authorities.successorModelSha256, "9c6f3e1033e5146bbd1eed3df6c68be2e2be9b1b5815afda3d41baa5a739ac3f")],
  ["11 tokenizer authority file binding", () => assert.deepEqual([sha256FileStreaming(paths.tokenizer), artifact.authorities.tokenizerSha256], ["a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c", "a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c"])],
  ["12 tokenizer binding file binding", () => assert.deepEqual([sha256FileStreaming(paths.tokenizerBinding), artifact.authorities.tokenizerBindingSha256], ["14e87b41020fe70b01b1dfcf4c3250bd2e4f0b49caeaa7c5f8bdc1376f00d654", "14e87b41020fe70b01b1dfcf4c3250bd2e4f0b49caeaa7c5f8bdc1376f00d654"])],
  ["13 final tokenizer binding", () => assert.equal(sha256FileStreaming(paths.finalTokenizerBinding), artifact.authorities.finalTokenizerBindingSha256)],
  ["14 first prediction hashes full", () => assert.deepEqual(artifact.authorities.firstPredictionEvidence, { runManifestSha256: "e0d8bef728402d9efed635c31da67400d3ea095f38fd715aaa487fac14776718", internalTestSha256: "c535751b23fd6b51744c01245760d3c92361bb40e97d5e10ccdc16590192c7be", internalTestRows: 13, benchmarkSha256: "4681515a84c42e633a5d22693c9fabf7d432719e31af452c2d7427c320c80743", benchmarkRows: 140 })],
  ["15 cycle exact", () => assert.equal(artifact.cycle.id, "mhs-v2-successor-reused-protected-evaluation-cycle-v1-51ce8fb5f4cc29a4f6fed21f")],
  ["16 preparation records then-unused exact output root", () => assert.deepEqual([artifact.cycle.outputRoot, artifact.cycle.outputRootUnusedAtPreparation], ["evaluation-cache/text-moderation/classifier-evaluation/mhs-v2-xlm-roberta-category-aware-reused-protected-evaluation-v1", true])],
  ["17 source order exact", () => assert.deepEqual(artifact.cycle.sourceOrder, ["INTERNAL_TEST", "EXTERNAL_BENCHMARK"])],
  ["18 CLI bounded", () => assert.deepEqual(artifact.execution.modes, ["--preflight", "--self-test", "--execute-authorized-local-run"])],
  ["19 arbitrary overrides refused", () => assert.equal(artifact.execution.arbitraryOverridesAccepted, false)],
  ["20 CPU FP32 runtime", () => assert.deepEqual([artifact.runtime.device, artifact.runtime.precision, artifact.runtime.batchSize, artifact.runtime.workers], ["CPU", "FP32", 8, 0])],
  ["21 no training runtime", () => assert.deepEqual([artifact.runtime.modelEval, artifact.runtime.gradients, artifact.runtime.training, artifact.runtime.optimizer, artifact.runtime.scheduler], [true, false, false, null, null])],
  ["22 no RAM gate", () => assert.deepEqual([artifact.resourcePolicy.ramEligibilityGate, artifact.resourcePolicy.diagnosticsAuthoritativeForEligibility, artifact.resourcePolicy.lowRamWarningMayBlock], ["NONE", false, false])],
  ["23 preprocessing frozen", () => assert.deepEqual([artifact.preprocessing.exactUnicode, artifact.preprocessing.maxLength, artifact.preprocessing.padding, artifact.preprocessing.truncation], [true, 160, "DYNAMIC_RIGHT", "DETERMINISTIC_RIGHT"])],
  ["24 preprocessing mutation absent", () => assert.ok([artifact.preprocessing.normalization, artifact.preprocessing.rewriting, artifact.preprocessing.translation, artifact.preprocessing.transliteration, artifact.preprocessing.augmentation, artifact.preprocessing.mutation].every((value: unknown) => value === false))],
  ["25 binary output only", () => assert.equal(artifact.modelObservation.binaryOutputOnly, true)],
  ["26 auxiliary transient and unobserved", () => assert.deepEqual([artifact.modelObservation.auxiliaryComputation, artifact.modelObservation.auxiliaryObservation, artifact.modelObservation.auxiliaryReturned, artifact.modelObservation.auxiliaryPersisted], ["TRANSIENT_UNOBSERVED_IF_ARCHITECTURALLY_UNAVOIDABLE", "PROHIBITED", false, false])],
  ["27 adapter returns binary logits", () => assert.match(model, /SequenceClassifierOutput\([\s\S]*?logits=binary_logits/u)],
  ["28 runner observes only logits", () => { assert.match(runner, /model\(\*\*encoded\)\.logits/u); assert.doesNotMatch(runner, /auxiliary_logits.*(?:cpu|tolist|numpy|softmax|argmax)/iu); }],
  ["29 existing protected loader delegated", () => assert.match(bridge, /mhsV2ProtectedEvaluationSources/u)],
  ["30 bridge contains no direct fixture reader", () => assert.doesNotMatch(bridge, /textModerationFixtures/u)],
  ["31 raw text remains transient", () => assert.deepEqual([artifact.protectedBoundary.runnerDirectSourceFileAccess, artifact.protectedBoundary.rawTextPrintedLoggedPersistedOrIncludedInErrors], [false, false])],
  ["32 durable access precedes bridge", () => assert.ok(runner.indexOf("append_event(ledger, access_event)") < runner.indexOf("load_protected_source(preflight, source)"))],
  ["33 preflight and self-test protected free", () => assert.deepEqual([artifact.protectedBoundary.preflightProtectedAccess, artifact.protectedBoundary.selfTestProtectedAccess], [false, false])],
  ["34 one cycle then zero", () => assert.deepEqual([artifact.cycle.authorizedCyclesBeforeAccess, artifact.cycle.remainingAfterFirstAccess], [1, 0])],
  ["35 pre-exposure retry bounded", () => assert.deepEqual([artifact.retryAndRecovery.preExposureSameCycleRetry, artifact.retryAndRecovery.requiresDurableZeroAccessProof], [true, true])],
  ["36 post-exposure fresh retry refused", () => assert.deepEqual([artifact.retryAndRecovery.postExposureAutomaticRetry, artifact.retryAndRecovery.postExposureFreshRoot, artifact.retryAndRecovery.postExposureCycleReset], [false, false, false])],
  ["37 lifecycle completion last", () => assert.equal(artifact.lifecycle.completedPublishedLast, true)],
  ["38 exposure never erased", () => assert.equal(artifact.lifecycle.exposureNeverErased, true)],
  ["39 paired key exact", () => assert.deepEqual(artifact.comparison.pairedJoinKeys, ["SOURCE", "EXAMPLE_ID", "TEXT_SHA256", "TRUE_TARGET"])],
  ["40 first model not rerun", () => assert.equal(artifact.comparison.firstModelRerun, false)],
  ["41 source artifacts sealed separately", () => assert.deepEqual(artifact.outputs.sourceArtifacts, ["PREDICTIONS_JSONL", "METRICS_JSON", "PAIRED_COMPARISON_JSON"])],
  ["42 no pooled metric", () => assert.equal(artifact.outputs.pooledMetric, false)],
  ["43 statistics descriptive", () => assert.equal(artifact.outputs.statistics, "DESCRIPTIVE_PAIRED_COMPARISON_ONLY")],
  ["44 threshold not selected", () => assert.equal(artifact.outputs.threshold, "NOT_SELECTED")],
  ["45 production unauthorized", () => assert.equal(artifact.outputs.productionAuthorized, false)],
  ["46 source self-attestation before access", () => assert.equal(artifact.provenanceSelfAttestation.beforeProtectedAccess, true)],
  ["47 manifest directly binds preparation and sources", () => assert.ok(artifact.provenanceSelfAttestation.runManifestDirectlyBinds.includes("PREPARATION_SHA_AND_PAYLOAD") && artifact.provenanceSelfAttestation.runManifestDirectlyBinds.includes("RUNNER_SHA") && artifact.provenanceSelfAttestation.runManifestDirectlyBinds.includes("PROTECTED_BRIDGE_SHA"))],
  ["48 preparation counters", () => assert.deepEqual(artifact.boundaries, { realModelLoads: 0, realForwardPasses: 0, syntheticMockForwardPasses: 20, trainingRuns: 0, newProtectedInference: 0, protectedRawTextAccesses: 0, realExposureEventsWritten: 0, thresholdSelections: 0, reserveUses: 0, exclusionUses: 0 })],
  ["49 synthetic suite evidence", () => assert.deepEqual([artifact.testEvidence.syntheticRows, artifact.testEvidence.syntheticMockForwardPasses, artifact.testEvidence.syntheticSelfTestPassed], [153, 20, true])],
  ["50 local command exact", () => assert.equal(artifact.execution.localCommand, "cd D:\\StHn\\backend && npm run evaluate:text-moderation:mhs-v2-successor-local")],
];
for (const [name, check] of checks) test(name, check);

test("51 deterministic reconstruction equals publication", () => assert.equal(canonicalJson(createMhsV2SuccessorReusedEvaluationPreparation(paths, { syntaxCheckPassed: true, syntheticSelfTestPassed: true, protectedFreePreflightPassed: true })), fs.readFileSync(artifactPath, "utf8")));
test("52 immutable replay refused", () => assert.throws(() => publishMhsV2SuccessorReusedEvaluationPreparation(artifact, authorityDirectory), /overwrite refused/u));
test("53 failed publication rolls back", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-t6l-8f-c-publish-")); try { assert.throws(() => publishMhsV2SuccessorReusedEvaluationPreparation(artifact, directory, () => { throw new Error("injected"); }), /injected/u); assert.equal(fs.existsSync(path.join(directory, MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_FILENAME)), false); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("54 swapped tokenizer paths fail closed without changing completed exposure", () => { assert.throws(() => createMhsV2SuccessorReusedEvaluationPreparation({ ...paths, tokenizer: paths.tokenizerBinding, tokenizerBinding: paths.tokenizer }, { syntaxCheckPassed: true, syntheticSelfTestPassed: true, protectedFreePreflightPassed: true }), /tokenizer SHA mismatch/u); assertCompletedExposureUnchanged(); });
test("55 incorrect tokenizer binding fails closed without changing completed exposure", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-t6l-8f-c-tokenizer-")); try { const changed = path.join(directory, "tokenizer-binding.json"); fs.copyFileSync(paths.tokenizerBinding, changed); fs.appendFileSync(changed, " "); assert.throws(() => createMhsV2SuccessorReusedEvaluationPreparation({ ...paths, tokenizerBinding: changed }, { syntaxCheckPassed: true, syntheticSelfTestPassed: true, protectedFreePreflightPassed: true }), /tokenizer binding SHA mismatch/u); assertCompletedExposureUnchanged(); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("56 source attestation mutation fails closed without changing completed exposure", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-t6l-8f-c-runner-")); try { const changed = path.join(directory, "runner.py"); fs.copyFileSync(paths.runner, changed); fs.appendFileSync(changed, "# changed\n"); assert.throws(() => createMhsV2SuccessorReusedEvaluationPreparation({ ...paths, runner: changed }, { syntaxCheckPassed: true, syntheticSelfTestPassed: true, protectedFreePreflightPassed: true }), /runner SHA mismatch/u); assertCompletedExposureUnchanged(); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("57 model mutation fails closed without changing completed exposure", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-t6l-8f-c-model-")); try { const changed = path.join(directory, "model.safetensors"); fs.copyFileSync(paths.model, changed); fs.appendFileSync(changed, "x"); assert.throws(() => createMhsV2SuccessorReusedEvaluationPreparation({ ...paths, model: changed }, { syntaxCheckPassed: true, syntheticSelfTestPassed: true, protectedFreePreflightPassed: true }), /model SHA mismatch/u); assertCompletedExposureUnchanged(); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("58 authoritative completed exposure evidence remains exact", assertCompletedExposureUnchanged);
test("59 low reported RAM cannot fail eligibility", () => { assert.match(runner, /"authoritativeForEligibility": False/u); assert.doesNotMatch(runner, /psutil|virtual_memory|MemAvailable|minimumAvailableRam|minimumTotalRam|ramThreshold|memoryThreshold/iu); });
