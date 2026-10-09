import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";

export const MHS_V2_SUCCESSOR_PROVENANCE_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SUCCESSOR_TRAINING_PROVENANCE_RECOVERY_V1" as const;
export const MHS_V2_SUCCESSOR_PROVENANCE_VERSION = "MHS_V2_SUCCESSOR_TRAINING_PROVENANCE_RECOVERY_V1" as const;
export const MHS_V2_SUCCESSOR_PROVENANCE_FILENAME = "mhs-v2-successor-training-provenance-recovery-v1.json" as const;
export const MHS_V2_SUCCESSOR_PROVENANCE_SHA256 = "494555916a7f0db88a5112fabcc078b48eea8cd8b2990ac863cc1a997bc32681";
export const MHS_V2_SUCCESSOR_PROVENANCE_PAYLOAD_DIGEST = "4fbe8cca975da257db61ea895aa749d960b79a5ee3039b3710e570f8bf2fd3c5";
export const MHS_V2_SUCCESSOR_PROVENANCE_ANALYZED_AT = "2026-09-30T00:00:00.000Z" as const;

const STRATEGY_SHA = "e693587aad615eb4a210503513a6d5b93d8e6be468ab64c2bcfa620e6b451a1e";
const STRATEGY_PAYLOAD = "c2a4ca5b41587b2f73cf57f1694bb5e2176d0b5466102d882dd510ada157b9f3";
const CONTRACT_SHA = "80f8f7b65899ec4cf52dbee269dacaced0c3483cbc057daa47d07694e2dab591";
const CONTRACT_PAYLOAD = "b3fdddf017c33b2c4af093ed62c4c4b2afc520f2fdb6953a745c9ff4f1bcd5b3";
const PREPARATION_SHA = "61c8aaaa0f05330638c880a4cd017d6504509458939d28cb4562d5d3bc151c6f";
const PREPARATION_PAYLOAD = "430f9d9667ca91b7f7108171116c7f6d6c0c0c9a98d52a9e33608228d6267942";
const RUNNER_SHA = "2a6fc2a2f36796a4e1845d07edacf9c7e54e8bc24291838ef51733c7942c25ed";
const MODEL_IMPLEMENTATION_SHA = "f60e9d29e16ce9f8da7ea3c573daae793f0a5723ae9bd725807bfb2861177831";
const MANIFEST_SHA = "b7d90bef68fd3c72242c39fb299a59f67af097d6820b4c302280666117ccffac";
const MANIFEST_PAYLOAD = "d7ddb001bdc817cf14ba0f8516dacaed08e69d069d5eefe5a7243841c640059b";
const LIFECYCLE_SHA = "47ae7ead37a2c71ff0db6d802acf5ff25ed327c4cac8255a4160f2040ef9fab9";
const SUMMARY_SHA = "8f0c65c47cfa7d3db43e6fd1738f8e057924fb59b3664a5e4cc32be587fb372e";
const EPOCH_02_MODEL_SHA = "37394daf66404b753c059262230192536a2d48c67f60a990d2f2c06944eeace7";
const EPOCH_03_MODEL_SHA = "9c6f3e1033e5146bbd1eed3df6c68be2e2be9b1b5815afda3d41baa5a739ac3f";
const TRAIN_SHA = "fa9eaeb3fa519ded246bffda1fb57902ca2fcae4c64fb10968d430fab4a4bf74";
const VALIDATION_SHA = "5c01425c9c7e6e1f4348e38a98eaf1740898c3ba98f2bb6114d77175631b0d29";
const PROJECTION_SHA = "1d2e92c67660998ea5149abd7c572170f5bc4fb1594cfc3276b412d3caa02e18";
const PACKAGE_SHA_AT_ANALYSIS = "2997aef7b0c44d3447b3ca98437827c9225540a95ab6069f10a1a9b7fad94143";
const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));

