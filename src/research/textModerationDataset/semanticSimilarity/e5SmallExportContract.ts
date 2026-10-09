import crypto from "node:crypto";

import { canonicalJson } from "../manifest";

export const E5_SMALL_MODEL_REPOSITORY = "intfloat/multilingual-e5-small" as const;
export const E5_SMALL_MODEL_REVISION = "053834db62d809d8f124a76b687fbd948e13ef3e" as const;
export const E5_SMALL_MODEL_LICENSE = "MIT" as const;
export const E5_SMALL_EXPORT_SCHEMA_VERSION = "STHN_E5_SMALL_ONNX_EXPORT_MANIFEST_V1" as const;
export const E5_SMALL_EXPORT_PURPOSE = "SEMANTIC_SIMILARITY_AUDIT_ONLY" as const;
export const E5_SMALL_EXPORT_MANIFEST_FILENAME = "STHN_E5_SMALL_ONNX_EXPORT_MANIFEST.json" as const;
export const E5_SMALL_ONNX_OPSET = 17 as const;
export const E5_SMALL_HIDDEN_DIMENSION = 384 as const;
export const E5_SMALL_PARITY_MAX_ABSOLUTE_TOLERANCE = 1e-4 as const;
export const E5_SMALL_PARITY_MEAN_ABSOLUTE_TOLERANCE = 1e-5 as const;
export const E5_SMALL_PARITY_MINIMUM_POOLED_COSINE = 0.999999 as const;
export const E5_SMALL_SOURCE_SHA256 = Object.freeze({
  "README.md": "7e69859f0078e629d33b56e6d861cf55b904fb5cbf92edf20c48efed4786cb25",
  "config.json": "69137736cab8b8903a07fe8afaafdda25aac55415a12a55d1bffa9f581abf959",
  "model.safetensors": "1a55775f53449dac10a2bcbc312469fac40b96d53198c407081a831f81c98477",
  "sentencepiece.bpe.model": "cfc8146abe2a0488e9e2a0c56de7952f7c11ab059eca145a0a727afce0db2865",
  "special_tokens_map.json": "d05497f1da52c5e09554c0cd874037a083e1dc1b9cfd48034d1c717f1afc07a7",
  "tokenizer.json": "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39",
  "tokenizer_config.json": "a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b",
} as const);

export interface E5SmallSourceArtifact {
  readonly path: keyof typeof E5_SMALL_SOURCE_SHA256;
  readonly sourceUrl: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly retrievedAt: string;
}

