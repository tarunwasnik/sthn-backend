import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJson } from "../../research/textModerationDataset/manifest";
import { sha256FileStreaming } from "../../research/textModerationDataset/mhsV2ControlledEvaluationCertification";
import { MHS_V2_AUXILIARY_CATEGORIES, MHS_V2_AUXILIARY_WEIGHT, MHS_V2_SUCCESSOR_CONTRACT_FILENAME, MHS_V2_SUCCESSOR_CONTRACT_PAYLOAD_DIGEST, MHS_V2_SUCCESSOR_CONTRACT_SHA256, MHS_V2_SUCCESSOR_OUTPUT_ROOT, MHS_V2_SUCCESSOR_SEED, MHS_V2_SUCCESSOR_SEED_STRING, MHS_V2_SUCCESSOR_STRATEGY_FILENAME, MHS_V2_SUCCESSOR_STRATEGY_PAYLOAD_DIGEST, MHS_V2_SUCCESSOR_STRATEGY_SHA256, createMhsV2SuccessorTrainingArtifacts, defaultMhsV2SuccessorPaths, publishMhsV2SuccessorTrainingArtifacts, validateMhsV2SuccessorContract, validateMhsV2SuccessorStrategy } from "../../research/textModerationDataset/mhsV2SuccessorTrainingContract";

