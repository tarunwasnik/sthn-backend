import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import * as ort from "onnxruntime-node";
import { PaddingDirection, Tokenizer, TruncationStrategy } from "tokenizers";

import {
  E5_SMALL_EXPORT_MANIFEST_FILENAME, E5_SMALL_HIDDEN_DIMENSION, E5_SMALL_MODEL_REVISION,
  E5_SMALL_SOURCE_SHA256, E5SmallExportManifest, validateE5SmallExportManifest,
} from "./e5SmallExportContract";

export const E5_SMALL_GX_MANIFEST_SHA256 = "af28451d28ca3de53d914988536a2ad97ff13b1b03766dd1bfe798ec7671ae12" as const;
export const E5_SMALL_GX_MANIFEST_PAYLOAD_DIGEST = "1cf6ebd132eab388fa27fc7fcd905da204b505b55d55b13da18af6d65856718b" as const;
export const E5_SEMANTIC_ADAPTER_VERSION = "STHN_E5_SMALL_NODE_SEMANTIC_ADAPTER_V1" as const;
export const E5_SEMANTIC_MAX_BATCH_SIZE = 16 as const;
export const E5_SEMANTIC_MAX_INPUT_CHARACTERS = 4_000 as const;
export type E5Prefix = "query" | "passage";

export interface E5TokenHiddenObservation {
  readonly batchSize: number;
  readonly sequenceLength: number;
  readonly attentionMask: readonly number[];
  readonly lastHiddenState: readonly number[];
}

export interface E5TokenHiddenRuntime {
  initialize(): Promise<void>;
  infer(texts: readonly string[], prefix: E5Prefix): Promise<E5TokenHiddenObservation>;
}

const shaFile = (filename: string): string => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
export const defaultE5SmallArtifactRoot = (): string => path.resolve(process.cwd(), "evaluation-cache", "text-moderation", "semantic",
  "intfloat-multilingual-e5-small", E5_SMALL_MODEL_REVISION);

export const meanPoolTokenHiddenState = (observation: E5TokenHiddenObservation): readonly number[][] => {
  const { batchSize, sequenceLength, attentionMask, lastHiddenState } = observation;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > E5_SEMANTIC_MAX_BATCH_SIZE || !Number.isInteger(sequenceLength) || sequenceLength < 2 || sequenceLength > 512
    || attentionMask.length !== batchSize * sequenceLength || lastHiddenState.length !== batchSize * sequenceLength * E5_SMALL_HIDDEN_DIMENSION
    || attentionMask.some((value) => value !== 0 && value !== 1) || lastHiddenState.some((value) => !Number.isFinite(value))) throw new Error("Invalid E5 token-hidden observation");
  return Array.from({ length: batchSize }, (_, batch) => {
    const result = new Array<number>(E5_SMALL_HIDDEN_DIMENSION).fill(0); let active = 0;
    for (let token = 0; token < sequenceLength; token += 1) {
      if (attentionMask[batch * sequenceLength + token] !== 1) continue; active += 1;
      const offset = (batch * sequenceLength + token) * E5_SMALL_HIDDEN_DIMENSION;
      for (let dimension = 0; dimension < E5_SMALL_HIDDEN_DIMENSION; dimension += 1) result[dimension] += lastHiddenState[offset + dimension];
    }
    if (!active) throw new Error("E5 attention mask contains no active tokens");
    return result.map((value) => value / active);
  });
};

export const normalizeSemanticEmbeddingL2 = (embedding: readonly number[]): number[] => {
  if (embedding.length !== E5_SMALL_HIDDEN_DIMENSION || embedding.some((value) => !Number.isFinite(value))) throw new Error("Invalid E5 embedding");
  const squaredNorm = embedding.reduce((sum, value) => sum + value * value, 0);
  if (!Number.isFinite(squaredNorm) || squaredNorm <= Number.EPSILON) throw new Error("Invalid E5 embedding norm");
  const norm = Math.sqrt(squaredNorm); return embedding.map((value) => value / norm);
};

export const semanticCosineSimilarity = (left: readonly number[], right: readonly number[]): number => {
  if (left.length !== E5_SMALL_HIDDEN_DIMENSION || right.length !== E5_SMALL_HIDDEN_DIMENSION
    || left.some((value) => !Number.isFinite(value)) || right.some((value) => !Number.isFinite(value))) throw new Error("Invalid E5 cosine input");
  const similarity = left.reduce((sum, value, index) => sum + value * right[index], 0);
  if (!Number.isFinite(similarity) || similarity < -1.000001 || similarity > 1.000001) throw new Error("Invalid E5 cosine result");
  return Math.max(-1, Math.min(1, similarity));
};

