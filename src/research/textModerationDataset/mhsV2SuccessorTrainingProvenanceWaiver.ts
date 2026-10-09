import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import {
  MHS_V2_SUCCESSOR_PROVENANCE_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_PROVENANCE_SHA256,
  sha256FileStreaming,
  validateMhsV2SuccessorProvenanceRecovery,
} from "./mhsV2SuccessorTrainingProvenanceRecovery";

export const MHS_V2_SUCCESSOR_WAIVER_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SUCCESSOR_TRAINING_PROVENANCE_WAIVER_V1" as const;
export const MHS_V2_SUCCESSOR_WAIVER_VERSION = "MHS_V2_SUCCESSOR_TRAINING_PROVENANCE_WAIVER_V1" as const;
export const MHS_V2_SUCCESSOR_WAIVER_ID = "STHN_T6L_8E_D0W_SUCCESSOR_PROVENANCE_WAIVER_V1" as const;
export const MHS_V2_SUCCESSOR_WAIVER_FILENAME = "mhs-v2-successor-training-provenance-waiver-v1.json" as const;
export const MHS_V2_SUCCESSOR_WAIVER_SHA256 = "ae4d33fc9e43cd6d7c23ab4a4302855c9eed2ba1fca638a5137ebf1d1148c29b";
export const MHS_V2_SUCCESSOR_WAIVER_PAYLOAD_DIGEST = "0738082cdaab0f6a8041560b5e58c5010b65bd11a6a6f7f1686659f6532c8253";
export const MHS_V2_SUCCESSOR_WAIVER_RECORDED_AT = "2026-09-30T00:00:00.000Z" as const;

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
const SELECTED_MODEL_SHA = "9c6f3e1033e5146bbd1eed3df6c68be2e2be9b1b5815afda3d41baa5a739ac3f";
const TRAIN_SHA = "fa9eaeb3fa519ded246bffda1fb57902ca2fcae4c64fb10968d430fab4a4bf74";
const VALIDATION_SHA = "5c01425c9c7e6e1f4348e38a98eaf1740898c3ba98f2bb6114d77175631b0d29";
const PROJECTION_SHA = "1d2e92c67660998ea5149abd7c572170f5bc4fb1594cfc3276b412d3caa02e18";
const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));

export interface MhsV2SuccessorWaiverPaths {
  readonly d0Analysis: string; readonly strategy: string; readonly contract: string; readonly preparation: string;
  readonly runner: string; readonly modelImplementation: string; readonly manifest: string; readonly lifecycle: string; readonly resultSummary: string;
  readonly epoch02Model: string; readonly epoch03Model: string; readonly finalModel: string; readonly train: string; readonly validation: string; readonly projection: string;
}

export interface MhsV2SuccessorProvenanceWaiverArtifact {
  readonly schemaVersion: typeof MHS_V2_SUCCESSOR_WAIVER_SCHEMA; readonly waiverVersion: typeof MHS_V2_SUCCESSOR_WAIVER_VERSION; readonly waiverId: typeof MHS_V2_SUCCESSOR_WAIVER_ID;
  readonly phase: "T6L-8E-D0W"; readonly status: "PROVENANCE_WAIVER_ACCEPTED_CERTIFICATION_ADMISSIBLE";
  readonly authorization: Readonly<Record<string, unknown>>; readonly authorities: Readonly<Record<string, unknown>>;
  readonly waivedGap: Readonly<Record<string, unknown>>; readonly nonWaivedRequirements: readonly string[];
  readonly evidenceClassification: Readonly<Record<string, unknown>>; readonly unresolvedProvenance: Readonly<Record<string, unknown>>;
  readonly limitations: Readonly<Record<string, unknown>>; readonly admissibility: Readonly<Record<string, unknown>>;
  readonly prohibitions: Readonly<Record<string, boolean | string>>; readonly boundaries: Readonly<Record<string, number>>;
  readonly recordedAt: typeof MHS_V2_SUCCESSOR_WAIVER_RECORDED_AT; readonly waiverPayloadDigest: string;
}

