import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import * as ort from "onnxruntime-node";
import { Tokenizer, TruncationStrategy } from "tokenizers";

import {
  ProviderEvaluationResult,
  RawProviderScalar,
  TextModerationEvaluationFixture,
  TextModerationEvaluationProvider,
} from "../textModerationEvaluation.types";

export const HIKMAAI_MODEL_ID = "HikmaAI/hikmaai-xlm-roberta-large-toxicity" as const;
export const HIKMAAI_MODEL_REVISION = "2c27bcd9a7df3e3a2453b8766f524341513dee37" as const;
export const HIKMAAI_ARTIFACT_NAME = "model_quantized.onnx" as const;
export const HIKMAAI_ARTIFACT_UPSTREAM_PATH = "onnx/int8/model_quantized.onnx" as const;
export const HIKMAAI_ARTIFACT_SHA256 = "b66e23667b483e8dc9f200586583753297ad65332d1fc3460bae91da6816dae6" as const;
export const HIKMAAI_TOKENIZER_SHA256 = "b74659c780d49afad7a7b9799868f75cbd3014fb6c34956e85a793028d38094a" as const;
export const HIKMAAI_THRESHOLD = 0.66 as const;
export const HIKMAAI_SEQUENCE_LENGTH = 512 as const;
export const HIKMAAI_NATIVE_LABELS = ["benign", "toxic"] as const;
export const HIKMAAI_POLICY_NAME = "HIKMAAI_PUBLISHER_BINARY_BASELINE_V1" as const;

export interface HikmaAiRuntimeMetadata {
  readonly artifactBytes: number;
  readonly artifactSha256: string;
  readonly tokenizerBytes: number;
  readonly tokenizerSha256: string;
  readonly modelLoadTimeMs: number;
  readonly rssBeforeLoadBytes: number;
  readonly rssAfterLoadBytes: number;
  readonly peakRssBytes: number;
  readonly cpu: string;
  readonly nodeVersion: string;
  readonly onnxRuntimeVersion: string;
  readonly tokenizerRuntimeVersion: string;
}

export interface HikmaAiInferenceObservation {
  readonly inputIds: readonly number[];
  readonly attentionMask: readonly number[];
  readonly tensorShape: readonly number[];
  readonly logits: readonly number[];
}

export interface HikmaAiInferenceRuntime {
  initialize(): Promise<HikmaAiRuntimeMetadata>;
  infer(text: string): Promise<HikmaAiInferenceObservation>;
  getPeakRssBytes(): number;
}

export interface HikmaAiEvaluationProviderOptions {
  artifactDirectory?: string;
  runtime?: HikmaAiInferenceRuntime;
}

const sha256File = (filePath: string): Promise<string> => new Promise((resolve, reject) => {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  stream.on("error", reject);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.on("end", () => resolve(hash.digest("hex")));
});

const packageVersion = (packageName: string): string => {
  try {
    return (require(`${packageName}/package.json`) as { version?: unknown }).version?.toString() ?? "unknown";
  } catch {
    return "unknown";
  }
};

export const defaultHikmaAiArtifactDirectory = () => path.resolve(
  process.cwd(), "evaluation-cache", "text-moderation", "hikmaai", HIKMAAI_MODEL_REVISION,
);

export class LocalHikmaAiInferenceRuntime implements HikmaAiInferenceRuntime {
  private readonly artifactDirectory: string;
  private tokenizer: Tokenizer | null = null;
  private session: ort.InferenceSession | null = null;
  private metadata: HikmaAiRuntimeMetadata | null = null;
  private peakRssBytes = process.memoryUsage().rss;

  constructor(artifactDirectory = defaultHikmaAiArtifactDirectory()) {
    this.artifactDirectory = path.resolve(artifactDirectory);
  }