export interface E5SmallExportManifestPayload {
  readonly schemaVersion: typeof E5_SMALL_EXPORT_SCHEMA_VERSION;
  readonly purpose: typeof E5_SMALL_EXPORT_PURPOSE;
  readonly compatibilityStatus: "CERTIFIED";
  readonly source: {
    readonly repository: typeof E5_SMALL_MODEL_REPOSITORY;
    readonly revision: typeof E5_SMALL_MODEL_REVISION;
    readonly license: typeof E5_SMALL_MODEL_LICENSE;
    readonly artifacts: readonly E5SmallSourceArtifact[];
  };
  readonly tokenizer: { readonly path: "source/tokenizer.json"; readonly sha256: string; readonly certificationStatus: "PASSED" };
  readonly toolchain: { readonly isolation: "UV_MANAGED_IGNORED_VENV"; readonly pythonVersion: "3.12.10"; readonly packages: Readonly<Record<string, string>> };
  readonly export: {
    readonly recipe: string; readonly opset: typeof E5_SMALL_ONNX_OPSET; readonly onnxPath: "export/model.onnx";
    readonly onnxByteSize: number; readonly onnxSha256: string; readonly secondExportSha256: string;
    readonly byteDeterministic: boolean; readonly inputNames: readonly ["input_ids", "attention_mask"];
    readonly inputType: "int64"; readonly outputName: "last_hidden_state"; readonly outputType: "float32";
    readonly hiddenDimension: typeof E5_SMALL_HIDDEN_DIMENSION;
    readonly dynamicAxes: "batch_size,sequence_length";
  };
  readonly parity: {
    readonly suiteVersion: "STHN_E5_SMALL_NON_FROZEN_PARITY_V1"; readonly probeCount: number;
    readonly maxAbsoluteError: number; readonly meanAbsoluteError: number; readonly minimumPooledCosine: number;
    readonly maxAbsoluteTolerance: typeof E5_SMALL_PARITY_MAX_ABSOLUTE_TOLERANCE;
    readonly meanAbsoluteTolerance: typeof E5_SMALL_PARITY_MEAN_ABSOLUTE_TOLERANCE;
    readonly minimumPooledCosineTolerance: typeof E5_SMALL_PARITY_MINIMUM_POOLED_COSINE;
    readonly status: "PASSED";
  };
  readonly nodeRuntime: {
    readonly nodeVersion: "v20.19.6"; readonly onnxruntimeNodeVersion: "1.27.0"; readonly tokenizersVersion: "0.23.2";
    readonly executionProvider: "cpu"; readonly dynamicBatchPassed: true; readonly dynamicSequencePassed: true;
    readonly repeatedInferenceMaxAbsoluteDifference: number; readonly status: "PASSED";
  };
  readonly semanticContract: {
    readonly pooling: "ATTENTION_MASK_AWARE_MEAN_POOLING_OUTSIDE_GRAPH";
    readonly normalization: "L2_OUTSIDE_GRAPH"; readonly similarity: "COSINE_OUTSIDE_GRAPH";
    readonly prefixPolicy: "UNRESOLVED_FOR_SYMMETRIC_NEAR_DUPLICATE_CALIBRATION";
  };
  readonly boundaries: {
    readonly frozenBenchmarkAccessed: false; readonly benchmarkTextProduced: false; readonly benchmarkVectorsProduced: false;
    readonly moderationBaseModel: "FacebookAI/xlm-roberta-base"; readonly trainingEligibleCount: 0;
  };
  readonly generatedAt: string;
}

export interface E5SmallExportManifest extends E5SmallExportManifestPayload { readonly manifestPayloadDigest: string; }

const digest = (payload: E5SmallExportManifestPayload): string => crypto.createHash("sha256").update(canonicalJson(payload)).digest("hex");
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export const withE5SmallManifestDigest = (payload: E5SmallExportManifestPayload): E5SmallExportManifest => ({
  ...payload, manifestPayloadDigest: digest(payload),
});