const root = process.cwd(), paths = defaultMhsV2SuccessorPaths(root), artifacts = createMhsV2SuccessorTrainingArtifacts(paths), strategy = artifacts.strategy, contract = artifacts.contract, trainingDirectory = path.dirname(paths.diagnostic);
const readRows = (filename: string): Record<string, unknown>[] => fs.readFileSync(filename, "utf8").trim().split(/\r?\n/u).map((line) => JSON.parse(line) as Record<string, unknown>);
const train = readRows(paths.train), validation = readRows(paths.validation), projection = readRows(paths.projection), projected = new Map(projection.map((row) => [row.exampleId, row]));
const checks: readonly [string, () => void][] = [
  ["01 exact 8E-A binding", () => assert.deepEqual(contract.authorities.postEvaluationDiagnostic, { sha256: "edec2e9cfff145e02ac3dc5d3addc18eeb4983a4d2b670638be519da28d88dd5", payloadDigest: "c7cb4839792e2fade4e9ffd4f5a4b01cc40d9c83f64dc10bac90f100dc394d1a" })],
  ["02 exact 8D-D binding", () => assert.deepEqual(contract.authorities.controlledEvaluationCertification, { sha256: "8a08cb3cd8949b94013f5029003f4193842682b2119be71de394da4cee86c07a", payloadDigest: "cdfcf7b5625dc038883bb7afe542de24447ee769a12dded535901898427ca943" })],
  ["03 exact first training binding", () => assert.equal(contract.authorities.firstTrainingCertification.sha256, "43905ea77b4b00cc6d39603f4a6b92480abe796bd547d0109479579270e1372a")],
  ["04 exact release", () => assert.equal(contract.authorities.release.sha256, "a001c63cf1d4674d9dcad89c9e630348ce3e1461a6e8cd12971b813724e65ec7")],
  ["05 exact eligibility", () => assert.equal(contract.authorities.eligibility.sha256, "1201be0665a82b03ab9e056e8bad16737afaf8cf6159602fde3ecf8cf00d7649")],
  ["06 exact TRAIN", () => assert.equal(contract.authorities.train.sha256, "fa9eaeb3fa519ded246bffda1fb57902ca2fcae4c64fb10968d430fab4a4bf74")],
  ["07 exact VALIDATION", () => assert.equal(contract.authorities.validation.sha256, "5c01425c9c7e6e1f4348e38a98eaf1740898c3ba98f2bb6114d77175631b0d29")],
  ["08 exact tokenizer", () => assert.equal(contract.authorities.tokenizerSha256, "a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c")],
  ["09 exact projection", () => assert.equal(contract.authorities.developmentProjection.sha256, "1d2e92c67660998ea5149abd7c572170f5bc4fb1594cfc3276b412d3caa02e18")],
  ["10 TRAIN 200", () => assert.equal(strategy.dataEvidence.train.rows, 200)],
  ["11 TRAIN labels", () => assert.deepEqual([strategy.dataEvidence.train.ALLOW, strategy.dataEvidence.train.BLOCK], [110, 90])],
  ["12 TRAIN origin", () => assert.deepEqual([strategy.dataEvidence.train.historical, strategy.dataEvidence.train.v2], [60, 140])],
  ["13 TRAIN categories", () => assert.deepEqual(strategy.dataEvidence.train.blockPrimaryCategory, { ABUSIVE_OR_HARASSING: 18, HATE: 16, PROFANITY: 23, SEXUAL: 18, THREAT_OR_VIOLENCE: 15 })],
  ["14 VALIDATION categories", () => assert.deepEqual(strategy.dataEvidence.validation.blockPrimaryCategory, { HATE: 1, PROFANITY: 1, SEXUAL: 1, THREAT_OR_VIOLENCE: 1 })],
  ["15 no reserve", () => assert.equal(contract.data.reserveAuthorized, false)],
  ["16 no exclusion", () => assert.equal(contract.data.exclusionsAuthorized, false)],
  ["17 stable join all rows", () => assert.equal(strategy.dataEvidence.categoryJoin.matchedRows, 213)],
  ["18 stable join unique", () => assert.equal(strategy.dataEvidence.categoryJoin.duplicateIds, 0)],
  ["19 no raw text join", () => assert.equal(strategy.dataEvidence.categoryJoin.rawTextEqualityUsed, false)],
  ["20 projection identities unique", () => assert.equal(projected.size, 213)],
  ["21 row binding exact", () => [...train, ...validation].forEach((row) => { const source = projected.get(row.exampleId); assert.ok(source); assert.deepEqual([source?.candidateTextDigest, source?.decision, source?.primaryCategory, source?.split, source?.origin], [row.candidateTextDigest, row.decision, row.primaryCategory, row.split, row.origin]); })],
  ["22 ALLOW masked", () => assert.equal(contract.objectives.auxiliary.allowRowsEligible, false)],
  ["23 supported BLOCK eligible", () => assert.equal(contract.objectives.auxiliary.eligible, "TARGET_BLOCK_AND_PRIMARY_CATEGORY_IN_SUPPORTED_MAPPING")],
  ["24 missing category masked", () => assert.equal(contract.objectives.auxiliary.missingCategoryEligible, false)],
  ["25 unsupported category masked", () => assert.equal(contract.objectives.auxiliary.unsupportedCategoryEligible, false)],
  ["26 OTHER zero support excluded", () => assert.deepEqual([strategy.dataEvidence.otherInappropriate.trainSupport, contract.objectives.auxiliary.otherInappropriateIncluded], [0, false])],
  ["27 category mapping deterministic", () => assert.deepEqual(contract.objectives.auxiliary.category2id, { ABUSIVE_OR_HARASSING: 0, HATE: 1, PROFANITY: 2, SEXUAL: 3, THREAT_OR_VIOLENCE: 4 })],
  ["28 category list frozen", () => assert.deepEqual([...MHS_V2_AUXILIARY_CATEGORIES], Object.keys(contract.objectives.auxiliary.category2id))],
  ["29 primary mapping unchanged", () => assert.deepEqual(contract.objectives.primary.label2id, { ALLOW: 0, BLOCK: 1 })],
  ["30 primary applies all rows", () => assert.equal(contract.objectives.primary.appliesTo, "ALL_TRAIN_ROWS")],
  ["31 auxiliary weight", () => assert.equal(contract.objectives.auxiliary.weight, MHS_V2_AUXILIARY_WEIGHT)],
  ["32 auxiliary weight authority", () => assert.equal(contract.objectives.auxiliary.weightAuthority, "FIRST_CONTROLLED_AUXILIARY_WEIGHT")],
  ["33 natural sampling", () => assert.equal(contract.sampling.policy, "NATURAL_SEEDED_RANDOM_WITHOUT_REPLACEMENT")],
  ["34 no rebalancing", () => assert.deepEqual([contract.sampling.categoryRebalancing, contract.sampling.oversampling, contract.sampling.classWeighting], [false, false, "NONE"])],
  ["35 original base initialization", () => assert.equal(contract.initialization.source, "ORIGINAL_PINNED_XLM_ROBERTA_BASE_NOT_FIRST_CANDIDATE")],
  ["36 base model frozen", () => assert.deepEqual([contract.initialization.repository, contract.initialization.revision], ["FacebookAI/xlm-roberta-base", "e73636d4f797dec63c3081bb6ed5c7b0bb3f2089"])],
  ["37 deterministic heads", () => assert.deepEqual([contract.initialization.binaryHead, contract.initialization.auxiliaryHead, contract.initialization.initializerRange], ["DETERMINISTIC_TRANSFORMERS_NORMAL_STD_0_02_ZERO_BIAS", "DETERMINISTIC_TRANSFORMERS_NORMAL_STD_0_02_ZERO_BIAS", 0.02])],
  ["38 preprocessing unchanged", () => assert.deepEqual([contract.preprocessing.maxLength, contract.preprocessing.padding, contract.preprocessing.truncation, contract.preprocessing.exactUnicode], [160, "DYNAMIC_LONGEST_IN_BATCH_RIGHT", "DETERMINISTIC_RIGHT", true])],
  ["39 optimizer frozen", () => assert.equal(contract.optimization.optimizer, "ADAMW_TORCH")],
  ["40 learning rate frozen", () => assert.equal(contract.optimization.learningRate, 2e-5)],
  ["41 batch frozen", () => assert.deepEqual([contract.optimization.trainPhysicalBatchSize, contract.optimization.gradientAccumulationSteps, contract.optimization.effectiveBatchSize], [8, 1, 8])],
  ["42 epochs frozen", () => assert.equal(contract.optimization.epochs, 3)],
  ["43 scheduler warmup frozen", () => assert.deepEqual([contract.optimization.scheduler, contract.optimization.warmupSteps], ["LINEAR_DECAY", 2])],
  ["44 gradient clipping frozen", () => assert.equal(contract.optimization.maxGradientNorm, 1)],
  ["45 seed string", () => assert.equal(contract.reproducibility.seedString, MHS_V2_SUCCESSOR_SEED_STRING)],
  ["46 seed integer", () => assert.equal(contract.reproducibility.seedInteger, MHS_V2_SUCCESSOR_SEED)],
  ["47 seed derivation", () => assert.equal(parseInt(crypto.createHash("sha256").update(MHS_V2_SUCCESSOR_SEED_STRING).digest("hex").slice(0, 8), 16), MHS_V2_SUCCESSOR_SEED)],
  ["48 checkpoint cadence", () => assert.deepEqual([contract.checkpoints.cadence, contract.checkpoints.planned, contract.checkpoints.maximumRetained], ["ONCE_PER_EPOCH", 3, 2])],
  ["49 development-only selection", () => assert.deepEqual(contract.checkpoints.selection, ["HIGHEST_VALIDATION_BINARY_MACRO_F1", "LOWEST_VALIDATION_BINARY_LOSS", "EARLIEST_EPOCH"])],
  ["50 auxiliary metrics diagnostic only", () => assert.equal(contract.checkpoints.auxiliaryMetrics, "DIAGNOSTIC_ONLY_NOT_SELECTION_AUTHORITY")],
  ["51 CPU frozen", () => assert.deepEqual([contract.runtime.device, contract.runtime.gpuAuthorized], ["CPU_REQUIRED", false])],
  ["52 no RAM gate", () => assert.equal(contract.runtime.ramEligibilityGate, "NONE")],
  ["53 output root distinct", () => assert.deepEqual([contract.output.root, contract.output.distinctFromFirstRun], [MHS_V2_SUCCESSOR_OUTPUT_ROOT, true])],
  ["54 no runner", () => assert.equal(contract.output.runnerPrepared, false)],
  ["55 no training outputs", () => assert.equal(contract.output.trainingOutputsCreated, false)],
  ["56 INTERNAL_TEST unavailable", () => assert.equal(contract.protections.internalTestTrainingUse, false)],
  ["57 benchmark unavailable", () => assert.equal(contract.protections.benchmarkTrainingUse, false)],
  ["58 protected predictions absent", () => assert.equal(contract.protections.protectedPredictionsImported, false)],
  ["59 future evaluation not automatic", () => assert.equal(contract.futureEvaluation.automaticallyAuthorized, false)],
  ["60 threshold not selected", () => assert.equal(contract.threshold.productionStatus, "NOT_SELECTED")],
  ["61 execution boundaries zero", () => assert.ok(Object.values(contract.boundaries).every((value) => value === 0))],
  ["62 one selected strategy", () => assert.equal(strategy.strategies.filter((row: { decision: string }) => row.decision === "SELECTED").length, 1)],
  ["63 selected Strategy 3", () => assert.equal(strategy.selectedStrategy, "BINARY_PLUS_MASKED_AUXILIARY_CATEGORY_NATURAL_SAMPLING")],
  ["64 strategy validates", () => assert.doesNotThrow(() => validateMhsV2SuccessorStrategy(strategy))],
  ["65 contract validates", () => assert.doesNotThrow(() => validateMhsV2SuccessorContract(contract))],
  ["66 no protected/raw text serialized", () => assert.doesNotMatch(canonicalJson(artifacts), /"text"\s*:/u)],
  ["67 final status", () => assert.equal(contract.status, "SUCCESSOR_TRAINING_CONTRACT_READY")],
];
checks.forEach(([name, run]) => test(name, run));