export const defaultMhsV2SuccessorWaiverPaths = (root = process.cwd()): MhsV2SuccessorWaiverPaths => {
  const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), run = path.resolve(root, "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-category-aware-run-v1");
  return {
    d0Analysis: path.join(mhs, "training/mhs-v2-successor-training-provenance-recovery-v1.json"), strategy: path.join(mhs, "training/mhs-v2-successor-training-strategy-analysis-v1.json"), contract: path.join(mhs, "training/mhs-v2-successor-training-contract-v1.json"), preparation: path.join(mhs, "training/mhs-v2-successor-local-training-runner-preparation-v1.json"),
    runner: path.resolve(root, "src/research/textModerationDataset/training/run_mhs_v2_successor_local_training.py"), modelImplementation: path.resolve(root, "src/research/textModerationDataset/training/mhs_v2_successor_model.py"), manifest: path.join(run, "run/run-manifest.json"), lifecycle: path.join(run, "run/lifecycle.json"), resultSummary: path.join(run, "run/result-summary.json"), epoch02Model: path.join(run, "checkpoints/checkpoint-epoch-02/model.safetensors"), epoch03Model: path.join(run, "checkpoints/checkpoint-epoch-03/model.safetensors"), finalModel: path.join(run, "final/model.safetensors"),
    train: path.join(mhs, "materialized/mhs-train-v2.jsonl"), validation: path.join(mhs, "materialized/mhs-validation-v2.jsonl"), projection: path.join(mhs, "development/mhs-development-text-projection-v2.jsonl"),
  };
};

const exact = (filename: string, expected: string, label: string): void => { if (!fs.existsSync(filename) || sha256FileStreaming(filename) !== expected) throw new Error(`T6L-8E-D0W ${label} mismatch`); };
const record = (value: unknown, label: string): Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`T6L-8E-D0W invalid ${label}`); return value as Record<string, unknown>; };