export const validateE5SmallExportManifest = (manifest: E5SmallExportManifest): void => {
  const { manifestPayloadDigest, ...payload } = manifest;
  if (payload.schemaVersion !== E5_SMALL_EXPORT_SCHEMA_VERSION || payload.purpose !== E5_SMALL_EXPORT_PURPOSE
    || payload.compatibilityStatus !== "CERTIFIED" || payload.source.repository !== E5_SMALL_MODEL_REPOSITORY
    || payload.source.revision !== E5_SMALL_MODEL_REVISION || payload.source.license !== E5_SMALL_MODEL_LICENSE
    || payload.source.artifacts.length !== Object.keys(E5_SMALL_SOURCE_SHA256).length || !Number.isFinite(Date.parse(payload.generatedAt))) {
    throw new Error("Invalid E5 export manifest authority");
  }
  const artifacts = new Map(payload.source.artifacts.map((artifact) => [artifact.path, artifact]));
  for (const [filename, expectedSha] of Object.entries(E5_SMALL_SOURCE_SHA256)) {
    const artifact = artifacts.get(filename as keyof typeof E5_SMALL_SOURCE_SHA256);
    const expectedUrl = `https://huggingface.co/${E5_SMALL_MODEL_REPOSITORY}/resolve/${E5_SMALL_MODEL_REVISION}/${filename}`;
    if (!artifact || artifact.sourceUrl !== expectedUrl || artifact.sha256 !== expectedSha || artifact.byteSize <= 0
      || !Number.isFinite(Date.parse(artifact.retrievedAt))) throw new Error(`Invalid pinned source artifact: ${filename}`);
  }
  if (payload.tokenizer.path !== "source/tokenizer.json" || payload.tokenizer.sha256 !== E5_SMALL_SOURCE_SHA256["tokenizer.json"]
    || payload.tokenizer.certificationStatus !== "PASSED" || payload.toolchain.isolation !== "UV_MANAGED_IGNORED_VENV"
    || payload.toolchain.pythonVersion !== "3.12.10"
    || payload.toolchain.packages.torch !== "2.3.1" || payload.toolchain.packages.transformers !== "4.42.4"
    || payload.toolchain.packages.safetensors !== "0.4.3" || payload.toolchain.packages.onnx !== "1.16.1"
    || payload.toolchain.packages.onnxruntime !== "1.18.1" || payload.toolchain.packages.numpy !== "1.26.4") {
    throw new Error("Invalid E5 tokenizer or export toolchain identity");
  }
  if (payload.export.opset !== E5_SMALL_ONNX_OPSET || payload.export.onnxPath !== "export/model.onnx"
    || payload.export.onnxByteSize <= 0 || !sha(payload.export.onnxSha256) || !sha(payload.export.secondExportSha256)
    || payload.export.inputNames.join(",") !== "input_ids,attention_mask" || payload.export.inputType !== "int64"
    || payload.export.outputName !== "last_hidden_state" || payload.export.outputType !== "float32"
    || payload.export.hiddenDimension !== E5_SMALL_HIDDEN_DIMENSION || payload.export.dynamicAxes !== "batch_size,sequence_length") {
    throw new Error("Invalid E5 ONNX export identity or graph contract");
  }
  if (payload.export.byteDeterministic !== (payload.export.onnxSha256 === payload.export.secondExportSha256)
    || payload.parity.suiteVersion !== "STHN_E5_SMALL_NON_FROZEN_PARITY_V1" || payload.parity.probeCount < 8
    || payload.parity.maxAbsoluteTolerance !== E5_SMALL_PARITY_MAX_ABSOLUTE_TOLERANCE
    || payload.parity.meanAbsoluteTolerance !== E5_SMALL_PARITY_MEAN_ABSOLUTE_TOLERANCE
    || payload.parity.minimumPooledCosineTolerance !== E5_SMALL_PARITY_MINIMUM_POOLED_COSINE
    || payload.parity.maxAbsoluteError > payload.parity.maxAbsoluteTolerance
    || payload.parity.meanAbsoluteError > payload.parity.meanAbsoluteTolerance
    || payload.parity.minimumPooledCosine < payload.parity.minimumPooledCosineTolerance || payload.parity.status !== "PASSED") {
    throw new Error("E5 export parity certification failed");
  }
  if (payload.nodeRuntime.nodeVersion !== "v20.19.6" || payload.nodeRuntime.onnxruntimeNodeVersion !== "1.27.0"
    || payload.nodeRuntime.tokenizersVersion !== "0.23.2" || payload.nodeRuntime.executionProvider !== "cpu"
    || !payload.nodeRuntime.dynamicBatchPassed || !payload.nodeRuntime.dynamicSequencePassed
    || payload.nodeRuntime.repeatedInferenceMaxAbsoluteDifference > 1e-7 || payload.nodeRuntime.status !== "PASSED") {
    throw new Error("E5 Node runtime certification failed");
  }
  if (payload.semanticContract.pooling !== "ATTENTION_MASK_AWARE_MEAN_POOLING_OUTSIDE_GRAPH"
    || payload.semanticContract.normalization !== "L2_OUTSIDE_GRAPH" || payload.semanticContract.similarity !== "COSINE_OUTSIDE_GRAPH"
    || payload.semanticContract.prefixPolicy !== "UNRESOLVED_FOR_SYMMETRIC_NEAR_DUPLICATE_CALIBRATION"
    || payload.boundaries.frozenBenchmarkAccessed || payload.boundaries.benchmarkTextProduced || payload.boundaries.benchmarkVectorsProduced
    || payload.boundaries.moderationBaseModel !== "FacebookAI/xlm-roberta-base" || payload.boundaries.trainingEligibleCount !== 0) {
    throw new Error("E5 semantic or dataset boundary changed");
  }
  if (!sha(manifestPayloadDigest) || manifestPayloadDigest !== digest(payload)) throw new Error("E5 manifest payload digest mismatch");
};