  async initialize(): Promise<HikmaAiRuntimeMetadata> {
    if (this.metadata) return this.metadata;
    const modelPath = path.join(this.artifactDirectory, HIKMAAI_ARTIFACT_NAME);
    const tokenizerPath = path.join(this.artifactDirectory, "tokenizer.json");
    const configPath = path.join(this.artifactDirectory, "config.json");
    const thresholdPath = path.join(this.artifactDirectory, "threshold.json");
    const [modelStat, tokenizerStat, modelHash, tokenizerHash, configText, thresholdText] = await Promise.all([
      stat(modelPath), stat(tokenizerPath), sha256File(modelPath), sha256File(tokenizerPath),
      readFile(configPath, "utf8"), readFile(thresholdPath, "utf8"),
    ]);
    if (modelHash !== HIKMAAI_ARTIFACT_SHA256) {
      throw new Error(`HikmaAI artifact SHA-256 mismatch: ${modelHash}`);
    }
    if (tokenizerHash !== HIKMAAI_TOKENIZER_SHA256) {
      throw new Error(`HikmaAI tokenizer SHA-256 mismatch: ${tokenizerHash}`);
    }
    const config = JSON.parse(configText) as { architectures?: unknown; model_type?: unknown };
    if (!Array.isArray(config.architectures) || config.architectures[0] !== "XLMRobertaForSequenceClassification" ||
      config.model_type !== "xlm-roberta") {
      throw new Error("HikmaAI config does not match the pinned sequence-classification architecture");
    }
    const threshold = JSON.parse(thresholdText) as { threshold?: unknown };
    if (threshold.threshold !== HIKMAAI_THRESHOLD) {
      throw new Error("HikmaAI threshold.json does not match the pinned publisher threshold");
    }

    const rssBeforeLoadBytes = process.memoryUsage().rss;
    const startedAt = performance.now();
    this.tokenizer = Tokenizer.fromFile(tokenizerPath);
    this.tokenizer.setTruncation(HIKMAAI_SEQUENCE_LENGTH, {
      strategy: TruncationStrategy.LongestFirst,
      direction: "right",
      stride: 0,
    });
    this.tokenizer.disablePadding();
    this.session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["cpu"],
      graphOptimizationLevel: "all",
    });
    const modelLoadTimeMs = performance.now() - startedAt;
    if (this.session.inputNames.join(",") !== "input_ids,attention_mask" ||
      this.session.outputNames.join(",") !== "logits") {
      throw new Error("HikmaAI ONNX input/output names are unexpected");
    }
    const output = this.session.outputMetadata[0];
    if (!output || !output.isTensor || output.type !== "float32" || output.shape[output.shape.length - 1] !== 2) {
      throw new Error("HikmaAI ONNX output metadata is not float32 [batch, 2]");
    }
    const rssAfterLoadBytes = process.memoryUsage().rss;
    this.peakRssBytes = Math.max(this.peakRssBytes, rssBeforeLoadBytes, rssAfterLoadBytes);
    this.metadata = {
      artifactBytes: modelStat.size,
      artifactSha256: modelHash,
      tokenizerBytes: tokenizerStat.size,
      tokenizerSha256: tokenizerHash,
      modelLoadTimeMs,
      rssBeforeLoadBytes,
      rssAfterLoadBytes,
      peakRssBytes: this.peakRssBytes,
      cpu: os.cpus()[0]?.model ?? "unknown",
      nodeVersion: process.version,
      onnxRuntimeVersion: packageVersion("onnxruntime-node"),
      tokenizerRuntimeVersion: packageVersion("tokenizers"),
    };
    return this.metadata;
  }

  async infer(text: string): Promise<HikmaAiInferenceObservation> {
    if (!this.tokenizer || !this.session) throw new Error("HikmaAI runtime is not initialized");
    const encoded = await this.tokenizer.encode(text);
    const inputIds = encoded.getIds();
    const attentionMask = encoded.getAttentionMask();
    if (inputIds.length < 2 || inputIds.length > HIKMAAI_SEQUENCE_LENGTH ||
      inputIds.length !== attentionMask.length || inputIds[0] !== 0 || inputIds[inputIds.length - 1] !== 2 ||
      attentionMask.some((value) => value !== 1)) {
      throw new Error("HikmaAI tokenizer output violates the pinned batch-one dynamic-length contract");
    }
    const tensorShape = [1, inputIds.length];
    const outputs = await this.session.run({
      input_ids: new ort.Tensor("int64", BigInt64Array.from(inputIds, (value) => BigInt(value)), tensorShape),
      attention_mask: new ort.Tensor("int64", BigInt64Array.from(attentionMask, (value) => BigInt(value)), tensorShape),
    });
    const logits = outputs.logits;
    if (!logits || logits.type !== "float32" || logits.data.length !== 2 ||
      logits.dims.length !== 2 || logits.dims[0] !== 1 || logits.dims[1] !== 2) {
      throw new Error("HikmaAI returned a malformed logits tensor");
    }
    this.peakRssBytes = Math.max(this.peakRssBytes, process.memoryUsage().rss);
    return { inputIds, attentionMask, tensorShape, logits: Array.from(logits.data as Float32Array) };
  }

  getPeakRssBytes(): number {
    return this.peakRssBytes;
  }
}