export const createMhsV2SuccessorTrainingProvenanceWaiver = (paths: MhsV2SuccessorWaiverPaths): MhsV2SuccessorProvenanceWaiverArtifact => {
  exact(paths.d0Analysis, MHS_V2_SUCCESSOR_PROVENANCE_SHA256, "D0 analysis"); exact(paths.strategy, STRATEGY_SHA, "strategy"); exact(paths.contract, CONTRACT_SHA, "contract"); exact(paths.preparation, PREPARATION_SHA, "preparation"); exact(paths.runner, RUNNER_SHA, "runner"); exact(paths.modelImplementation, MODEL_IMPLEMENTATION_SHA, "model implementation");
  exact(paths.manifest, MANIFEST_SHA, "manifest"); exact(paths.lifecycle, LIFECYCLE_SHA, "lifecycle"); exact(paths.resultSummary, SUMMARY_SHA, "result summary"); exact(paths.epoch02Model, EPOCH_02_MODEL_SHA, "epoch 2 checkpoint"); exact(paths.epoch03Model, SELECTED_MODEL_SHA, "selected checkpoint"); exact(paths.finalModel, SELECTED_MODEL_SHA, "final model"); exact(paths.train, TRAIN_SHA, "TRAIN"); exact(paths.validation, VALIDATION_SHA, "VALIDATION"); exact(paths.projection, PROJECTION_SHA, "projection");
  const d0 = JSON.parse(fs.readFileSync(paths.d0Analysis, "utf8")) as Parameters<typeof validateMhsV2SuccessorProvenanceRecovery>[0]; validateMhsV2SuccessorProvenanceRecovery(d0);
  if (d0.status !== "WAIVER_REQUIRES_EXPLICIT_AUTHORIZATION" || d0.recoveryPayloadDigest !== MHS_V2_SUCCESSOR_PROVENANCE_PAYLOAD_DIGEST || d0.decision.certificationAdmissible !== false || d0.waiver.issued !== false) throw new Error("T6L-8E-D0W D0 decision mismatch");
  const manifest = record(JSON.parse(fs.readFileSync(paths.manifest, "utf8")), "manifest"), lifecycle = record(JSON.parse(fs.readFileSync(paths.lifecycle, "utf8")), "lifecycle"), summary = record(JSON.parse(fs.readFileSync(paths.resultSummary, "utf8")), "summary");
  if (manifest.runPayloadDigest !== MANIFEST_PAYLOAD || lifecycle.status !== "COMPLETED" || summary.status !== "SUCCESSOR_TRAINING_RUN_COMPLETED" || summary.selectedModelSha256 !== SELECTED_MODEL_SHA) throw new Error("T6L-8E-D0W completed run mismatch");
  const payload = {
    schemaVersion: MHS_V2_SUCCESSOR_WAIVER_SCHEMA, waiverVersion: MHS_V2_SUCCESSOR_WAIVER_VERSION, waiverId: MHS_V2_SUCCESSOR_WAIVER_ID, phase: "T6L-8E-D0W" as const, status: "PROVENANCE_WAIVER_ACCEPTED_CERTIFICATION_ADMISSIBLE" as const,
    authorization: { basis: "EXPLICIT_USER_RESEARCH_GOVERNANCE_DECISION_IN_T6L_8E_D0W", cryptographicallySignedByUser: false, scope: "THIS_SPECIFIC_COMPLETED_SUCCESSOR_TRAINING_RUN_ONLY", decision: "ACCEPT_NARROW_MISSING_EXECUTED_SOURCE_BYTE_ATTESTATION_LIMITATION", statement: "The completed successor training run is accepted for continued research certification despite the absence of cryptographic attestation of the exact runner and custom-model source bytes executed historically. Existing evidence establishes strong structural consistency with the frozen experiment and corroborates execution through the prepared runner, but exact executed-source identity remains unproven." },
    authorities: { d0Analysis: { sha256: MHS_V2_SUCCESSOR_PROVENANCE_SHA256, payloadDigest: MHS_V2_SUCCESSOR_PROVENANCE_PAYLOAD_DIGEST, status: "WAIVER_REQUIRES_EXPLICIT_AUTHORIZATION" }, completedRun: { manifestSha256: MANIFEST_SHA, manifestPayloadDigest: MANIFEST_PAYLOAD, lifecycleSha256: LIFECYCLE_SHA, lifecycleStatus: "COMPLETED", resultSummarySha256: SUMMARY_SHA, resultStatus: "SUCCESSOR_TRAINING_RUN_COMPLETED", retainedEpoch02ModelSha256: EPOCH_02_MODEL_SHA, selectedEpoch03ModelSha256: SELECTED_MODEL_SHA, finalModelSha256: SELECTED_MODEL_SHA }, strategy: { sha256: STRATEGY_SHA, payloadDigest: STRATEGY_PAYLOAD }, contract: { sha256: CONTRACT_SHA, payloadDigest: CONTRACT_PAYLOAD }, preparation: { sha256: PREPARATION_SHA, payloadDigest: PREPARATION_PAYLOAD, expectedPreparedRunnerSha256: RUNNER_SHA, expectedPreparedModelImplementationSha256: MODEL_IMPLEMENTATION_SHA }, development: { trainSha256: TRAIN_SHA, validationSha256: VALIDATION_SHA, projectionSha256: PROJECTION_SHA } },
    waivedGap: { code: "MISSING_EXECUTED_SOURCE_BYTE_ATTESTATION", appliesTo: ["DIRECT_RUN_TO_8E_C_PREPARATION_LINK", "EXACT_HISTORICAL_RUNNER_BYTES_EXECUTED", "EXACT_HISTORICAL_CUSTOM_MODEL_BYTES_EXECUTED"], expectedPreparedSourceIdentitiesOnly: { runnerSha256: RUNNER_SHA, modelImplementationSha256: MODEL_IMPLEMENTATION_SHA }, directlyAttestedExecutedSourceIdentities: false, provenanceRecovered: false, exactSourceVerified: false },
    nonWaivedRequirements: ["RUN_MANIFEST_INTEGRITY", "LIFECYCLE_INTEGRITY", "RESULT_SUMMARY_INTEGRITY", "TRAIN_AUTHORITY", "VALIDATION_AUTHORITY", "DEVELOPMENT_PROJECTION_AUTHORITY", "BASE_MODEL_AUTHORITY", "TOKENIZER_AUTHORITY", "EXPERIMENT_CONTRACT_COMPLIANCE", "CHECKPOINT_INTEGRITY", "SELECTED_MODEL_INTEGRITY", "PROTECTED_DATA_ISOLATION", "RESERVE_ISOLATION", "EXCLUSION_ISOLATION", "THRESHOLD_ISOLATION", "IMMUTABLE_EVIDENCE"],
    evidenceClassification: { cryptographicDirect: ["COMPLETED_RUN_MANIFEST_IDENTITY", "LIFECYCLE_IDENTITY_AND_STATUS", "RESULT_SUMMARY_IDENTITY_AND_STATUS", "RUN_DIRECT_8E_B_AND_DATA_BINDINGS", "PREPARATION_BINDING_TO_EXPECTED_RUNNER_AND_MODEL_HASHES"], cryptographicChainedCompleteRunToExecutedSources: false, durableStructural: ["FROZEN_ARCHITECTURE_AND_CONFIGURATION_MATCH", "CATEGORY_MAPPING", "AUXILIARY_WEIGHT", "SEED", "SAMPLING", "OPTIMIZER", "75_STEPS", "3_VALIDATIONS", "CHECKPOINT_LIFECYCLE", "SELECTED_EXPORT"], corroboratingOnly: ["PACKAGE_COMMAND", "TERMINAL_CAPTURE", "CURRENT_SOURCE_HASHES", "SOURCE_TIMESTAMPS_AND_WORKTREE_EVIDENCE"], unproven: ["EXACT_HISTORICAL_RUNNER_BYTES_EXECUTED", "EXACT_HISTORICAL_CUSTOM_MODEL_IMPLEMENTATION_BYTES_EXECUTED"] },
    unresolvedProvenance: { remainsUnproven: true, missingDirectBindingsPreserved: { preparationSha256: null, runnerSha256: null, modelImplementationSha256: null }, evidenceOfTampering: false, missingProvenanceIsNotEvidenceOfTampering: true },
    limitations: { auxiliaryComponentLossesPersisted: false, auxiliaryMetricsPersisted: false, observabilityLimitationWaivedAsExistingEvidence: false, trainerRuntimeSeconds: { value: 882.6706, classification: "TERMINAL_ONLY_CORROBORATING" }, overallTrainerLoss: { value: 1.0419386291503907, classification: "TERMINAL_ONLY_CORROBORATING" }, lifecycleElapsedSeconds: 977.7030000000013 },
    admissibility: { certificationAdmissible: true, admissibleOnlyUnderExplicitWaiver: true, exactSourceProvenanceRecovered: false, nextPhase: "T6L-8E-D_RESUME_SUCCESSOR_LOCAL_TRAINING_RUN_CERTIFICATION", certificationMustDiscloseWaiver: true },
    prohibitions: { protectedEvaluationAuthorized: false, thresholdSelectionAuthorized: false, productionAuthorized: false, retrainingAuthorized: false, historicalEvidenceMutationAuthorized: false, productionThresholdStatus: "NOT_SELECTED" },
    boundaries: { modelLoads: 0, forwardPasses: 0, trainingRuns: 0, newProtectedInference: 0, protectedRawTextAccesses: 0, thresholdSelections: 0, reserveUses: 0, exclusionUses: 0 }, recordedAt: MHS_V2_SUCCESSOR_WAIVER_RECORDED_AT,
  };
  const artifact: MhsV2SuccessorProvenanceWaiverArtifact = { ...payload, waiverPayloadDigest: digest(payload) }; validateMhsV2SuccessorTrainingProvenanceWaiver(artifact); return artifact;
};