test("68 deterministic replay", () => assert.equal(canonicalJson(createMhsV2SuccessorTrainingArtifacts(paths)), canonicalJson(artifacts)));
test("69 immutable paired publication refuses overwrite", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-8e-b-")); try { publishMhsV2SuccessorTrainingArtifacts(artifacts, directory); assert.throws(() => publishMhsV2SuccessorTrainingArtifacts(artifacts, directory), /overwrite refused/); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("70 failed paired publication rolls back", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-8e-b-")); let calls = 0; try { assert.throws(() => publishMhsV2SuccessorTrainingArtifacts(artifacts, directory, (temporary, target) => { calls += 1; if (calls === 2) throw new Error("injected"); fs.renameSync(temporary, target); }), /injected/); assert.deepEqual(fs.readdirSync(directory), []); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("71 published artifacts canonical and pinned", () => { const strategyPath = path.join(trainingDirectory, MHS_V2_SUCCESSOR_STRATEGY_FILENAME), contractPath = path.join(trainingDirectory, MHS_V2_SUCCESSOR_CONTRACT_FILENAME); assert.deepEqual([sha256FileStreaming(strategyPath), strategy.strategyPayloadDigest, sha256FileStreaming(contractPath), contract.contractPayloadDigest], [MHS_V2_SUCCESSOR_STRATEGY_SHA256, MHS_V2_SUCCESSOR_STRATEGY_PAYLOAD_DIGEST, MHS_V2_SUCCESSOR_CONTRACT_SHA256, MHS_V2_SUCCESSOR_CONTRACT_PAYLOAD_DIGEST]); assert.deepEqual([fs.readFileSync(strategyPath, "utf8"), fs.readFileSync(contractPath, "utf8")], [canonicalJson(strategy), canonicalJson(contract)]); });
test("72 source contains no model execution", () => { const source = fs.readFileSync(path.resolve(root, "src/research/textModerationDataset/mhsV2SuccessorTrainingContract.ts"), "utf8"); assert.doesNotMatch(source, /from\s+["'](?:torch|transformers)|import\s+(?:torch|transformers)|AutoModel\w*\.from_pretrained|forward\s*\(|trainer\.train\s*\(/u); });