export type ProvenanceEvidenceClass = "CRYPTOGRAPHIC_DIRECT" | "CRYPTOGRAPHIC_CHAINED" | "DURABLE_STRUCTURAL" | "CORROBORATING_ONLY" | "INSUFFICIENT";

export interface MhsV2SuccessorProvenancePaths {
  readonly strategy: string; readonly contract: string; readonly preparation: string; readonly runner: string; readonly modelImplementation: string; readonly packageJson: string;
  readonly manifest: string; readonly lifecycle: string; readonly resultSummary: string; readonly epoch02Model: string; readonly epoch03Model: string; readonly finalModel: string;
  readonly train: string; readonly validation: string; readonly projection: string;
}

export interface MhsV2SuccessorProvenanceArtifact {
  readonly schemaVersion: typeof MHS_V2_SUCCESSOR_PROVENANCE_SCHEMA; readonly recoveryVersion: typeof MHS_V2_SUCCESSOR_PROVENANCE_VERSION;
  readonly phase: "T6L-8E-D0"; readonly status: "WAIVER_REQUIRES_EXPLICIT_AUTHORIZATION";
  readonly authorities: Readonly<Record<string, unknown>>; readonly missingDirectBindings: Readonly<Record<string, null>>;
  readonly evidenceGraph: readonly Readonly<Record<string, unknown>>[]; readonly candidatePathsExamined: readonly Readonly<Record<string, unknown>>[];
  readonly findings: Readonly<Record<string, unknown>>; readonly evidenceClassification: Readonly<Record<string, unknown>>;
  readonly limitations: Readonly<Record<string, unknown>>; readonly waiver: Readonly<Record<string, unknown>>;
  readonly decision: Readonly<Record<string, unknown>>; readonly boundaries: Readonly<Record<string, number>>;
  readonly analyzedAt: typeof MHS_V2_SUCCESSOR_PROVENANCE_ANALYZED_AT; readonly recoveryPayloadDigest: string;
}

export const sha256FileStreaming = (filename: string): string => {
  const hash = crypto.createHash("sha256"), fd = fs.openSync(filename, "r"), buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  try { let read = 0; do { read = fs.readSync(fd, buffer, 0, buffer.length, null); if (read) hash.update(buffer.subarray(0, read)); } while (read); }
  finally { fs.closeSync(fd); }
  return hash.digest("hex");
};

export const defaultMhsV2SuccessorProvenancePaths = (root = process.cwd()): MhsV2SuccessorProvenancePaths => {
  const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), run = path.resolve(root, "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-category-aware-run-v1");
  return {
    strategy: path.join(mhs, "training/mhs-v2-successor-training-strategy-analysis-v1.json"), contract: path.join(mhs, "training/mhs-v2-successor-training-contract-v1.json"), preparation: path.join(mhs, "training/mhs-v2-successor-local-training-runner-preparation-v1.json"),
    runner: path.resolve(root, "src/research/textModerationDataset/training/run_mhs_v2_successor_local_training.py"), modelImplementation: path.resolve(root, "src/research/textModerationDataset/training/mhs_v2_successor_model.py"), packageJson: path.resolve(root, "package.json"),
    manifest: path.join(run, "run/run-manifest.json"), lifecycle: path.join(run, "run/lifecycle.json"), resultSummary: path.join(run, "run/result-summary.json"), epoch02Model: path.join(run, "checkpoints/checkpoint-epoch-02/model.safetensors"), epoch03Model: path.join(run, "checkpoints/checkpoint-epoch-03/model.safetensors"), finalModel: path.join(run, "final/model.safetensors"),
    train: path.join(mhs, "materialized/mhs-train-v2.jsonl"), validation: path.join(mhs, "materialized/mhs-validation-v2.jsonl"), projection: path.join(mhs, "development/mhs-development-text-projection-v2.jsonl"),
  };
};

const exact = (filename: string, expected: string, label: string): void => { if (!fs.existsSync(filename) || sha256FileStreaming(filename) !== expected) throw new Error(`T6L-8E-D0 ${label} mismatch`); };
const record = (value: unknown, label: string): Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`T6L-8E-D0 invalid ${label}`); return value as Record<string, unknown>; };