export const validateMhsV2SuccessorTrainingProvenanceWaiver = (artifact: MhsV2SuccessorProvenanceWaiverArtifact): void => {
  const { waiverPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_SUCCESSOR_WAIVER_SCHEMA || artifact.waiverVersion !== MHS_V2_SUCCESSOR_WAIVER_VERSION || artifact.waiverId !== MHS_V2_SUCCESSOR_WAIVER_ID || artifact.phase !== "T6L-8E-D0W" || artifact.status !== "PROVENANCE_WAIVER_ACCEPTED_CERTIFICATION_ADMISSIBLE" || waiverPayloadDigest !== digest(payload)) throw new Error("Invalid T6L-8E-D0W identity or payload");
  if (MHS_V2_SUCCESSOR_WAIVER_PAYLOAD_DIGEST && waiverPayloadDigest !== MHS_V2_SUCCESSOR_WAIVER_PAYLOAD_DIGEST) throw new Error("Invalid T6L-8E-D0W pinned payload");
  if (MHS_V2_SUCCESSOR_WAIVER_SHA256 && sha256(Buffer.from(canonicalJson(artifact))) !== MHS_V2_SUCCESSOR_WAIVER_SHA256) throw new Error("Invalid T6L-8E-D0W pinned artifact");
  if (artifact.authorization.cryptographicallySignedByUser !== false || artifact.waivedGap.directlyAttestedExecutedSourceIdentities !== false || artifact.waivedGap.provenanceRecovered !== false || artifact.admissibility.certificationAdmissible !== true || artifact.admissibility.admissibleOnlyUnderExplicitWaiver !== true || artifact.admissibility.exactSourceProvenanceRecovered !== false || artifact.prohibitions.protectedEvaluationAuthorized !== false || artifact.prohibitions.thresholdSelectionAuthorized !== false || artifact.prohibitions.productionAuthorized !== false || artifact.prohibitions.productionThresholdStatus !== "NOT_SELECTED" || Object.values(artifact.boundaries).some((value) => value !== 0)) throw new Error("Invalid T6L-8E-D0W scope, admissibility, or boundary");
};

type Publisher = (temporary: string, target: string) => void;
export const publishMhsV2SuccessorTrainingProvenanceWaiver = (artifact: MhsV2SuccessorProvenanceWaiverArtifact, outputDirectory: string, publish: Publisher = fs.renameSync): string => {
  validateMhsV2SuccessorTrainingProvenanceWaiver(artifact); fs.mkdirSync(outputDirectory, { recursive: true }); const target = path.join(outputDirectory, MHS_V2_SUCCESSOR_WAIVER_FILENAME); if (fs.existsSync(target)) throw new Error("T6L-8E-D0W waiver exists; overwrite refused"); const temporary = `${target}.${process.pid}.partial`, serialized = canonicalJson(artifact);
  try { fs.writeFileSync(temporary, serialized, { flag: "wx" }); publish(temporary, target); if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== serialized) throw new Error("Incomplete T6L-8E-D0W publication"); return target; }
  catch (error) { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === serialized) fs.rmSync(target, { force: true }); throw error; }
  finally { fs.rmSync(temporary, { force: true }); }
};