export const softmaxBinaryLogits = (logits: readonly number[]): readonly [number, number] | null => {
  if (logits.length !== 2 || logits.some((value) => !Number.isFinite(value))) return null;
  const maximum = Math.max(...logits);
  const exponentials = logits.map((value) => Math.exp(value - maximum));
  const denominator = exponentials[0] + exponentials[1];
  const probabilities: [number, number] = [exponentials[0] / denominator, exponentials[1] / denominator];
  return probabilities.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    ? probabilities
    : null;
};

export const classifyHikmaAiToxicProbability = (toxicProbability: number) =>
  toxicProbability >= HIKMAAI_THRESHOLD ? "BLOCK" as const : "ALLOW" as const;

export const evaluateHikmaAiLogits = (logits: readonly number[]): ProviderEvaluationResult => {
  const probabilities = softmaxBinaryLogits(logits);
  if (!probabilities) return {
    status: "ERROR",
    errorCode: "HIKMAAI_MALFORMED_OUTPUT",
    raw: { summary: "HikmaAI returned missing or non-finite binary logits" },
  };
  const decision = classifyHikmaAiToxicProbability(probabilities[1]);
  return {
    status: "COMPLETED",
    decision,
    raw: {
      summary: `${HIKMAAI_POLICY_NAME}: ${decision}`,
      labels: HIKMAAI_NATIVE_LABELS.map((name, index) => ({
        name,
        score: probabilities[index],
        flagged: name === "toxic" ? probabilities[index] >= HIKMAAI_THRESHOLD : null,
      })),
      metadata: {
        provider: "HIKMAAI",
        actualModel: `${HIKMAAI_MODEL_ID}@${HIKMAAI_MODEL_REVISION}`,
        evaluationPolicy: HIKMAAI_POLICY_NAME,
        benignLogit: logits[0],
        toxicLogit: logits[1],
        probabilityTransformation: "two-class softmax",
        threshold: HIKMAAI_THRESHOLD,
        thresholdSource: "publisher optimized validation threshold",
        overallFlagged: decision === "BLOCK",
      },
    },
  };
};

export class HikmaAiTextModerationEvaluationProvider implements TextModerationEvaluationProvider {
  readonly id = "HIKMAAI_XLMR_BINARY_BASELINE_V1";
  readonly displayName = "HikmaAI XLM-R Large Toxicity local ONNX INT8";
  readonly requestedModel = `${HIKMAAI_MODEL_ID}@${HIKMAAI_MODEL_REVISION}`;

  private readonly runtime: HikmaAiInferenceRuntime;
  private runtimeMetadata: HikmaAiRuntimeMetadata | null = null;
  private initializationError = false;

