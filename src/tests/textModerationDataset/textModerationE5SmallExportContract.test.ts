import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  E5_SMALL_EXPORT_PURPOSE, E5_SMALL_EXPORT_SCHEMA_VERSION, E5_SMALL_MODEL_LICENSE, E5_SMALL_MODEL_REPOSITORY,
  E5_SMALL_MODEL_REVISION, E5_SMALL_SOURCE_SHA256, E5SmallExportManifestPayload, validateE5SmallExportManifest,
  withE5SmallManifestDigest,
} from "../../research/textModerationDataset/semanticSimilarity/e5SmallExportContract";

const payload = (): E5SmallExportManifestPayload => ({
  schemaVersion: E5_SMALL_EXPORT_SCHEMA_VERSION, purpose: E5_SMALL_EXPORT_PURPOSE, compatibilityStatus: "CERTIFIED",
  source: { repository: E5_SMALL_MODEL_REPOSITORY, revision: E5_SMALL_MODEL_REVISION, license: E5_SMALL_MODEL_LICENSE,
    artifacts: Object.entries(E5_SMALL_SOURCE_SHA256).map(([name, sha256]) => ({ path: name as keyof typeof E5_SMALL_SOURCE_SHA256,
      sourceUrl: `https://huggingface.co/${E5_SMALL_MODEL_REPOSITORY}/resolve/${E5_SMALL_MODEL_REVISION}/${name}`,
      byteSize: 1, sha256, retrievedAt: "2026-09-11T00:00:00.000Z" })) },
  tokenizer: { path: "source/tokenizer.json", sha256: E5_SMALL_SOURCE_SHA256["tokenizer.json"], certificationStatus: "PASSED" },
  toolchain: { isolation: "UV_MANAGED_IGNORED_VENV", pythonVersion: "3.12.10", packages: { torch: "2.3.1", transformers: "4.42.4", safetensors: "0.4.3", onnx: "1.16.1", onnxruntime: "1.18.1", numpy: "1.26.4" } },
  export: { recipe: "pinned", opset: 17, onnxPath: "export/model.onnx", onnxByteSize: 1, onnxSha256: "a".repeat(64), secondExportSha256: "a".repeat(64),
    byteDeterministic: true, inputNames: ["input_ids", "attention_mask"], inputType: "int64", outputName: "last_hidden_state", outputType: "float32", hiddenDimension: 384, dynamicAxes: "batch_size,sequence_length" },
  parity: { suiteVersion: "STHN_E5_SMALL_NON_FROZEN_PARITY_V1", probeCount: 10, maxAbsoluteError: 1e-6, meanAbsoluteError: 1e-7,
    minimumPooledCosine: 1, maxAbsoluteTolerance: 1e-4, meanAbsoluteTolerance: 1e-5, minimumPooledCosineTolerance: 0.999999, status: "PASSED" },
  nodeRuntime: { nodeVersion: "v20.19.6", onnxruntimeNodeVersion: "1.27.0", tokenizersVersion: "0.23.2", executionProvider: "cpu",
    dynamicBatchPassed: true, dynamicSequencePassed: true, repeatedInferenceMaxAbsoluteDifference: 0, status: "PASSED" },
  semanticContract: { pooling: "ATTENTION_MASK_AWARE_MEAN_POOLING_OUTSIDE_GRAPH", normalization: "L2_OUTSIDE_GRAPH", similarity: "COSINE_OUTSIDE_GRAPH", prefixPolicy: "UNRESOLVED_FOR_SYMMETRIC_NEAR_DUPLICATE_CALIBRATION" },
  boundaries: { frozenBenchmarkAccessed: false, benchmarkTextProduced: false, benchmarkVectorsProduced: false, moderationBaseModel: "FacebookAI/xlm-roberta-base", trainingEligibleCount: 0 },
  generatedAt: "2026-09-11T00:00:00.000Z",
});

test("GX accepts the exact pinned semantic-only export authority", () => assert.doesNotThrow(() => validateE5SmallExportManifest(withE5SmallManifestDigest(payload()))));
test("GX rejects repository or revision substitution", () => { for (const source of [{ repository: "other/model" }, { revision: "main" }]) { const value: any = payload(); value.source = { ...value.source, ...source }; assert.throws(() => validateE5SmallExportManifest(withE5SmallManifestDigest(value)), /authority/); } });
test("GX requires every pinned source SHA", () => { const value: any = payload(); value.source.artifacts[0].sha256 = "0".repeat(64); assert.throws(() => validateE5SmallExportManifest(withE5SmallManifestDigest(value)), /source artifact/); });
test("GX requires tokenizer, ONNX and toolchain identity", () => { const values: any[] = [payload(), payload(), payload()]; values[0].tokenizer.sha256 = "0".repeat(64); values[1].export.onnxSha256 = "bad"; values[2].toolchain.packages.torch = "latest"; for (const value of values) assert.throws(() => validateE5SmallExportManifest(withE5SmallManifestDigest(value))); });
test("GX remains semantic-audit-only with XLM-R moderation authority", () => { const value: any = payload(); value.purpose = "MODERATION"; assert.throws(() => validateE5SmallExportManifest(withE5SmallManifestDigest(value))); const moderation: any = payload(); moderation.boundaries.moderationBaseModel = "intfloat/multilingual-e5-small"; assert.throws(() => validateE5SmallExportManifest(withE5SmallManifestDigest(moderation)), /boundary/); });
test("GX preserves trainingEligible zero and frozen isolation", () => { for (const change of [{ trainingEligibleCount: 1 }, { frozenBenchmarkAccessed: true }, { benchmarkVectorsProduced: true }]) { const value: any = payload(); value.boundaries = { ...value.boundaries, ...change }; assert.throws(() => validateE5SmallExportManifest(withE5SmallManifestDigest(value)), /boundary/); } });
test("GX tooling never imports the frozen fixture loader", () => { const files = ["src/research/textModerationDataset/semanticSimilarity/e5SmallExportContract.ts", "src/research/textModerationDataset/semanticSimilarity/export_e5_small_onnx.py", "src/scripts/certifyE5SmallNodeRuntime.ts", "src/scripts/createE5SmallExportManifest.ts"]; const source = files.map((file) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8")).join("\n"); assert.doesNotMatch(source, /textModerationFixtures|textModerationEvaluationFixtures|FROZEN_TEXT_MODERATION_FIXTURE/); });