export const createMhsV2SuccessorProvenanceRecovery = (paths: MhsV2SuccessorProvenancePaths): MhsV2SuccessorProvenanceArtifact => {
  exact(paths.strategy, STRATEGY_SHA, "strategy"); exact(paths.contract, CONTRACT_SHA, "contract"); exact(paths.preparation, PREPARATION_SHA, "preparation"); exact(paths.runner, RUNNER_SHA, "runner"); exact(paths.modelImplementation, MODEL_IMPLEMENTATION_SHA, "model implementation");
  exact(paths.manifest, MANIFEST_SHA, "run manifest"); exact(paths.lifecycle, LIFECYCLE_SHA, "lifecycle"); exact(paths.resultSummary, SUMMARY_SHA, "result summary"); exact(paths.epoch02Model, EPOCH_02_MODEL_SHA, "epoch 2 model"); exact(paths.epoch03Model, EPOCH_03_MODEL_SHA, "epoch 3 model"); exact(paths.finalModel, EPOCH_03_MODEL_SHA, "final model"); exact(paths.train, TRAIN_SHA, "TRAIN"); exact(paths.validation, VALIDATION_SHA, "VALIDATION"); exact(paths.projection, PROJECTION_SHA, "projection");
  const strategy = record(JSON.parse(fs.readFileSync(paths.strategy, "utf8")), "strategy"), contract = record(JSON.parse(fs.readFileSync(paths.contract, "utf8")), "contract"), preparation = record(JSON.parse(fs.readFileSync(paths.preparation, "utf8")), "preparation"), manifest = record(JSON.parse(fs.readFileSync(paths.manifest, "utf8")), "manifest"), lifecycle = record(JSON.parse(fs.readFileSync(paths.lifecycle, "utf8")), "lifecycle"), summary = record(JSON.parse(fs.readFileSync(paths.resultSummary, "utf8")), "summary"), packageJson = record(JSON.parse(fs.readFileSync(paths.packageJson, "utf8")), "package.json");
  if (strategy.strategyPayloadDigest !== STRATEGY_PAYLOAD || contract.contractPayloadDigest !== CONTRACT_PAYLOAD || preparation.preparationPayloadDigest !== PREPARATION_PAYLOAD || manifest.runPayloadDigest !== MANIFEST_PAYLOAD) throw new Error("T6L-8E-D0 payload authority mismatch");
  if (lifecycle.status !== "COMPLETED" || manifest.terminalStatus !== "COMPLETED" || summary.status !== "SUCCESSOR_TRAINING_RUN_COMPLETED") throw new Error("T6L-8E-D0 completed evidence mismatch");
  const manifestAuthorities = record(manifest.authorities, "manifest authorities"), implementation = record(preparation.implementation, "preparation implementation"), preparedRunner = record(implementation.runner, "prepared runner"), preparedModel = record(implementation.model, "prepared model"), scripts = record(packageJson.scripts, "package scripts");
  const preparationBinding = manifestAuthorities.successorLocalPreparationSha256 ?? manifest.preparationSha256 ?? null, runnerBinding = manifestAuthorities.runnerSha256 ?? manifest.runnerSha256 ?? null, modelBinding = manifestAuthorities.modelImplementationSha256 ?? manifest.modelImplementationSha256 ?? null;
  if (preparationBinding !== null || runnerBinding !== null || modelBinding !== null) throw new Error("T6L-8E-D0 expected missing binding is unexpectedly present");
  if (preparedRunner.sha256 !== RUNNER_SHA || preparedModel.sha256 !== MODEL_IMPLEMENTATION_SHA) throw new Error("T6L-8E-D0 preparation source binding mismatch");
  const command = scripts["train:text-moderation:mhs-v2-successor-local"];
  if (command !== "evaluation-cache\\text-moderation\\classifier\\facebookai-xlm-roberta-base\\e73636d4f797dec63c3081bb6ed5c7b0bb3f2089\\.venv\\Scripts\\python.exe src/research/textModerationDataset/training/run_mhs_v2_successor_local_training.py --execute-authorized-local-run") throw new Error("T6L-8E-D0 package command mismatch");
  const payload = {
    schemaVersion: MHS_V2_SUCCESSOR_PROVENANCE_SCHEMA, recoveryVersion: MHS_V2_SUCCESSOR_PROVENANCE_VERSION, phase: "T6L-8E-D0" as const, status: "WAIVER_REQUIRES_EXPLICIT_AUTHORIZATION" as const,
    authorities: { strategy: { sha256: STRATEGY_SHA, payloadDigest: STRATEGY_PAYLOAD }, contract: { sha256: CONTRACT_SHA, payloadDigest: CONTRACT_PAYLOAD }, preparation: { sha256: PREPARATION_SHA, payloadDigest: PREPARATION_PAYLOAD, runnerSha256: RUNNER_SHA, modelImplementationSha256: MODEL_IMPLEMENTATION_SHA }, completedRun: { manifestSha256: MANIFEST_SHA, manifestPayloadDigest: MANIFEST_PAYLOAD, lifecycleSha256: LIFECYCLE_SHA, resultSummarySha256: SUMMARY_SHA, lifecycleStatus: "COMPLETED", resultStatus: "SUCCESSOR_TRAINING_RUN_COMPLETED", selectedModelSha256: EPOCH_03_MODEL_SHA }, development: { trainSha256: TRAIN_SHA, validationSha256: VALIDATION_SHA, projectionSha256: PROJECTION_SHA }, packageCommand: { sha256AtAnalysis: PACKAGE_SHA_AT_ANALYSIS, command, boundByPreparation: false, boundByCompletedRun: false } },
    missingDirectBindings: { preparationSha256: null, runnerSha256: null, modelImplementationSha256: null },
    evidenceGraph: [
      { from: "COMPLETED_RUN_MANIFEST", to: "8E_B_STRATEGY", classification: "CRYPTOGRAPHIC_DIRECT" as ProvenanceEvidenceClass, digest: STRATEGY_SHA },
      { from: "COMPLETED_RUN_MANIFEST", to: "8E_B_CONTRACT", classification: "CRYPTOGRAPHIC_DIRECT" as ProvenanceEvidenceClass, digest: CONTRACT_SHA },
      { from: "COMPLETED_RUN_MANIFEST", to: "TRAIN_VALIDATION_PROJECTION", classification: "CRYPTOGRAPHIC_DIRECT" as ProvenanceEvidenceClass, digests: [TRAIN_SHA, VALIDATION_SHA, PROJECTION_SHA] },
      { from: "8E_C_PREPARATION", to: "EXPECTED_RUNNER_SOURCE", classification: "CRYPTOGRAPHIC_DIRECT" as ProvenanceEvidenceClass, digest: RUNNER_SHA },
      { from: "8E_C_PREPARATION", to: "EXPECTED_MODEL_IMPLEMENTATION", classification: "CRYPTOGRAPHIC_DIRECT" as ProvenanceEvidenceClass, digest: MODEL_IMPLEMENTATION_SHA },
      { from: "COMPLETED_RUN_MANIFEST", to: "8E_C_PREPARATION", classification: "INSUFFICIENT" as ProvenanceEvidenceClass, reason: "NO_DIGEST_OR_IMMUTABLE_IDENTITY_PERSISTED" },
      { from: "COMPLETED_RUN_BEHAVIOR", to: "8E_C_PREPARED_CONFIGURATION", classification: "DURABLE_STRUCTURAL" as ProvenanceEvidenceClass, reason: "MATCHING_CONFIGURATION_ARCHITECTURE_SEED_STEPS_AND_CHECKPOINT_LIFECYCLE" },
      { from: "PACKAGE_COMMAND_AND_TERMINAL_CAPTURE", to: "EXPECTED_RUNNER_PATH", classification: "CORROBORATING_ONLY" as ProvenanceEvidenceClass, reason: "NOT_BOUND_BY_COMPLETED_RUN" },
      { from: "CURRENT_SOURCE_HASHES_AND_MTIMES", to: "8E_C_PREPARATION", classification: "CORROBORATING_ONLY" as ProvenanceEvidenceClass, reason: "PROVES_CURRENT_CONTINUITY_NOT_HISTORICAL_EXECUTION" },
    ],
    candidatePathsExamined: [
      { path: ["COMPLETED_RUN", "8E_C_PREPARATION", "RUNNER_AND_MODEL"], outcome: "BROKEN", break: "RUN_DOES_NOT_BIND_PREPARATION" },
      { path: ["COMPLETED_RUN", "CONFIGURATION_FINGERPRINT", "8E_C_PREPARATION"], outcome: "STRUCTURAL_ONLY", reason: "EQUIVALENT_CONFIGURATION_DOES_NOT_IDENTIFY_SOURCE_BYTES" },
      { path: ["COMPLETED_RUN", "RUN_SCHEMA_AND_OUTPUT_SHAPE", "PREPARED_RUNNER"], outcome: "STRUCTURAL_ONLY", reason: "OUTPUT_SHAPE_IS_NOT_A_SOURCE_DIGEST" },
      { path: ["USER_TERMINAL_CAPTURE", "PACKAGE_COMMAND", "RUNNER_PATH"], outcome: "CORROBORATING_ONLY", reason: "NO_AUTHENTICATED_DURABLE_BINDING_FROM_RUN" },
      { path: ["FILESYSTEM_MTIME", "CURRENT_HASH", "PREPARATION"], outcome: "CORROBORATING_ONLY", reason: "TIMESTAMPS_AND_CURRENT_BYTES_CANNOT_PROVE_EXECUTED_BYTES" },
    ],
    findings: { completedRunInternallyConsistent: true, contractComplianceStructurallyConsistent: true, exactExecutedRunnerBytesProven: false, exactExecutedModelImplementationBytesProven: false, directPreparationBinding: false, cryptographicChainedPathExists: false, evidenceOfTampering: false, missingProvenanceIsNotEvidenceOfTampering: true, certificationAdmissibleWithoutWaiver: false },
    evidenceClassification: { runManifestAndPayload: "CRYPTOGRAPHIC_DIRECT", lifecycleAndResultSummary: "CRYPTOGRAPHIC_DIRECT", strategyContractAndDevelopmentBindings: "CRYPTOGRAPHIC_DIRECT", preparationToExpectedSourceHashes: "CRYPTOGRAPHIC_DIRECT", completedRunToPreparation: "INSUFFICIENT", matchingConfigurationAndBehavior: "DURABLE_STRUCTURAL", packageCommand: "CORROBORATING_ONLY", terminalCapture: "CORROBORATING_ONLY", currentSourceHashes: "CORROBORATING_ONLY", sourceAndRunTimestamps: "CORROBORATING_ONLY" },
    limitations: { auxiliaryComponentLossesPersisted: false, auxiliaryMetricsPersisted: false, auxiliaryLimitationIsProvenanceBlocker: false, trainerRuntimeSeconds: { value: 882.6706, classification: "TERMINAL_ONLY_CORROBORATING" }, overallTrainerLoss: { value: 1.0419386291503907, classification: "TERMINAL_ONLY_CORROBORATING" }, lifecycleElapsedSeconds: 977.7030000000013, elapsedValuesContradictory: false },
    waiver: { issued: false, requiresExplicitUserAuthorization: true, meaning: "ACCEPT_CERTIFICATION_OF_INTERNAL_RUN_INTEGRITY_AND_FROZEN_EXPERIMENT_CONSISTENCY_WHILE_ACKNOWLEDGING_THAT_EXACT_EXECUTED_RUNNER_AND_MODEL_SOURCE_BYTES_WERE_NOT_DURABLY_ATTESTED_BY_THE_COMPLETED_RUN", wouldNotProve: ["EXACT_EXECUTED_RUNNER_SOURCE_IDENTITY", "EXACT_EXECUTED_MODEL_IMPLEMENTATION_IDENTITY"], wouldNotAuthorize: ["PROTECTED_EVALUATION", "THRESHOLD_SELECTION", "PRODUCTION_INTEGRATION"] },
    decision: { provenanceRecovered: false, certificationAdmissible: false, waiverNeededToProceed: true, exactNextAction: "EXPLICIT_USER_DECISION_ON_BOUNDED_PROVENANCE_WAIVER_BEFORE_RESUMING_T6L_8E_D" },
    boundaries: { modelLoads: 0, forwardPasses: 0, trainingRuns: 0, newProtectedInference: 0, protectedRawTextAccesses: 0, thresholdSelections: 0, reserveUses: 0, exclusionUses: 0 }, analyzedAt: MHS_V2_SUCCESSOR_PROVENANCE_ANALYZED_AT,
  };
  const artifact: MhsV2SuccessorProvenanceArtifact = { ...payload, recoveryPayloadDigest: digest(payload) }; validateMhsV2SuccessorProvenanceRecovery(artifact); return artifact;
};