  constructor(options: HikmaAiEvaluationProviderOptions = {}) {
    this.runtime = options.runtime ?? new LocalHikmaAiInferenceRuntime(options.artifactDirectory);
  }

  async initialize(): Promise<void> {
    if (this.runtimeMetadata) return;
    try {
      this.runtimeMetadata = await this.runtime.initialize();
    } catch (error) {
      this.initializationError = true;
      throw error;
    }
  }

  async inspect(text: string): Promise<HikmaAiInferenceObservation> {
    if (!this.runtimeMetadata) await this.initialize();
    return this.runtime.infer(text);
  }

  async evaluate(fixture: TextModerationEvaluationFixture): Promise<ProviderEvaluationResult> {
    if (!this.runtimeMetadata && !this.initializationError) {
      try { await this.initialize(); } catch { /* Converted to bounded unavailability below. */ }
    }
    if (!this.runtimeMetadata) return {
      status: "UNAVAILABLE",
      errorCode: "HIKMAAI_RUNTIME_UNAVAILABLE",
      raw: { summary: "Pinned local HikmaAI artifacts could not be loaded" },
    };
    const startedAt = performance.now();
    try {
      const observation = await this.runtime.infer(fixture.text);
      const result = evaluateHikmaAiLogits(observation.logits);
      if (!result.raw) return result;
      return {
        ...result,
        raw: {
          ...result.raw,
          metadata: {
            ...result.raw.metadata,
            activeTokenCount: observation.attentionMask.reduce((sum, value) => sum + value, 0),
            tensorShape: observation.tensorShape.join("x"),
            inferenceLatencyMs: performance.now() - startedAt,
          },
        },
      };
    } catch {
      return {
        status: "ERROR",
        errorCode: "HIKMAAI_INFERENCE_FAILED",
        raw: { summary: "Local HikmaAI inference failed" },
      };
    }
  }

  getReportMetadata(): Readonly<Record<string, RawProviderScalar>> {
    const runtime = this.runtimeMetadata;
    return {
      upstreamModel: HIKMAAI_MODEL_ID,
      modelRevision: HIKMAAI_MODEL_REVISION,
      artifactName: HIKMAAI_ARTIFACT_UPSTREAM_PATH,
      license: "Apache-2.0 (base model MIT)",
      baseModel: "FacebookAI/xlm-roberta-large",
      nativeLabels: HIKMAAI_NATIVE_LABELS.join(","),
      outputSemantics: "float32 logits [batch, benign=0|toxic=1]",
      probabilityTransformation: "two-class softmax",
      evaluationPolicy: HIKMAAI_POLICY_NAME,
      threshold: HIKMAAI_THRESHOLD,
      thresholdSource: "publisher threshold.json optimized validation threshold",
      effectiveSequenceLength: HIKMAAI_SEQUENCE_LENGTH,
      padding: "disabled for batch-one dynamic sequence",
      truncation: "right at 512 tokens including special tokens",
      executionProvider: "CPUExecutionProvider",
      gpuUsed: false,
      ...(runtime ? {
        artifactBytes: runtime.artifactBytes,
        artifactSha256: runtime.artifactSha256,
        tokenizerBytes: runtime.tokenizerBytes,
        tokenizerSha256: runtime.tokenizerSha256,
        modelLoadTimeMs: runtime.modelLoadTimeMs,
        rssBeforeLoadBytes: runtime.rssBeforeLoadBytes,
        rssAfterLoadBytes: runtime.rssAfterLoadBytes,
        peakRssBytes: this.runtime.getPeakRssBytes(),
        cpu: runtime.cpu,
        nodeVersion: runtime.nodeVersion,
        onnxRuntimeVersion: runtime.onnxRuntimeVersion,
        tokenizerRuntimeVersion: runtime.tokenizerRuntimeVersion,
      } : {}),
    };
  }
}
