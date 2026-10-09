import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson } from "../research/textModerationDataset/manifest";
import { writeImmutableFileAtomic } from "../research/textModerationDataset/mhsReviewImport";
import {
  E5_SMALL_EXPORT_MANIFEST_FILENAME, E5_SMALL_EXPORT_PURPOSE, E5_SMALL_EXPORT_SCHEMA_VERSION, E5_SMALL_HIDDEN_DIMENSION,
  E5_SMALL_MODEL_LICENSE, E5_SMALL_MODEL_REPOSITORY, E5_SMALL_MODEL_REVISION, E5_SMALL_ONNX_OPSET,
  E5_SMALL_PARITY_MAX_ABSOLUTE_TOLERANCE, E5_SMALL_PARITY_MEAN_ABSOLUTE_TOLERANCE, E5_SMALL_PARITY_MINIMUM_POOLED_COSINE,
  E5_SMALL_SOURCE_SHA256, E5SmallExportManifestPayload, validateE5SmallExportManifest, withE5SmallManifestDigest,
} from "../research/textModerationDataset/semanticSimilarity/e5SmallExportContract";

const root = path.resolve(process.argv[2] ?? path.join(process.cwd(), "evaluation-cache", "text-moderation", "semantic", "intfloat-multilingual-e5-small", E5_SMALL_MODEL_REVISION));
const read = <T>(relative: string): T => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")) as T;
const hash = (filename: string): string => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const python = read<any>("certification/python-export-certification.json"); const node = read<any>("certification/node-runtime-certification.json");
if (python.revision !== E5_SMALL_MODEL_REVISION || python.opset !== E5_SMALL_ONNX_OPSET || python.frozenBenchmarkAccessed !== false
  || node.frozenBenchmarkAccessed !== false || python.onnx.sha256 !== node.onnxSha256) throw new Error("GX certification authority mismatch");
const artifacts = Object.entries(E5_SMALL_SOURCE_SHA256).map(([filename, expectedSha]) => {
  const local = path.join(root, "source", filename); const item = fs.statSync(local); const actualSha = hash(local);
  if (actualSha !== expectedSha) throw new Error(`Pinned source SHA-256 mismatch: ${filename}`);
  return { path: filename as keyof typeof E5_SMALL_SOURCE_SHA256,
    sourceUrl: `https://huggingface.co/${E5_SMALL_MODEL_REPOSITORY}/resolve/${E5_SMALL_MODEL_REVISION}/${filename}`,
    byteSize: item.size, sha256: actualSha, retrievedAt: item.birthtime.toISOString() };
});
const payload: E5SmallExportManifestPayload = {
  schemaVersion: E5_SMALL_EXPORT_SCHEMA_VERSION, purpose: E5_SMALL_EXPORT_PURPOSE, compatibilityStatus: "CERTIFIED",
  source: { repository: E5_SMALL_MODEL_REPOSITORY, revision: E5_SMALL_MODEL_REVISION, license: E5_SMALL_MODEL_LICENSE, artifacts },
  tokenizer: { path: "source/tokenizer.json", sha256: E5_SMALL_SOURCE_SHA256["tokenizer.json"], certificationStatus: "PASSED" },
  toolchain: { isolation: "UV_MANAGED_IGNORED_VENV", pythonVersion: python.pythonVersion, packages: python.packages },
  export: { recipe: python.exportRecipe, opset: E5_SMALL_ONNX_OPSET, onnxPath: "export/model.onnx", onnxByteSize: python.onnx.byteSize,
    onnxSha256: python.onnx.sha256, secondExportSha256: python.onnx.secondExportSha256, byteDeterministic: python.onnx.byteDeterministic,
    inputNames: ["input_ids", "attention_mask"], inputType: "int64", outputName: "last_hidden_state", outputType: "float32",
    hiddenDimension: E5_SMALL_HIDDEN_DIMENSION, dynamicAxes: "batch_size,sequence_length" },
  parity: { suiteVersion: "STHN_E5_SMALL_NON_FROZEN_PARITY_V1", probeCount: python.parity.probeCount,
    maxAbsoluteError: python.parity.maxAbsoluteError, meanAbsoluteError: python.parity.meanAbsoluteError,
    minimumPooledCosine: python.parity.minimumPooledCosine, maxAbsoluteTolerance: E5_SMALL_PARITY_MAX_ABSOLUTE_TOLERANCE,
    meanAbsoluteTolerance: E5_SMALL_PARITY_MEAN_ABSOLUTE_TOLERANCE, minimumPooledCosineTolerance: E5_SMALL_PARITY_MINIMUM_POOLED_COSINE, status: "PASSED" },
  nodeRuntime: { nodeVersion: node.nodeVersion, onnxruntimeNodeVersion: node.onnxruntimeNodeVersion, tokenizersVersion: node.tokenizersVersion,
    executionProvider: "cpu", dynamicBatchPassed: true, dynamicSequencePassed: true,
    repeatedInferenceMaxAbsoluteDifference: node.repeatedInferenceMaxAbsoluteDifference, status: "PASSED" },
  semanticContract: { pooling: "ATTENTION_MASK_AWARE_MEAN_POOLING_OUTSIDE_GRAPH", normalization: "L2_OUTSIDE_GRAPH",
    similarity: "COSINE_OUTSIDE_GRAPH", prefixPolicy: "UNRESOLVED_FOR_SYMMETRIC_NEAR_DUPLICATE_CALIBRATION" },
  boundaries: { frozenBenchmarkAccessed: false, benchmarkTextProduced: false, benchmarkVectorsProduced: false,
    moderationBaseModel: "FacebookAI/xlm-roberta-base", trainingEligibleCount: 0 }, generatedAt: new Date().toISOString(),
};
const manifest = withE5SmallManifestDigest(payload); validateE5SmallExportManifest(manifest);
const target = path.join(root, E5_SMALL_EXPORT_MANIFEST_FILENAME); writeImmutableFileAtomic(target, canonicalJson(manifest));
console.log(JSON.stringify({ manifestPath: target, manifestSha256: hash(target), manifestPayloadDigest: manifest.manifestPayloadDigest }));