export const validateMhsV2SuccessorProvenanceRecovery = (artifact: MhsV2SuccessorProvenanceArtifact): void => {
  const { recoveryPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_SUCCESSOR_PROVENANCE_SCHEMA || artifact.recoveryVersion !== MHS_V2_SUCCESSOR_PROVENANCE_VERSION || artifact.phase !== "T6L-8E-D0" || artifact.status !== "WAIVER_REQUIRES_EXPLICIT_AUTHORIZATION" || recoveryPayloadDigest !== digest(payload)) throw new Error("Invalid T6L-8E-D0 identity or payload");
  if (MHS_V2_SUCCESSOR_PROVENANCE_PAYLOAD_DIGEST && recoveryPayloadDigest !== MHS_V2_SUCCESSOR_PROVENANCE_PAYLOAD_DIGEST) throw new Error("Invalid T6L-8E-D0 pinned payload");
  if (MHS_V2_SUCCESSOR_PROVENANCE_SHA256 && sha256(Buffer.from(canonicalJson(artifact))) !== MHS_V2_SUCCESSOR_PROVENANCE_SHA256) throw new Error("Invalid T6L-8E-D0 pinned artifact");
  if (Object.values(artifact.missingDirectBindings).some((value) => value !== null) || artifact.findings.exactExecutedRunnerBytesProven !== false || artifact.findings.exactExecutedModelImplementationBytesProven !== false || artifact.findings.cryptographicChainedPathExists !== false || artifact.decision.certificationAdmissible !== false || artifact.waiver.issued !== false || Object.values(artifact.boundaries).some((value) => value !== 0)) throw new Error("Invalid T6L-8E-D0 evidence boundary or decision");
};

type Publisher = (temporary: string, target: string) => void;
export const publishMhsV2SuccessorProvenanceRecovery = (artifact: MhsV2SuccessorProvenanceArtifact, outputDirectory: string, publish: Publisher = fs.renameSync): string => {
  validateMhsV2SuccessorProvenanceRecovery(artifact); fs.mkdirSync(outputDirectory, { recursive: true }); const target = path.join(outputDirectory, MHS_V2_SUCCESSOR_PROVENANCE_FILENAME); if (fs.existsSync(target)) throw new Error("T6L-8E-D0 analysis exists; overwrite refused"); const temporary = `${target}.${process.pid}.partial`, serialized = canonicalJson(artifact);
  try { fs.writeFileSync(temporary, serialized, { flag: "wx" }); publish(temporary, target); if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== serialized) throw new Error("Incomplete T6L-8E-D0 publication"); return target; }
  catch (error) { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === serialized) fs.rmSync(target, { force: true }); throw error; }
  finally { fs.rmSync(temporary, { force: true }); }
};