export class LocalE5SmallTokenHiddenRuntime implements E5TokenHiddenRuntime {
  private readonly root: string;
  private tokenizer: Tokenizer | null = null;
  private session: ort.InferenceSession | null = null;

  constructor(root = defaultE5SmallArtifactRoot()) { this.root = path.resolve(root); }

  async initialize(): Promise<void> {
    if (this.tokenizer && this.session) return;
    const manifestPath = path.join(this.root, E5_SMALL_EXPORT_MANIFEST_FILENAME); const manifestBytes = fs.readFileSync(manifestPath);
    if (crypto.createHash("sha256").update(manifestBytes).digest("hex") !== E5_SMALL_GX_MANIFEST_SHA256) throw new Error("GX manifest SHA-256 mismatch");
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as E5SmallExportManifest; validateE5SmallExportManifest(manifest);
    if (manifest.manifestPayloadDigest !== E5_SMALL_GX_MANIFEST_PAYLOAD_DIGEST) throw new Error("GX manifest payload digest mismatch");
    const onnxPath = path.join(this.root, manifest.export.onnxPath); const tokenizerPath = path.join(this.root, manifest.tokenizer.path);
    if (fs.statSync(onnxPath).size !== manifest.export.onnxByteSize || shaFile(onnxPath) !== manifest.export.onnxSha256) throw new Error("Certified E5 ONNX identity mismatch");
    if (shaFile(tokenizerPath) !== E5_SMALL_SOURCE_SHA256["tokenizer.json"] || manifest.tokenizer.sha256 !== E5_SMALL_SOURCE_SHA256["tokenizer.json"]) throw new Error("Certified E5 tokenizer identity mismatch");
    this.tokenizer = Tokenizer.fromFile(tokenizerPath); this.tokenizer.setTruncation(512, { strategy: TruncationStrategy.LongestFirst, direction: "right", stride: 0 });
    this.tokenizer.setPadding({ direction: PaddingDirection.Right, padId: 1, padTypeId: 0, padToken: "<pad>" });
    this.session = await ort.InferenceSession.create(onnxPath, { executionProviders: ["cpu"], graphOptimizationLevel: "all" });
    if (this.session.inputNames.join(",") !== "input_ids,attention_mask" || this.session.outputNames.join(",") !== "last_hidden_state") throw new Error("Certified E5 runtime names changed");
  }

  async infer(texts: readonly string[], prefix: E5Prefix): Promise<E5TokenHiddenObservation> {
    if (!this.tokenizer || !this.session) await this.initialize();
    if (!texts.length || texts.length > E5_SEMANTIC_MAX_BATCH_SIZE || texts.some((text) => typeof text !== "string" || [...text].length > E5_SEMANTIC_MAX_INPUT_CHARACTERS)
      || (prefix !== "query" && prefix !== "passage")) throw new Error("Invalid bounded E5 semantic batch");
    const encodings = await this.tokenizer!.encodeBatch(texts.map((text) => `${prefix}: ${text}`)); const sequenceLength = encodings[0].getIds().length;
    if (sequenceLength < 2 || sequenceLength > 512 || encodings.some((item) => item.getIds().length !== sequenceLength || item.getAttentionMask().length !== sequenceLength)) throw new Error("E5 tokenizer returned an invalid batch");
    const inputIds = encodings.flatMap((item) => item.getIds()); const attentionMask = encodings.flatMap((item) => item.getAttentionMask());
    const shape = [texts.length, sequenceLength]; const output = (await this.session!.run({
      input_ids: new ort.Tensor("int64", BigInt64Array.from(inputIds, BigInt), shape),
      attention_mask: new ort.Tensor("int64", BigInt64Array.from(attentionMask, BigInt), shape),
    })).last_hidden_state;
    if (!output || output.type !== "float32" || output.dims.length !== 3 || output.dims[0] !== texts.length
      || output.dims[1] !== sequenceLength || output.dims[2] !== E5_SMALL_HIDDEN_DIMENSION) throw new Error("E5 last_hidden_state violates the certified contract");
    const values = Array.from(output.data as Float32Array); if (values.some((value) => !Number.isFinite(value))) throw new Error("E5 output contains non-finite values");
    return { batchSize: texts.length, sequenceLength, attentionMask, lastHiddenState: values };
  }
}

export class E5SemanticSimilarityAdapter {
  readonly version = E5_SEMANTIC_ADAPTER_VERSION;
  constructor(private readonly runtime: E5TokenHiddenRuntime = new LocalE5SmallTokenHiddenRuntime()) {}
  async initialize(): Promise<void> { await this.runtime.initialize(); }
  async embedBatch(texts: readonly string[], prefix: E5Prefix): Promise<readonly number[][]> {
    return meanPoolTokenHiddenState(await this.runtime.infer(texts, prefix)).map(normalizeSemanticEmbeddingL2);
  }
}
